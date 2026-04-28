import * as vscode from 'vscode';
import WebSocket = require('ws');
import * as http from 'http';

export class ZombieDanceManager {
    private ws: WebSocket | null = null;
    private statusBarItem: vscode.StatusBarItem;
    private outputChannel: vscode.OutputChannel;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 5;
    private reconnectDelay = 2000;

    constructor(private context: vscode.ExtensionContext) {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
        this.statusBarItem.command = 'zombie-dance.connectServer';
        this.outputChannel = vscode.window.createOutputChannel('Zombie Dance AI');

        this.updateStatus('Disconnected', '$(debug-disconnect)');
        this.statusBarItem.show();
    }

    private getAgentId(): number {
        const config = vscode.workspace.getConfiguration('zombie-dance');
        const raw = config.get<any>('agentId');
        const parsed = typeof raw === 'number' ? raw : parseInt(String(raw || ''), 10);
        return Number.isNaN(parsed) ? 1 : parsed;
    }

    private getApiKey(): string {
        const config = vscode.workspace.getConfiguration('zombie-dance');
        return config.get<string>('apiKey') || '';
    }

    private async httpGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const u = new URL(url);
            const req = http.request({
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'GET',
                headers,
                timeout: 10000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk.toString());
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body || '{}'));
                    } catch (e) {
                        resolve(body);
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.end();
        });
    }

    private async httpPostJson(url: string, payload: any, headers: Record<string, string> = {}): Promise<any> {
        return new Promise((resolve, reject) => {
            const u = new URL(url);
            const data = JSON.stringify(payload ?? {});
            const req = http.request({
                hostname: u.hostname,
                port: u.port || (u.protocol === 'https:' ? 443 : 80),
                path: u.pathname + u.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                    ...headers
                },
                timeout: 30000
            }, (res) => {
                let body = '';
                res.on('data', (chunk) => body += chunk.toString());
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(body || '{}'));
                    } catch (e) {
                        resolve(body);
                    }
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            req.write(data);
            req.end();
        });
    }

    async mcpListTools(): Promise<void> {
        const config = vscode.workspace.getConfiguration('zombie-dance');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:8000';
        const agentId = this.getAgentId();
        const url = serverUrl.replace(/\/$/, '') + `/mcp/tools?agentId=${encodeURIComponent(String(agentId))}`;

        try {
            this.outputChannel.show(true);
            this.outputChannel.appendLine(`📦 MCP: fetching tools from ${url}`);
            const data = await this.httpGetJson(url);
            const tools = (data && data.tools) ? data.tools : (Array.isArray(data) ? data : []);
            if (!Array.isArray(tools) || tools.length === 0) {
                this.outputChannel.appendLine('ℹ️ MCP: no tools returned');
                vscode.window.showInformationMessage('MCP: No tools returned from server');
                return;
            }

            this.outputChannel.appendLine('--- MCP Tools ---');
            for (const t of tools) {
                this.outputChannel.appendLine(`- ${t.name} (${t.category})${t.isActive === false ? ' [inactive]' : ''}`);
                if (t.description) this.outputChannel.appendLine(`  ${t.description}`);
            }
            vscode.window.showInformationMessage(`MCP: Loaded ${tools.length} tools`);
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ MCP list tools failed: ${error?.message || error}`);
            vscode.window.showErrorMessage(`MCP list tools failed: ${error?.message || error}`);
        }
    }

    async mcpExecuteToolInteractive(): Promise<void> {
        const config = vscode.workspace.getConfiguration('zombie-dance');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:8000';
        const apiKey = this.getApiKey();
        const url = serverUrl.replace(/\/$/, '') + '/mcp/execute';

        try {
            const agentId = this.getAgentId();
            const listUrl = serverUrl.replace(/\/$/, '') + `/mcp/tools?agentId=${encodeURIComponent(String(agentId))}`;
            const data = await this.httpGetJson(listUrl);
            const tools = (data && data.tools) ? data.tools : [];
            const toolNames = Array.isArray(tools)
                ? tools.filter((t: any) => t && t.isActive !== false).map((t: any) => t.name)
                : [];

            const picked = await vscode.window.showQuickPick(toolNames.length ? toolNames : ['calculator', 'datetime', 'file_read', 'shell_exec'], {
                placeHolder: 'Select an MCP tool to execute'
            });
            if (!picked) return;

            const input = await vscode.window.showInputBox({
                prompt: `Input for tool '${picked}' (string or JSON)`,
                placeHolder: 'e.g. 2+2  OR  {"path":"work/new/RUNBOOK.md"}'
            });
            if (typeof input !== 'string') return;

            let parsed: any = input;
            const trimmed = input.trim();
            if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                try {
                    parsed = JSON.parse(trimmed);
                } catch {
                    parsed = input;
                }
            }

            const headers: Record<string, string> = {};
            if (apiKey) {
                headers['X-API-Key'] = apiKey;
            }

            this.outputChannel.show(true);
            this.outputChannel.appendLine(`▶️ MCP execute: ${picked}`);
            const res = await this.httpPostJson(url, { agentId, toolName: picked, input: parsed }, headers);

            this.outputChannel.appendLine('--- MCP Result ---');
            this.outputChannel.appendLine(typeof res === 'string' ? res : JSON.stringify(res, null, 2));

            if (res && res.success === false) {
                vscode.window.showErrorMessage(`MCP tool failed: ${res.error || 'Unknown error'}`);
            } else {
                vscode.window.showInformationMessage(`MCP: Tool '${picked}' executed`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ MCP execute failed: ${error?.message || error}`);
            vscode.window.showErrorMessage(`MCP execute failed: ${error?.message || error}`);
        }
    }

    async connect(): Promise<void> {
        const config = vscode.workspace.getConfiguration('zombie-dance');
        const serverUrl = config.get<string>('serverUrl') || 'http://localhost:8000';

        try {
            // Test HTTP connection first
            await this.testHttpConnection(serverUrl);

            // Connect WebSocket
            const wsUrl = serverUrl.replace('http', 'ws') + '/ws';
            this.ws = new WebSocket(wsUrl);

            if (this.ws) {
                this.ws.on('open', () => {
                    this.outputChannel.appendLine('✅ Connected to Zombie Dance server');
                    this.updateStatus('Connected', '$(plug)');
                    vscode.commands.executeCommand('setContext', 'zombie-dance.connected', true);
                    this.reconnectAttempts = 0;

                    vscode.window.showInformationMessage('Zombie Dance AI connected successfully!');
                });

                this.ws.on('message', (data: WebSocket.Data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleMessage(message);
                    } catch (error) {
                        this.outputChannel.appendLine(`❌ Failed to parse message: ${error}`);
                    }
                });

                this.ws.on('close', () => {
                    this.outputChannel.appendLine('🔌 Disconnected from server');
                    this.updateStatus('Disconnected', '$(debug-disconnect)');
                    vscode.commands.executeCommand('setContext', 'zombie-dance.connected', false);

                    // Auto-reconnect
                    if (this.reconnectAttempts < this.maxReconnectAttempts) {
                        this.reconnectAttempts++;
                        setTimeout(() => {
                            this.outputChannel.appendLine(`🔄 Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                            this.connect();
                        }, this.reconnectDelay * this.reconnectAttempts);
                    }
                });

                this.ws.on('error', (error: Error) => {
                    this.outputChannel.appendLine(`❌ WebSocket error: ${error.message}`);
                    vscode.window.showErrorMessage(`Zombie Dance connection failed: ${error.message}`);
                });
            }

        } catch (error) {
            this.outputChannel.appendLine(`❌ Connection failed: ${error}`);
            vscode.window.showErrorMessage(`Failed to connect to Zombie Dance server: ${error}`);
        }
    }

    disconnect(): void {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.updateStatus('Disconnected', '$(debug-disconnect)');
        vscode.commands.executeCommand('setContext', 'zombie-dance.connected', false);
        vscode.window.showInformationMessage('Zombie Dance AI disconnected');
    }

    private async testHttpConnection(serverUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const url = new URL(serverUrl + '/health');
            const req = http.request({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'GET',
                timeout: 5000
            }, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    reject(new Error(`Server returned status ${res.statusCode}`));
                }
            });

            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Connection timeout'));
            });

            req.end();
        });
    }

    private handleMessage(message: any): void {
        switch (message.type) {
            case 'agent_response':
                this.outputChannel.appendLine(`🤖 Agent: ${message.data.response}`);
                break;
            case 'server_status':
                this.outputChannel.appendLine(`📊 Server: ${message.data.status}`);
                break;
            default:
                this.outputChannel.appendLine(`📨 Unknown message type: ${message.type}`);
        }
    }

    private updateStatus(text: string, icon: string): void {
        this.statusBarItem.text = `${icon} Zombie Dance: ${text}`;
        this.statusBarItem.tooltip = `Zombie Dance AI - ${text}`;
        this.statusBarItem.command = this.ws ? 'zombie-dance.disconnectServer' : 'zombie-dance.connectServer';
    }

    dispose(): void {
        this.disconnect();
        this.statusBarItem.dispose();
        this.outputChannel.dispose();
    }
}

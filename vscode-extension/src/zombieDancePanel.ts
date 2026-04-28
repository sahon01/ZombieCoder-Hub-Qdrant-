import * as vscode from 'vscode';
import * as path from 'path';

export class ZombieDancePanel {
    public static currentPanel: ZombieDancePanel | undefined;
    private readonly _panel: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it.
        if (ZombieDancePanel.currentPanel) {
            ZombieDancePanel.currentPanel._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel.
        const panel = vscode.window.createWebviewPanel(
            ZombieDancePanel.viewType,
            'Zombie Dance AI',
            column || vscode.ViewColumn.One,
            {
                // Enable javascript in the webview
                enableScripts: true,
                // And restrict the webview to only loading content from our extension's directory.
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        );

        ZombieDancePanel.currentPanel = new ZombieDancePanel(panel, extensionUri);
    }

    public static readonly viewType = 'zombieDance';

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;

        // Set the webview's initial html content
        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview, extensionUri);

        // Listen for when the panel is disposed
        // This happens when the user closes the panel or when the panel is closed programmatically
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'sendToServer':
                        // Forward message to extension
                        vscode.commands.executeCommand('zombie-dance.sendToServer', message.data);
                        break;
                    case 'openFile':
                        vscode.workspace.openTextDocument(message.path).then(doc => {
                            vscode.window.showTextDocument(doc);
                        });
                        break;
                    case 'saveFile':
                        const editor = vscode.window.activeTextEditor;
                        if (editor) {
                            editor.edit(editBuilder => {
                                editBuilder.replace(
                                    new vscode.Range(
                                        new vscode.Position(0, 0),
                                        editor.document.positionAt(editor.document.getText().length)
                                    ),
                                    message.content
                                );
                            });
                        }
                        break;
                }
            },
            undefined,
            this._disposables
        );
    }

    public dispose() {
        ZombieDancePanel.currentPanel = undefined;

        // Clean up our resources
        this._panel.dispose();

        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) {
                x.dispose();
            }
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, extensionUri: vscode.Uri) {
        // Use the existing HTML from ex_ui folder but modify it for VS Code integration
        const htmlPath = path.join(extensionUri.fsPath, '..', '..', 'ex_ui', 'ui.html');

        // For now, create a simplified version that works with VS Code
        return `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' https://cdnjs.cloudflare.com; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'unsafe-inline' data:;">
            <title>Zombie Dance AI | VS Code Integration</title>
            <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
            <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/xterm@5.1.0/css/xterm.css" />
            <script src="https://cdn.jsdelivr.net/npm/xterm@5.1.0/lib/xterm.js"></script>
            
            <style>
                :root {
                    --bg-main: #0b0d11;
                    --sidebar-bg: #0f1117;
                    --zombie-green: #10b981;
                    --terminal-bg: #000000;
                    --glass: rgba(255, 255, 255, 0.03);
                    --border: rgba(255, 255, 255, 0.1);
                    --vscode-bg: var(--vscode-editor-background);
                    --vscode-fg: var(--vscode-editor-foreground);
                }

                body, html {
                    margin: 0; padding: 0;
                    background: var(--vscode-bg);
                    color: var(--vscode-fg);
                    font-family: var(--vscode-font-family);
                    overflow: hidden;
                    height: 100vh;
                }

                .workspace {
                    display: grid;
                    grid-template-columns: 260px 1fr;
                    height: 100vh;
                }

                .sidebar {
                    background: var(--sidebar-bg);
                    border-right: 1px solid var(--border);
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }

                .terminal-zone {
                    display: flex;
                    flex-direction: column;
                    background: var(--bg-main);
                }

                #terminal-container {
                    flex-grow: 1;
                    padding: 10px;
                    background: var(--terminal-bg);
                }

                .editor-view {
                    height: 60%;
                    border-bottom: 1px solid var(--border);
                    padding: 20px;
                    overflow-y: auto;
                    background: linear-gradient(180deg, #11141b 0%, #0b0d11 100%);
                    display: flex;
                    flex-direction: column;
                    max-height: 60vh;
                }

                .chat-container {
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 20px;
                    min-height: 300px;
                    max-height: 400px;
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    padding: 15px;
                    background: var(--glass-bg);
                }

                .input-container {
                    display: flex;
                    gap: 10px;
                    padding: 15px;
                    background: var(--glass-bg);
                    border: 1px solid var(--border);
                    border-radius: 8px;
                    backdrop-filter: blur(10px);
                    margin-top: 10px;
                }

                .chat-input {
                    flex: 1;
                    background: var(--vscode-editor-background);
                    border: 1px solid var(--border);
                    color: var(--vscode-fg);
                    font-family: var(--vscode-font-family);
                    font-size: 14px;
                    outline: none;
                    padding: 12px;
                    border-radius: 6px;
                }

                .chat-input:focus {
                    border-color: var(--zombie-green);
                    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
                }

                .chat-input::placeholder {
                    color: var(--text-dim);
                }

                .send-btn {
                    background: var(--zombie-green);
                    color: black;
                    border: none;
                    padding: 12px 20px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: all 0.2s;
                    min-width: 80px;
                }

                .send-btn:hover {
                    background: #0da371;
                    transform: translateY(-1px);
                }

                .send-btn:disabled {
                    background: var(--text-dim);
                    cursor: not-allowed;
                    transform: none;
                }

                .message {
                    margin-bottom: 15px;
                    padding: 12px;
                    border-radius: 8px;
                    max-width: 85%;
                    word-wrap: break-word;
                }

                .user-message {
                    background: var(--vscode-button-background);
                    border: 1px solid var(--border);
                    margin-left: auto;
                    text-align: right;
                }

                .agent-message {
                    background: linear-gradient(135deg, var(--zombie-green) 0%, #0da371 100%);
                    color: black;
                    margin-right: auto;
                }

                .system-message {
                    background: var(--vscode-input-background);
                    border: 1px solid var(--border-warning);
                    color: var(--vscode-warning-foreground);
                    text-align: center;
                    margin: 0 auto;
                }

                .message-time {
                    font-size: 11px;
                    opacity: 0.7;
                    margin-top: 5px;
                }

                .typing-indicator {
                    display: none;
                    color: var(--zombie-green);
                    font-style: italic;
                    margin-bottom: 10px;
                    padding: 8px;
                    background: var(--glass-bg);
                    border-radius: 6px;
                    border-left: 3px solid var(--zombie-green);
                }

                .typing-indicator.active {
                    display: block;
                }

                .btn {
                    padding: 8px 18px;
                    border-radius: 6px;
                    cursor: pointer;
                    font-weight: 600;
                    transition: 0.2s;
                    border: none;
                    margin: 5px;
                }

                .btn-primary { background: var(--zombie-green); color: black; }
                .btn-secondary { background: transparent; color: var(--vscode-fg); border: 1px solid var(--border); }
                .btn-primary:hover { background: #0da371; transform: translateY(-2px); }

                .status-indicator {
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    margin-right: 8px;
                }

                .status-connected { background: var(--zombie-green); }
                .status-disconnected { background: #ef4444; }
            </style>
        </head>
        <body>
            <div class="workspace">
                <div class="sidebar">
                    <h2 style="color: var(--zombie-green); font-size: 18px;">
                        <i class="fas fa-biohazard"></i> Zombie Dance
                    </h2>
                    <div style="font-size: 12px; color: #64748b;">VS Code Integration</div>
                    <hr style="border: 0; border-top: 1px solid var(--border); width: 100%;">
                    
                    <div>
                        <span class="status-indicator status-disconnected" id="statusIndicator"></span>
                        <span id="statusText">Disconnected</span>
                    </div>
                    
                    <div>
                        <button class="btn btn-primary" onclick="connectToServer()">
                            <i class="fas fa-plug"></i> Connect
                        </button>
                        <button class="btn btn-secondary" onclick="disconnectFromServer()">
                            <i class="fas fa-times"></i> Disconnect
                        </button>
                    </div>
                    
                    <div>
                        <button class="btn btn-secondary" onclick="openCurrentFile()">
                            <i class="fas fa-file-code"></i> Open Current File
                        </button>
                        <button class="btn btn-secondary" onclick="saveToEditor()">
                            <i class="fas fa-save"></i> Save to Editor
                        </button>
                    </div>
                </div>

                <div class="terminal-zone">
                    <div class="editor-view">
                        <div class="chat-container" id="chatContainer">
                            <div class="message system-message">
                                <i class="fas fa-robot"></i> Zombie Dance AI Ready! Ask me anything about your code or project.
                                <div class="message-time">System • Ready</div>
                            </div>
                        </div>
                        
                        <div class="typing-indicator" id="typingIndicator">
                            <i class="fas fa-robot"></i> AI is thinking...
                        </div>

                        <div class="input-container">
                            <input 
                                type="text" 
                                class="chat-input" 
                                id="chatInput" 
                                placeholder="Ask Zombie Dance AI anything about your code..."
                                onkeypress="handleKeyPress(event)"
                            >
                            <button class="send-btn" id="sendBtn" onclick="sendMessage()">
                                <i class="fas fa-paper-plane"></i> Send
                            </button>
                        </div>
                    </div>
                    
                    <div id="terminal-container"></div>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                let isConnected = false;

                // Initialize Xterm.js
                const term = new Terminal({
                    cursorBlink: true,
                    fontSize: 14,
                    fontFamily: 'var(--vscode-font-family)',
                    theme: {
                        background: 'var(--terminal-bg)',
                        foreground: 'var(--zombie-green)'
                    }
                });
                term.open(document.getElementById('terminal-container'));
                term.write('\\x1b[32mZombie Dance AI\\x1b[0m:~$ Ready to connect...\\r\\n');

                function updateStatus(connected) {
                    isConnected = connected;
                    const indicator = document.getElementById('statusIndicator');
                    const statusText = document.getElementById('statusText');
                    
                    if (connected) {
                        indicator.className = 'status-indicator status-connected';
                        statusText.textContent = 'Connected';
                        term.write('\\x1b[32m✅ Connected to Zombie Dance Server\\x1b[0m\\r\\n');
                    } else {
                        indicator.className = 'status-indicator status-disconnected';
                        statusText.textContent = 'Disconnected';
                        term.write('\\x1b[31m❌ Disconnected from Server\\x1b[0m\\r\\n');
                    }
                }

                function sendMessage() {
                    const input = document.getElementById('chatInput') as HTMLInputElement;
                    const message = input.value.trim();
                    
                    if (!message || !isConnected) {
                        if (!isConnected) {
                            addMessage('Please connect to the server first!', 'system');
                        }
                        return;
                    }

                    // Add user message
                    addMessage(message, 'user');
                    input.value = '';

                    // Show typing indicator
                    showTypingIndicator();

                    // Send to server via extension
                    vscode.postMessage({
                        command: 'sendToServer',
                        data: { 
                            action: 'chat',
                            message: message,
                            agentId: 2 // Master Orchestrator
                        }
                    });
                }

                function handleKeyPress(event: KeyboardEvent) {
                    if (event.key === 'Enter') {
                        sendMessage();
                    }
                }

                function addMessage(content: string, type: string = 'agent', sender: string = 'AI') {
                    const chatContainer = document.getElementById('chatContainer');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + type + '-message';
                    
                    const time = new Date().toLocaleTimeString();
                    const icon = type === 'user' ? '👤' : type === 'system' ? '🔧' : '🤖';
                    
                    messageDiv.innerHTML = 
                        '<div>' + icon + ' ' + content + '</div>' +
                        '<div class="message-time">' + sender + ' • ' + time + '</div>';
                    
                    chatContainer.appendChild(messageDiv);
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }

                function showTypingIndicator() {
                    const indicator = document.getElementById('typingIndicator');
                    indicator.classList.add('active');
                }

                function hideTypingIndicator() {
                    const indicator = document.getElementById('typingIndicator');
                    indicator.classList.remove('active');
                }

                function connectToServer() {
                    vscode.postMessage({
                        command: 'sendToServer',
                        data: { action: 'connect' }
                    });
                    updateStatus(true);
                }

                function disconnectFromServer() {
                    vscode.postMessage({
                        command: 'sendToServer',
                        data: { action: 'disconnect' }
                    });
                    updateStatus(false);
                }

                function openCurrentFile() {
                    vscode.postMessage({
                        command: 'openFile',
                        path: '/home/sahon/Desktop/mcpmama/Zombie-Coder-Agentic-Hub/server/my-new-file.js'
                    });
                }

                function saveToEditor() {
                    const content = 'console.log("Generated by Zombie Dance AI!");';
                    vscode.postMessage({
                        command: 'saveFile',
                        content: content
                    });
                }

                // Listen for messages from VS Code
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'serverStatus':
                            updateStatus(message.connected);
                            break;
                        case 'agentResponse':
                            hideTypingIndicator();
                            addMessage(message.response, 'agent', 'Zombie Dance AI');
                            break;
                        case 'error':
                            hideTypingIndicator();
                            addMessage(message.error, 'agent', 'Error');
                            break;
                    }
                });

                // Initialize
                updateStatus(false);
                
                // Focus on input
                document.getElementById('chatInput').focus();
            </script>
        </body>
        </html>`;
    }
}

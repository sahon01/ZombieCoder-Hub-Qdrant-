/**
 * Tool Registry
 * Centralized tool management for agents with LangChain integration
 * Supports DuckDuckGo search, shell execution, and custom dynamic tools
 */

import { executeQuery } from '../database/connection';
import { execSync } from 'child_process';
import path from 'path';

export interface Tool {
    name: string;
    description: string;
    func: (input: string) => Promise<string>;
}

export class DynamicTool implements Tool {
    name: string;
    description: string;
    func: (input: string) => Promise<string>;

    constructor(params: { name: string; description: string; func: (input: string) => Promise<string> }) {
        this.name = params.name;
        this.description = params.description;
        this.func = params.func;
    }
}

export interface ToolConfig {
    name: string;
    category: string;
    description: string;
    isActive: boolean;
    config: Record<string, any>;
}

export interface ToolCatalogItem {
    name: string;
    category: string;
    description: string;
    isActive: boolean;
    config: Record<string, any>;
    source: 'built_in' | 'agent_tools';
    agentId?: number;
}

export interface AgentTool {
    id: number;
    agentId: number;
    toolName: string;
    toolCategory: string;
    isActive: boolean;
    config: Record<string, any>;
}

/**
 * LangChain Tool Factory
 * Creates LangChain-compatible tools from registry configuration
 */
export class LangChainToolFactory {
    private static projectRoot = (() => {
        const envRoot = typeof process.env.PROJECT_ROOT === 'string' ? process.env.PROJECT_ROOT.trim() : '';
        if (envRoot) return envRoot;
        return path.resolve(process.cwd(), '..');
    })();

    private static expandHome(p: string): string {
        if (typeof p !== 'string') return p as any;
        if (p.startsWith('~/')) {
            const home = process.env.HOME || '';
            return home ? path.join(home, p.slice(2)) : p;
        }
        return p;
    }

    /**
     * Create a LangChain Tool from registry config
     */
    static createTool(toolName: string, config: Record<string, any>): Tool | null {
        switch (toolName) {
            case 'shell_exec':
                return this.createShellTool(config);
            case 'file_read':
                return this.createFileReadTool(config);
            case 'file_write':
                return this.createFileWriteTool(config);
            case 'code_execution':
                return this.createCodeExecutionTool(config);
            case 'calculator':
                return this.createCalculatorTool();
            case 'datetime':
                return this.createDateTimeTool();
            case 'web_search':
                return this.createWebSearchTool(config);
            default:
                return null;
        }
    }

    /**
     * Code execution tool (allowlisted languages, sandboxed via subprocess)
     * Input formats:
     * - JSON: {"language":"javascript"|"python", "code":"..."}
     * - string: treated as JavaScript expression
     */
    private static createCodeExecutionTool(config: Record<string, any>): Tool {
        const allowedLanguagesRaw = config.allowed_languages || ['javascript', 'python', 'typescript'];
        const allowedLanguages = Array.isArray(allowedLanguagesRaw) ? allowedLanguagesRaw : [String(allowedLanguagesRaw)];
        const timeoutMs = typeof config.timeout === 'number' ? config.timeout : 30000;
        const pythonCommand = typeof config.python_command === 'string' && config.python_command.trim()
            ? config.python_command.trim()
            : 'python3';

        return new DynamicTool({
            name: 'code_execution',
            description: `Execute small code snippets. Allowed languages: ${allowedLanguages.join(', ')}. Input: JSON {language, code} or a JS expression string.`,
            func: async (input: string) => {
                try {
                    let language = 'javascript';
                    let code = input;

                    const trimmed = typeof input === 'string' ? input.trim() : '';
                    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
                        try {
                            const parsed = JSON.parse(trimmed);
                            if (parsed && typeof parsed === 'object') {
                                if (typeof parsed.language === 'string') language = parsed.language;
                                if (typeof parsed.code === 'string') code = parsed.code;
                            }
                        } catch {
                            // ignore JSON parse errors; treat as raw JS
                        }
                    }

                    language = String(language || '').toLowerCase();
                    if (!allowedLanguages.map(l => String(l).toLowerCase()).includes(language)) {
                        return `Error: language '${language}' is not allowed. Allowed: ${allowedLanguages.join(', ')}`;
                    }

                    if (language === 'typescript') {
                        // Execute as JS for now; TS support would require ts-node/tsx; keep safe and minimal.
                        language = 'javascript';
                    }

                    if (language === 'python') {
                        const out = execSync(`${pythonCommand} -`, {
                            cwd: this.projectRoot,
                            input: code,
                            timeout: timeoutMs,
                            maxBuffer: 10 * 1024 * 1024
                        });
                        return out.toString();
                    }

                    // javascript
                    const wrapped = `"use strict";
try {
  const __result = (async () => ( ${code}
  ))();
  Promise.resolve(__result).then(r => {
    if (typeof r === "string") process.stdout.write(r);
    else process.stdout.write(JSON.stringify(r));
  }).catch(e => {
    process.stderr.write(String(e && e.stack ? e.stack : e));
    process.exit(1);
  });
} catch (e) {
  process.stderr.write(String(e && e.stack ? e.stack : e));
  process.exit(1);
}
`;

                    const out = execSync('node -', {
                        cwd: this.projectRoot,
                        input: wrapped,
                        timeout: timeoutMs,
                        maxBuffer: 10 * 1024 * 1024
                    });
                    return out.toString();
                } catch (e: any) {
                    return `Error: ${e.message}`;
                }
            }
        });
    }

    /**
     * Shell command execution tool (sandboxed)
     */
    private static createShellTool(config: Record<string, any>): Tool {
        const allowedCommands = config.allowed_commands || ['git', 'npm', 'node', 'python', 'ls', 'cat'];

        return new DynamicTool({
            name: 'shell_exec',
            description: `Execute local shell commands. Allowed commands: ${allowedCommands.join(', ')}. Always run in ${this.projectRoot} directory.`,
            func: async (command: string) => {
                try {
                    // Security check: only allow specific commands
                    const cmdFirst = command.trim().split(/\s+/)[0];
                    if (!allowedCommands.includes(cmdFirst)) {
                        return `Error: Command '${cmdFirst}' is not allowed. Allowed: ${allowedCommands.join(', ')}`;
                    }

                    const output = execSync(command, {
                        cwd: this.projectRoot,
                        timeout: 30000,
                        maxBuffer: 10 * 1024 * 1024 // 10MB
                    });
                    return output.toString();
                } catch (e: any) {
                    return `Error: ${e.message}`;
                }
            },
        });
    }

    /**
     * File read tool
     */
    private static createFileReadTool(config: Record<string, any>): Tool {
        const allowedDirsRaw = config.allowed_dirs || [this.projectRoot];
        const allowedDirs = (Array.isArray(allowedDirsRaw) ? allowedDirsRaw : [allowedDirsRaw])
            .filter(Boolean)
            .map((d: string) => this.expandHome(d));

        return new DynamicTool({
            name: 'file_read',
            description: `Read files from allowed directories: ${allowedDirs.join(', ')}`,
            func: async (filePath: string) => {
                try {
                    const fs = require('fs');
                    const fullPath = filePath.startsWith('/') ? filePath : path.join(this.projectRoot, filePath);

                    // Security check: ensure path is within allowed directories
                    const isAllowed = allowedDirs.some((dir: string) => fullPath.startsWith(dir));
                    if (!isAllowed) {
                        return `Error: Path '${filePath}' is not in allowed directories`;
                    }

                    if (!fs.existsSync(fullPath)) {
                        return `Error: File '${filePath}' does not exist`;
                    }

                    const content = fs.readFileSync(fullPath, 'utf-8');
                    return `File: ${filePath}\n\n${content}`;
                } catch (e: any) {
                    return `Error reading file: ${e.message}`;
                }
            },
        });
    }

    /**
     * File write tool
     */
    private static createFileWriteTool(config: Record<string, any>): Tool {
        const allowedDirsRaw = config.allowed_dirs || [this.projectRoot];
        const allowedDirs = (Array.isArray(allowedDirsRaw) ? allowedDirsRaw : [allowedDirsRaw])
            .filter(Boolean)
            .map((d: string) => this.expandHome(d));

        return new DynamicTool({
            name: 'file_write',
            description: `Write content to files in allowed directories: ${allowedDirs.join(', ')}`,
            func: async (input: string) => {
                try {
                    const fs = require('fs');
                    // Format: "filename|content" or JSON {path, content}
                    let filePath: string, content: string;

                    if (input.includes('|')) {
                        const parts = input.split('|');
                        filePath = parts[0].trim();
                        content = parts.slice(1).join('|');
                    } else {
                        return 'Error: Use format "filePath|content" or JSON {path, content}';
                    }

                    const fullPath = filePath.startsWith('/') ? filePath : path.join(this.projectRoot, filePath);

                    // Security check
                    const isAllowed = allowedDirs.some((allowedDir: string) => fullPath.startsWith(allowedDir));
                    if (!isAllowed) {
                        return `Error: Path '${filePath}' is not in allowed directories`;
                    }

                    // Ensure directory exists
                    const dirPath = path.dirname(fullPath);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }

                    fs.writeFileSync(fullPath, content, 'utf-8');
                    return `Success: File '${filePath}' written`;
                } catch (e: any) {
                    return `Error writing file: ${e.message}`;
                }
            },
        });
    }

    /**
     * Calculator tool
     */
    private static createCalculatorTool(): Tool {
        return new DynamicTool({
            name: 'calculator',
            description: 'Calculate mathematical expressions. Input: a mathematical expression like "2+2" or "sqrt(16)"',
            func: async (expression: string) => {
                try {
                    // Safe math evaluation (basic)
                    const safeEval = (expr: string) => {
                        // Only allow numbers, operators, and math functions
                        if (!/^[0-9+\-*/().\ssqrtpowabsminmax]+$/i.test(expr)) {
                            throw new Error('Invalid characters in expression');
                        }
                        // Replace common math functions
                        let processed = expr
                            .replace(/sqrt/g, 'Math.sqrt')
                            .replace(/pow/g, 'Math.pow')
                            .replace(/abs/g, 'Math.abs')
                            .replace(/min/g, 'Math.min')
                            .replace(/max/g, 'Math.max')
                            .replace(/pi/gi, 'Math.PI')
                            .replace(/e(?![xp])/gi, 'Math.E');
                        return eval(processed);
                    };

                    const result = safeEval(expression);
                    return `${expression} = ${result}`;
                } catch (e: any) {
                    return `Error: ${e.message}`;
                }
            },
        });
    }

    /**
     * DateTime tool
     */
    private static createDateTimeTool(): Tool {
        return new DynamicTool({
            name: 'datetime',
            description: 'Get current date and time. Input can be "now", "date", "time", or "full"',
            func: async (type: string = 'full') => {
                const now = new Date();
                const bdTime = new Date(now.getTime() + 6 * 60 * 60 * 1000); // UTC+6 for Bangladesh

                switch (type.toLowerCase()) {
                    case 'date':
                        return bdTime.toLocaleDateString('en-BD', { timeZone: 'Asia/Dhaka' });
                    case 'time':
                        return bdTime.toLocaleTimeString('en-BD', { timeZone: 'Asia/Dhaka' });
                    case 'now':
                    case 'full':
                    default:
                        return bdTime.toLocaleString('en-BD', {
                            timeZone: 'Asia/Dhaka',
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                }
            },
        });
    }

    /**
     * Web search tool (using fetch to DuckDuckGo HTML)
     */
    private static createWebSearchTool(config: Record<string, any>): Tool {
        const maxResults = config.maxResults || 3;

        return new DynamicTool({
            name: 'web_search',
            description: `Search the web for real-time information. Returns top ${maxResults} results.`,
            func: async (query: string) => {
                try {
                    const axios = require('axios');
                    const encodedQuery = encodeURIComponent(query);
                    const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

                    const response = await axios.get(url, { timeout: 10000 });
                    const html = response.data;

                    // Simple HTML parsing to extract results
                    const results: string[] = [];
                    const resultRegex = /<a class="result__a"[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>/g;
                    const snippetRegex = /<a class="result__snippet"[^>]*>([^<]+)<\/a>/g;

                    let match;
                    let count = 0;

                    // Extract titles
                    while ((match = resultRegex.exec(html)) !== null && count < maxResults) {
                        const title = match[1].replace(/<[^>]+>/g, '').trim();
                        results.push(`${count + 1}. ${title}`);
                        count++;
                    }

                    if (results.length === 0) {
                        return `No results found for "${query}"`;
                    }

                    return `Search results for "${query}":\n\n${results.join('\n')}`;
                } catch (e: any) {
                    return `Search error: ${e.message}`;
                }
            },
        });
    }

    /**
     * Get all LangChain tools for an agent
     */
    static async getAgentLangChainTools(agentId: number): Promise<Tool[]> {
        const agentTools = await ToolRegistry.getAgentTools(agentId);
        const tools: Tool[] = [];

        for (const agentTool of agentTools) {
            const tool = this.createTool(agentTool.toolName, agentTool.config);
            if (tool) {
                tools.push(tool);
            }
        }

        return tools;
    }
}

/**
 * Tool Registry - Manages available tools for agents
 */
export class ToolRegistry {
    // Static tool definitions
    private static tools: Map<string, ToolConfig> = new Map([
        ['web_search', {
            name: 'web_search',
            category: 'search',
            description: 'Search the web for real-time information using DuckDuckGo',
            isActive: true,
            config: { provider: 'duckduckgo' }
        }],
        ['code_execution', {
            name: 'code_execution',
            category: 'code',
            description: 'Execute code in a sandboxed environment',
            isActive: true,
            config: { timeout: 30000, allowed_languages: ['javascript', 'python', 'typescript'] }
        }],
        ['file_read', {
            name: 'file_read',
            category: 'filesystem',
            description: 'Read files from the filesystem',
            isActive: true,
            config: { allowed_dirs: [LangChainToolFactory['projectRoot']] }
        }],
        ['file_write', {
            name: 'file_write',
            category: 'filesystem',
            description: 'Write content to files',
            isActive: true,
            config: { allowed_dirs: [LangChainToolFactory['projectRoot']] }
        }],
        ['shell_exec', {
            name: 'shell_exec',
            category: 'system',
            description: 'Execute shell commands',
            isActive: true,
            config: { allowed_commands: ['git', 'npm', 'node', 'python'] }
        }],
        ['calculator', {
            name: 'calculator',
            category: 'utility',
            description: 'Calculate mathematical expressions',
            isActive: true,
            config: {}
        }],
        ['datetime', {
            name: 'datetime',
            category: 'utility',
            description: 'Get current date and time',
            isActive: true,
            config: {}
        }],
        ['agent_coordination', {
            name: 'agent_coordination',
            category: 'orchestration',
            description: 'Coordinate multiple agents for complex tasks',
            isActive: true,
            config: { max_agents: 5 }
        }],
        ['task_planning', {
            name: 'task_planning',
            category: 'orchestration',
            description: 'Plan and decompose complex tasks',
            isActive: true,
            config: {}
        }],
        ['code_analysis', {
            name: 'code_analysis',
            category: 'analysis',
            description: 'Analyze code for issues, security, and best practices',
            isActive: true,
            config: { security_check: true, best_practices: true }
        }],
        ['markdown_formatter', {
            name: 'markdown_formatter',
            category: 'formatting',
            description: 'Format content as markdown',
            isActive: true,
            config: {}
        }]
    ]);

    /**
     * Get all available tools
     */
    static getAllTools(): ToolConfig[] {
        return Array.from(this.tools.values());
    }

    private static async getAgentToolRows(agentId: number): Promise<Array<{ tool_name: string; tool_category: string; is_active: any; config: any }>> {
        const rows = await executeQuery(
            'SELECT tool_name, tool_category, is_active, config FROM agent_tools WHERE agent_id = ?',
            [agentId]
        );
        if (!Array.isArray(rows)) return [];
        return rows as any;
    }

    static async getToolCatalogForAgent(agentId: number): Promise<ToolCatalogItem[]> {
        const builtIns = Array.from(this.tools.values());
        const agentRows = await this.getAgentToolRows(agentId);
        const agentByName = new Map<string, { category: string; isActive: boolean; config: Record<string, any> }>();

        for (const row of agentRows) {
            agentByName.set(row.tool_name, {
                category: row.tool_category,
                isActive: Boolean(row.is_active),
                config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {})
            });
        }

        const catalog: ToolCatalogItem[] = [];

        for (const tool of builtIns) {
            const agentOverride = agentByName.get(tool.name);
            catalog.push({
                name: tool.name,
                category: agentOverride?.category || tool.category,
                description: tool.description,
                isActive: agentOverride ? agentOverride.isActive : false,
                config: {
                    ...(tool.config || {}),
                    ...(agentOverride?.config || {})
                },
                source: agentOverride ? 'agent_tools' : 'built_in',
                agentId
            });
            agentByName.delete(tool.name);
        }

        for (const [toolName, row] of agentByName.entries()) {
            catalog.push({
                name: toolName,
                category: row.category,
                description: 'Custom tool',
                isActive: row.isActive,
                config: row.config,
                source: 'agent_tools',
                agentId
            });
        }

        return catalog;
    }

    static async getAgentToolEffectiveConfig(agentId: number, toolName: string): Promise<{ isActive: boolean; config: Record<string, any> } | null> {
        const rows = await executeQuery(
            'SELECT tool_name, is_active, config FROM agent_tools WHERE agent_id = ? AND tool_name = ? LIMIT 1',
            [agentId, toolName]
        );
        if (!Array.isArray(rows) || rows.length === 0) return null;
        const row: any = rows[0];
        return {
            isActive: Boolean(row.is_active),
            config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {})
        };
    }

    /**
     * Get tool by name
     */
    static getTool(name: string): ToolConfig | undefined {
        return this.tools.get(name);
    }

    /**
     * Get tools by category
     */
    static getToolsByCategory(category: string): ToolConfig[] {
        return Array.from(this.tools.values()).filter(t => t.category === category);
    }

    /**
     * Load tools for a specific agent from database
     */
    static async getAgentTools(agentId: number): Promise<AgentTool[]> {
        try {
            const result = await executeQuery(
                'SELECT id, agent_id, tool_name, tool_category, is_active, config FROM agent_tools WHERE agent_id = ? AND is_active = TRUE',
                [agentId]
            );

            if (Array.isArray(result)) {
                return result.map((row: any) => ({
                    id: row.id,
                    agentId: row.agent_id,
                    toolName: row.tool_name,
                    toolCategory: row.tool_category,
                    isActive: row.is_active,
                    config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config
                }));
            }
            return [];
        } catch (error) {
            console.error('Failed to load agent tools:', error);
            return [];
        }
    }

    /**
     * Get tools as formatted string for prompt injection
     */
    static async getToolsForPrompt(agentId: number): Promise<string> {
        const tools = await this.getAgentTools(agentId);

        if (tools.length === 0) {
            return 'No tools available.';
        }

        const toolList = tools.map(t => {
            const staticTool = this.tools.get(t.toolName);
            return `- ${t.toolName}: ${staticTool?.description || 'Custom tool'} (${t.toolCategory})`;
        });

        return `[AVAILABLE_TOOLS]\n${toolList.join('\n')}\n\nUse these tools when needed to help the user.`;
    }

    /**
     * Enable a tool for an agent
     */
    static async enableTool(agentId: number, toolName: string): Promise<boolean> {
        try {
            await executeQuery(
                'UPDATE agent_tools SET is_active = TRUE WHERE agent_id = ? AND tool_name = ?',
                [agentId, toolName]
            );
            return true;
        } catch (error) {
            console.error('Failed to enable tool:', error);
            return false;
        }
    }

    /**
     * Disable a tool for an agent
     */
    static async disableTool(agentId: number, toolName: string): Promise<boolean> {
        try {
            await executeQuery(
                'UPDATE agent_tools SET is_active = FALSE WHERE agent_id = ? AND tool_name = ?',
                [agentId, toolName]
            );
            return true;
        } catch (error) {
            console.error('Failed to disable tool:', error);
            return false;
        }
    }

    /**
     * Add a new tool to an agent
     */
    static async addTool(agentId: number, toolName: string, toolCategory: string, config: Record<string, any> = {}): Promise<boolean> {
        try {
            await executeQuery(
                'INSERT INTO agent_tools (agent_id, tool_name, tool_category, is_active, config) VALUES (?, ?, ?, TRUE, ?)',
                [agentId, toolName, toolCategory, JSON.stringify(config)]
            );
            return true;
        } catch (error) {
            console.error('Failed to add tool:', error);
            return false;
        }
    }

    /**
     * Remove a tool from an agent
     */
    static async removeTool(agentId: number, toolName: string): Promise<boolean> {
        try {
            await executeQuery(
                'DELETE FROM agent_tools WHERE agent_id = ? AND tool_name = ?',
                [agentId, toolName]
            );
            return true;
        } catch (error) {
            console.error('Failed to remove tool:', error);
            return false;
        }
    }
}

export default ToolRegistry;

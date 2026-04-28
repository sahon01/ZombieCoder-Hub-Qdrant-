/**
 * Tools Service
 * Provides tools for agents: web search, file operations, shell execution, code interpreter
 */

import { Logger } from '../utils/logger';
import axios from 'axios';
import { exec, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ToolResult {
    success: boolean;
    result?: string;
    error?: string;
    tool: string;
}

interface ToolCall {
    tool: string;
    args: Record<string, any>;
}

export class ToolsService {
    private logger: Logger;
    private workspacePath: string;

    constructor(workspacePath: string = process.cwd()) {
        this.logger = new Logger();
        this.workspacePath = workspacePath;
    }

    /**
     * Execute a tool call based on the tool name
     */
    async executeTool(toolCall: ToolCall): Promise<ToolResult> {
        const { tool, args } = toolCall;

        switch (tool) {
            case 'web_search':
                return await this.webSearch(args.query);
            
            case 'file_read':
                return this.fileRead(args.path);
            
            case 'file_write':
                return this.fileWrite(args.path, args.content);
            
            case 'file_list':
                return this.fileList(args.dirPath, args.options);
            
            case 'shell_exec':
                return await this.shellExec(args.command, args.timeout);
            
            case 'code_execute':
                return await this.executeCode(args.code, args.language);
            
            case 'calculator':
                return this.calculate(args.expression);
            
            case 'datetime':
                return this.getDateTime();
            
            case 'git_status':
                return await this.gitStatus();
            
            case 'git_log':
                return await this.gitLog(args.count);
            
            default:
                return {
                    success: false,
                    error: `Unknown tool: ${tool}`,
                    tool: 'unknown'
                };
        }
    }

    /**
     * Parse tool calls from agent response
     */
    parseToolCalls(response: string): ToolCall[] {
        const toolCalls: ToolCall[] = [];
        
        // Look for JSON tool calls in the response
        const jsonMatch = response.match(/```json\s*(\{[\s\S]*?\})\s*```/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[1]);
                if (parsed.tool && parsed.args) {
                    toolCalls.push(parsed);
                }
            } catch (e) {
                // Not valid JSON
            }
        }

        // Also check for simple format: TOOL_NAME arg1=val1 arg2=val2
        const simpleMatch = response.match(/(web_search|file_read|file_write|shell_exec|code_execute|calculator)\s+(.+)/gi);
        if (simpleMatch) {
            for (const match of simpleMatch) {
                const parts = match.split(/\s+/);
                const toolName = parts[0].toLowerCase();
                const argsStr = parts.slice(1).join(' ');
                
                // Parse key=value pairs
                const args: Record<string, string> = {};
                const argPairs = argsStr.match(/(\w+)=("[^"]*"|\S+)/g);
                if (argPairs) {
                    for (const pair of argPairs) {
                        const [key, value] = pair.split('=');
                        args[key] = value.replace(/^"|"$/g, '');
                    }
                } else {
                    // First argument as query or command
                    args.query = argsStr;
                    args.command = argsStr;
                }
                
                if (args.query || args.command || args.code) {
                    toolCalls.push({ tool: toolName, args });
                }
            }
        }

        return toolCalls;
    }

    /**
     * Web search using DuckDuckGo
     */
    async webSearch(query: string): Promise<ToolResult> {
        try {
            this.logger.info(`Web search: ${query}`);
            
            const response = await axios.get('https://html.duckduckgo.com/html/', {
                params: { q: query },
                timeout: 10000
            });

            const results = this.parseSearchResults(response.data);
            
            if (results.length === 0) {
                return {
                    success: true,
                    result: 'No search results found.',
                    tool: 'web_search'
                };
            }

            const formattedResults = results.slice(0, 5).map((r, i) => 
                `${i + 1}. ${r.title}\n   ${r.snippet}\n   URL: ${r.url}`
            ).join('\n\n');

            return {
                success: true,
                result: `Search results for "${query}":\n\n${formattedResults}`,
                tool: 'web_search'
            };
        } catch (error: any) {
            this.logger.error('Web search failed:', error);
            return {
                success: false,
                error: error.message || 'Web search failed',
                tool: 'web_search'
            };
        }
    }

    private parseSearchResults(html: string): Array<{title: string; snippet: string; url: string}> {
        const results: Array<{title: string; snippet: string; url: string}> = [];
        const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        
        let match;
        while ((match = resultRegex.exec(html)) !== null && results.length < 5) {
            results.push({
                url: match[1],
                title: this.stripHtml(match[2]),
                snippet: this.stripHtml(match[3]).trim()
            });
        }
        
        return results;
    }

    private stripHtml(html: string): string {
        return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    }

    /**
     * Read a file
     */
    fileRead(filePath: string): ToolResult {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.workspacePath, filePath);
            
            if (!fs.existsSync(fullPath)) {
                return {
                    success: false,
                    error: `File not found: ${filePath}`,
                    tool: 'file_read'
                };
            }

            const content = fs.readFileSync(fullPath, 'utf-8');
            const stats = fs.statSync(fullPath);
            
            return {
                success: true,
                result: `File: ${filePath}\nSize: ${stats.size} bytes\n\n${content}`,
                tool: 'file_read'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                tool: 'file_read'
            };
        }
    }

    /**
     * Write to a file
     */
    fileWrite(filePath: string, content: string): ToolResult {
        try {
            const fullPath = path.isAbsolute(filePath) 
                ? filePath 
                : path.join(this.workspacePath, filePath);
            
            // Ensure directory exists
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            fs.writeFileSync(fullPath, content, 'utf-8');
            
            return {
                success: true,
                result: `File written successfully: ${filePath}`,
                tool: 'file_write'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                tool: 'file_write'
            };
        }
    }

    /**
     * List files in a directory
     */
    fileList(dirPath: string = '.', options?: { recursive?: boolean; pattern?: string }): ToolResult {
        try {
            const fullPath = path.isAbsolute(dirPath) 
                ? dirPath 
                : path.join(this.workspacePath, dirPath);
            
            if (!fs.existsSync(fullPath)) {
                return {
                    success: false,
                    error: `Directory not found: ${dirPath}`,
                    tool: 'file_list'
                };
            }

            const listFiles = (dir: string, depth: number): string[] => {
                const items = fs.readdirSync(dir);
                let results: string[] = [];
                
                for (const item of items) {
                    const fullItemPath = path.join(dir, item);
                    const stats = fs.statSync(fullItemPath);
                    const relativePath = path.relative(this.workspacePath, fullItemPath);
                    
                    if (stats.isDirectory()) {
                        results.push(`${relativePath}/`);
                        if (options?.recursive && depth < 3) {
                            results = results.concat(listFiles(fullItemPath, depth + 1));
                        }
                    } else {
                        if (!options?.pattern || item.match(new RegExp(options.pattern))) {
                            results.push(relativePath);
                        }
                    }
                }
                
                return results;
            };

            const files = listFiles(fullPath, 0);
            
            return {
                success: true,
                result: `Directory: ${dirPath}\n\n${files.join('\n')}`,
                tool: 'file_list'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                tool: 'file_list'
            };
        }
    }

    /**
     * Execute shell command
     */
    shellExec(command: string, timeout: number = 30000): Promise<ToolResult> {
        return new Promise((resolve) => {
            this.logger.info(`Shell exec: ${command}`);
            
            // Security: whitelist allowed commands
            const allowedCommands = [
                'git', 'npm', 'node', 'pnpm', 'ls', 'cat', 'pwd', 'echo',
                'find', 'grep', 'curl', 'docker', 'python', 'python3'
            ];
            
            const firstWord = command.trim().split(/\s+/)[0];
            if (!allowedCommands.includes(firstWord)) {
                resolve({
                    success: false,
                    error: `Command not allowed: ${firstWord}`,
                    tool: 'shell_exec'
                });
                return;
            }

            exec(command, { 
                cwd: this.workspacePath,
                timeout: timeout,
                maxBuffer: 10 * 1024 * 1024 // 10MB
            }, (error, stdout, stderr) => {
                if (error) {
                    resolve({
                        success: false,
                        error: error.message,
                        tool: 'shell_exec'
                    });
                    return;
                }

                resolve({
                    success: true,
                    result: stdout || stderr || 'Command executed successfully (no output)',
                    tool: 'shell_exec'
                });
            });
        });
    }

    /**
     * Execute code in sandbox
     */
    async executeCode(code: string, language: string = 'javascript'): Promise<ToolResult> {
        try {
            this.logger.info(`Executing ${language} code...`);
            
            const tempDir = os.tmpdir();
            const timestamp = Date.now();
            
            if (language === 'javascript' || language === 'js') {
                const tempFile = path.join(tempDir, `exec_${timestamp}.js`);
                fs.writeFileSync(tempFile, code);
                
                return new Promise((resolve) => {
                    exec(`node "${tempFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
                        fs.unlinkSync(tempFile);
                        
                        if (error) {
                            resolve({
                                success: false,
                                error: error.message,
                                tool: 'code_execute'
                            });
                            return;
                        }
                        
                        resolve({
                            success: true,
                            result: stdout || stderr || 'Code executed successfully (no output)',
                            tool: 'code_execute'
                        });
                    });
                });
                
            } else if (language === 'python' || language === 'py') {
                const tempFile = path.join(tempDir, `exec_${timestamp}.py`);
                fs.writeFileSync(tempFile, code);
                
                return new Promise((resolve) => {
                    exec(`python3 "${tempFile}"`, { timeout: 10000 }, (error, stdout, stderr) => {
                        fs.unlinkSync(tempFile);
                        
                        if (error) {
                            resolve({
                                success: false,
                                error: error.message,
                                tool: 'code_execute'
                            });
                            return;
                        }
                        
                        resolve({
                            success: true,
                            result: stdout || stderr || 'Code executed successfully (no output)',
                            tool: 'code_execute'
                        });
                    });
                });
                
            } else {
                return {
                    success: false,
                    error: `Unsupported language: ${language}. Supported: javascript, python`,
                    tool: 'code_execute'
                };
            }
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                tool: 'code_execute'
            };
        }
    }

    /**
     * Calculate expression
     */
    calculate(expression: string): ToolResult {
        try {
            if (!/^[\d\s+\-*/().]+$/.test(expression)) {
                throw new Error('Invalid characters in expression');
            }
            
            // eslint-disable-next-line no-eval
            const result = eval(expression);
            return {
                success: true,
                result: `${expression} = ${result}`,
                tool: 'calculator'
            };
        } catch (error: any) {
            return {
                success: false,
                error: error.message,
                tool: 'calculator'
            };
        }
    }

    /**
     * Get current date/time
     */
    getDateTime(): ToolResult {
        const now = new Date();
        return {
            success: true,
            result: `Current Date/Time: ${now.toISOString()}
Local: ${now.toLocaleString()}
Unix Timestamp: ${Math.floor(now.getTime() / 1000)}`,
            tool: 'datetime'
        };
    }

    /**
     * Git status
     */
    async gitStatus(): Promise<ToolResult> {
        return await this.shellExec('git status --short', 5000);
    }

    /**
     * Git log
     */
    async gitLog(count: number = 10): Promise<ToolResult> {
        return await this.shellExec(`git log --oneline -n ${count}`, 5000);
    }
}

/**
 * Tool definitions for agent capabilities
 */
export const TOOL_DEFINITIONS = [
    {
        name: 'web_search',
        description: 'Search the web for real-time information',
        parameters: {
            query: { type: 'string', description: 'Search query' }
        }
    },
    {
        name: 'file_read',
        description: 'Read a file from the filesystem',
        parameters: {
            path: { type: 'string', description: 'File path to read' }
        }
    },
    {
        name: 'file_write',
        description: 'Write content to a file',
        parameters: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' }
        }
    },
    {
        name: 'file_list',
        description: 'List files in a directory',
        parameters: {
            dirPath: { type: 'string', description: 'Directory path', optional: true },
            options: { type: 'object', description: 'Options (recursive, pattern)', optional: true }
        }
    },
    {
        name: 'shell_exec',
        description: 'Execute a shell command',
        parameters: {
            command: { type: 'string', description: 'Command to execute' },
            timeout: { type: 'number', description: 'Timeout in ms', optional: true }
        }
    },
    {
        name: 'code_execute',
        description: 'Execute code in a sandbox',
        parameters: {
            code: { type: 'string', description: 'Code to execute' },
            language: { type: 'string', description: 'Language (javascript, python)' }
        }
    },
    {
        name: 'calculator',
        description: 'Calculate a mathematical expression',
        parameters: {
            expression: { type: 'string', description: 'Math expression' }
        }
    },
    {
        name: 'datetime',
        description: 'Get current date and time',
        parameters: {}
    },
    {
        name: 'git_status',
        description: 'Get git repository status',
        parameters: {}
    },
    {
        name: 'git_log',
        description: 'Get git commit history',
        parameters: {
            count: { type: 'number', description: 'Number of commits', optional: true }
        }
    }
];

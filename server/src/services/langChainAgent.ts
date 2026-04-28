/**
 * LangChain Agent Service
 * Handles agent execution with memory, tools, and OpenAI-compatible response format
 * 
 * Features:
 * - Session-based BufferWindowMemory (custom implementation)
 * - Dynamic tool loading from ToolRegistry
 * - Real-time streaming responses
 * - OpenAI-standard output format
 */

import { OllamaService } from './ollama';
import { DynamicTool, Tool, LangChainToolFactory } from './toolRegistry';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';
import { sanitizeModelResponse } from '../utils/ethics';

// Custom simple memory implementation
interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
}

class SimpleBufferMemory {
    private messages: ChatMessage[] = [];
    private k: number;

    constructor(k: number = 5) {
        this.k = k;
    }

    addUserMessage(content: string): void {
        this.messages.push({ role: 'user', content, timestamp: Date.now() });
        this.prune();
    }

    addAssistantMessage(content: string): void {
        this.messages.push({ role: 'assistant', content, timestamp: Date.now() });
        this.prune();
    }

    private prune(): void {
        if (this.messages.length > this.k * 2) {
            this.messages = this.messages.slice(-this.k * 2);
        }
    }

    getHistory(): ChatMessage[] {
        return [...this.messages];
    }

    getHistoryText(): string {
        return this.messages.map(m => `${m.role}: ${m.content}`).join('\n');
    }

    clear(): void {
        this.messages = [];
    }
}

// Session memories storage
const sessionMemories: Map<string, SimpleBufferMemory> = new Map();

// Default system prompt for LangChain agents
const DEFAULT_SYSTEM_PROMPT = `You are a helpful AI assistant. Always respond in the same language as the user's question.
If the user asks in Bengali/Bangla, respond in Bengali. If in English, respond in English.`;

export interface AgentExecutionInput {
    agentId: number;
    sessionId: string;
    query: string;
    model?: string;
}

export interface AgentExecutionStreamInput extends AgentExecutionInput {
    onChunk?: (chunk: string) => void;
}

export interface AgentExecutionResult {
    success: boolean;
    output: string;
    sessionId: string;
    agentId: number;
    model: string;
    persona: string;
    latency: number;
    toolsUsed: string[];
    error?: string;
}

/**
 * LangChain Agent Executor
 * Manages agent execution with memory and tools
 */
export class LangChainAgentService {
    private ollamaService: OllamaService;
    private logger: Logger;

    constructor() {
        this.ollamaService = new OllamaService();
        this.logger = new Logger();
    }

    private async getDefaultModel(): Promise<string> {
        try {
            const rows = await executeQuery(
                'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
                ['default_model']
            );
            if (Array.isArray(rows) && rows.length > 0 && (rows[0] as any).setting_value) {
                return (rows[0] as any).setting_value;
            }
        } catch (error) {
            this.logger.warn('Failed to load default_model from system_settings, falling back to env/default:', error);
        }

        return process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:latest';
    }

    /**
     * Get or create memory for a session
     */
    private getSessionMemory(sessionId: string, k: number = 5): SimpleBufferMemory {
        if (!sessionMemories.has(sessionId)) {
            sessionMemories.set(sessionId, new SimpleBufferMemory(k));
        }
        return sessionMemories.get(sessionId)!;
    }

    /**
     * Get agent configuration from database
     */
    private async getAgentConfig(agentId: number): Promise<any> {
        try {
            const result = await executeQuery(
                'SELECT * FROM agents WHERE id = ?',
                [agentId]
            );

            if (Array.isArray(result) && result.length > 0) {
                const agent = result[0];

                // Parse config and metadata
                let config: Record<string, any> = {};
                let metadata: Record<string, any> = {};

                if (agent.config) {
                    config = typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config;
                }
                if (agent.metadata) {
                    metadata = typeof agent.metadata === 'string' ? JSON.parse(agent.metadata) : agent.metadata;
                }

                const defaultModel = await this.getDefaultModel();

                const bufferMemorySize =
                    (typeof config?.buffer_memory_size === 'number' ? config.buffer_memory_size : undefined) ||
                    (typeof metadata?.buffer_memory_size === 'number' ? metadata.buffer_memory_size : undefined) ||
                    5;

                const resolvedSystemPrompt =
                    (typeof metadata?.system_prompt === 'string' ? metadata.system_prompt : undefined) ||
                    (typeof config?.system_instructions === 'string' ? config.system_instructions : undefined) ||
                    DEFAULT_SYSTEM_PROMPT;

                const resolvedModel =
                    (typeof config?.model === 'string' && config.model.trim() ? config.model : undefined) ||
                    defaultModel;

                return {
                    id: agent.id,
                    name: agent.name,
                    type: agent.type,
                    status: agent.status,
                    persona_name: agent.persona_name,
                    system_prompt: resolvedSystemPrompt,
                    model_name: resolvedModel,
                    buffer_memory_size: bufferMemorySize,
                    config,
                    metadata
                };
            }
            return null;
        } catch (error) {
            this.logger.error('Failed to get agent config:', error);
            return null;
        }
    }

    /**
     * Get available tools for an agent
     */
    private async getAgentTools(agentId: number): Promise<Tool[]> {
        try {
            const tools = await LangChainToolFactory.getAgentLangChainTools(agentId);
            return tools;
        } catch (error) {
            this.logger.error('Failed to get agent tools:', error);
            return [];
        }
    }

    /**
     * Build system prompt from agent config
     */
    private buildSystemPrompt(agentConfig: any): string {
        const parts: string[] = [];

        // Add identity info
        parts.push('[SYSTEM_IDENTITY]');
        parts.push('You are part of the ZombieCoder System.');
        parts.push('');

        // Add agent-specific system prompt
        if (agentConfig.system_prompt) {
            parts.push('[AGENT_PERSONA]');
            parts.push(agentConfig.system_prompt);
            parts.push('');
        }

        // Add tools info
        parts.push('[TOOLS]');
        parts.push('You have access to various tools to help the user. Use them when needed.');

        return parts.join('\n');
    }

    private extractFirstJsonObject(text: string): any | null {
        if (typeof text !== 'string') return null;
        const fenced = text.match(/```json\s*([\s\S]*?)\s*```/i);
        const candidate = fenced ? fenced[1] : text;

        const start = candidate.indexOf('{');
        const end = candidate.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;

        const raw = candidate.slice(start, end + 1);
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    private extractFirstFilePath(text: string): string | null {
        if (typeof text !== 'string') return null;
        const m = text.match(/\b([A-Za-z0-9_./-]+\.[A-Za-z0-9]{1,8})\b/);
        const p = m?.[1];
        if (!p) return null;
        if (p.includes('..')) return null;
        return p;
    }

    private truncateToolOutput(text: string, maxChars: number = 12000): string {
        const s = typeof text === 'string' ? text : String(text ?? '');
        if (s.length <= maxChars) return s;
        const head = s.slice(0, Math.max(0, maxChars));
        return `${head}\n\n[TRUNCATED_TOOL_OUTPUT] original_length=${s.length} max_length=${maxChars}`;
    }

    private summarizeFileReadForRouterEndpoints(toolOutput: string, query: string): string | null {
        const q = typeof query === 'string' ? query : '';
        const wantsEndpoints = /router\.(get|post)\s*\(/i.test(q) || /endpoint|route/i.test(q) || /এন্ডপয়েন্ট|এন্ডপয়েন্ট|রাউট/i.test(q);
        if (!wantsEndpoints) return null;

        const marker = 'File:';
        const idx = typeof toolOutput === 'string' ? toolOutput.indexOf(marker) : -1;
        const text = typeof toolOutput === 'string' ? toolOutput : String(toolOutput ?? '');
        const body = idx !== -1 ? text.slice(text.indexOf('\n\n', idx) + 2) : text;

        const lines = body.split(/\r?\n/);
        const hits: string[] = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            if (/^router\.(get|post)\s*\(/.test(trimmed)) {
                hits.push(trimmed);
            }
        }

        if (!hits.length) return null;
        const unique = Array.from(new Set(hits));
        const limited = unique.slice(0, 80);

        return [
            '[FILE_READ_SUMMARY]',
            'Extracted top-level Express router endpoints:',
            ...limited.map(l => `- ${l}`),
            unique.length > limited.length ? `\n[TRUNCATED_ENDPOINT_LIST] total=${unique.length} shown=${limited.length}` : ''
        ].filter(Boolean).join('\n');
    }

    private async runToolLoop(params: {
        agentConfig: any;
        tools: Tool[];
        modelToUse: string;
        query: string;
        historyText: string;
        maxSteps: number;
    }): Promise<{ toolTraceText: string; toolsUsed: string[]; directAnswer?: string }> {
        const { agentConfig, tools, modelToUse, query, historyText, maxSteps } = params;

        if (!tools.length || maxSteps <= 0) {
            return { toolTraceText: '', toolsUsed: [] };
        }

        const toolsByName = new Map<string, Tool>();
        for (const t of tools) toolsByName.set(t.name, t);

        const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
        const toolsUsed: string[] = [];
        const trace: string[] = [];

        let scratchpad = '';
        let directAnswer: string | undefined;

        const hintedPath = this.extractFirstFilePath(query);
        const wantsRead = /\b(read|open|file)\b/i.test(query) || /ফাইল|পড়|পড়|খুল/i.test(query);
        if (hintedPath && wantsRead) {
            const fileReadTool = toolsByName.get('file_read');
            if (fileReadTool) {
                try {
                    const dynamicTool = fileReadTool as unknown as DynamicTool;
                    const out = dynamicTool.func ? await dynamicTool.func(hintedPath) : `Tool 'file_read' is not executable`;
                    toolsUsed.push('file_read');
                    trace.push(`[TOOL_CALL] file_read input=${JSON.stringify(hintedPath)}`);
                    const raw = String(out || '');
                    const summary = this.summarizeFileReadForRouterEndpoints(raw, query);
                    const payload = summary ? summary : this.truncateToolOutput(raw, 4000);
                    trace.push(`[TOOL_RESULT] ${payload}`);
                    if (summary) {
                        directAnswer = summary;
                    }
                    scratchpad += `\n[PRE_TOOL] file_read executed for ${hintedPath}.`;
                } catch (e: any) {
                    const msg = e instanceof Error ? e.message : String(e);
                    trace.push(`[TOOL_CALL] file_read input=${JSON.stringify(hintedPath)}`);
                    trace.push(`[TOOL_ERROR] ${msg}`);
                }
            }
        }

        for (let step = 1; step <= maxSteps; step++) {
            const prompt = [
                this.buildSystemPrompt(agentConfig),
                historyText ? `\n\n[CONVERSATION_HISTORY]\n${historyText}` : '',
                `\n\n[AVAILABLE_TOOLS]\n${toolDescriptions}`,
                `\n\n[USER_QUERY]\n${query}`,
                scratchpad ? `\n\n[SCRATCHPAD]\n${scratchpad}` : '',
                `\n\n[INSTRUCTIONS]\nYou may either decide to call ONE tool, or decide you have enough information.\n\nIf you need a tool, respond with ONLY a single JSON object in a fenced json code block with this shape:\n{\n  "type": "tool_call",\n  "tool": "<tool_name>",\n  "input": "<string input for that tool>"\n}\n\nIf you have enough information, respond with ONLY:\n{\n  "type": "final"\n}`
            ].join('');

            const decisionRaw = await this.ollamaService.generate(
                prompt,
                modelToUse,
                undefined,
                {
                    rawPrompt: true,
                    ollamaOptions: {
                        temperature: 0.0,
                        top_p: 0.9,
                        num_predict: 400,
                        stop: []
                    }
                }
            );

            const decision = this.extractFirstJsonObject(decisionRaw);
            if (!decision || typeof decision !== 'object') {
                scratchpad += `\n[STEP_${step}] Model decision parse failed. Proceeding without tools.`;
                break;
            }

            if (decision.type === 'final') {
                break;
            }

            if (decision.type !== 'tool_call') {
                scratchpad += `\n[STEP_${step}] Model decision invalid type. Proceeding without tools.`;
                break;
            }

            const toolName = String(decision.tool || '').trim();
            const toolInput = typeof decision.input === 'string' ? decision.input : String(decision.input ?? '');
            const tool = toolsByName.get(toolName);
            if (!tool) {
                scratchpad += `\n[STEP_${step}] Tool not available: ${toolName}`;
                trace.push(`[TOOL_ERROR] Tool not available: ${toolName}`);
                continue;
            }

            try {
                const dynamicTool = tool as unknown as DynamicTool;
                const out = dynamicTool.func ? await dynamicTool.func(toolInput) : `Tool '${toolName}' is not executable`;
                toolsUsed.push(toolName);
                trace.push(`[TOOL_CALL] ${toolName} input=${JSON.stringify(toolInput)}`);
                if (toolName === 'file_read') {
                    const raw = String(out || '');
                    const summary = this.summarizeFileReadForRouterEndpoints(raw, query);
                    trace.push(`[TOOL_RESULT] ${summary ? summary : this.truncateToolOutput(raw, 4000)}`);
                    if (summary) {
                        directAnswer = summary;
                    }
                } else {
                    trace.push(`[TOOL_RESULT] ${this.truncateToolOutput(String(out || ''), 4000)}`);
                }
                scratchpad += `\n[STEP_${step}] Tool ${toolName} executed.`;
            } catch (e: any) {
                const msg = e instanceof Error ? e.message : String(e);
                trace.push(`[TOOL_CALL] ${toolName} input=${JSON.stringify(toolInput)}`);
                trace.push(`[TOOL_ERROR] ${msg}`);
                scratchpad += `\n[STEP_${step}] Tool ${toolName} failed.`;
            }
        }

        const toolTraceText = trace.length ? `\n\n[TOOL_TRACE]\n${trace.join('\n')}` : '';
        return { toolTraceText, toolsUsed, directAnswer };
    }

    /**
     * Execute agent with query
     * Uses simple prompt-based approach since we don't have OpenAI model
     */
    async executeAgent(input: AgentExecutionInput): Promise<AgentExecutionResult> {
        const startTime = Date.now();
        const { agentId, sessionId, query, model } = input;

        try {
            // Get agent config
            const agentConfig = await this.getAgentConfig(agentId);
            if (!agentConfig) {
                throw new Error(`Agent ${agentId} not found`);
            }

            // Get session memory
            const memory = this.getSessionMemory(sessionId, agentConfig.buffer_memory_size);

            // Get available tools
            const tools = await this.getAgentTools(agentId);

            // Build system prompt
            let systemPrompt = this.buildSystemPrompt(agentConfig);

            // Add tool descriptions to prompt if tools available
            if (tools.length > 0) {
                const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
                systemPrompt += `\n\n[AVAILABLE_TOOLS]\n${toolDescriptions}\n\nUse these tools when appropriate to answer the user's question.`;
            }

            // Get conversation history from memory
            const chatHistory = memory.getHistory();
            let historyText = '';
            if (chatHistory.length > 0) {
                historyText = '\n\n[CONVERSATION_HISTORY]\n';
                chatHistory.forEach((msg: ChatMessage) => {
                    if (msg.role === 'user') {
                        historyText += `User: ${msg.content}\n`;
                    } else if (msg.role === 'assistant') {
                        historyText += `Assistant: ${msg.content}\n`;
                    }
                });
            }

            const modelToUse = model || agentConfig.model_name;
            const maxSteps = Math.max(0, Math.min(10, parseInt(String(agentConfig?.config?.agent_max_steps ?? agentConfig?.metadata?.agent_max_steps ?? process.env.AGENT_MAX_STEPS ?? '3'), 10) || 3));
            const { toolTraceText, toolsUsed, directAnswer } = await this.runToolLoop({
                agentConfig,
                tools,
                modelToUse,
                query,
                historyText: chatHistory.map(m => `${m.role}: ${m.content}`).join('\n'),
                maxSteps
            });

            if (directAnswer) {
                memory.addUserMessage(query);
                memory.addAssistantMessage(directAnswer);
                const latency = Date.now() - startTime;
                return {
                    success: true,
                    output: directAnswer,
                    sessionId,
                    agentId,
                    model: modelToUse,
                    persona: agentConfig.persona_name || agentConfig.name,
                    latency,
                    toolsUsed
                };
            }

            // Build final prompt with history and tool trace
            let fullPrompt = systemPrompt;
            if (historyText) {
                fullPrompt += historyText;
            }
            fullPrompt += `\n\n[USER_QUERY]\n${query}`;

            if (toolTraceText) {
                fullPrompt += toolTraceText;
            }

            fullPrompt += `\n\n[INSTRUCTIONS]\nProvide a clear, helpful response.`;

            const response = await this.ollamaService.generate(
                fullPrompt,
                modelToUse,
                {
                    id: agentId,
                    name: agentConfig.name,
                    type: agentConfig.type,
                    status: agentConfig.status,
                    persona_name: agentConfig.persona_name,
                    system_prompt: agentConfig.system_prompt,
                    config: agentConfig.config
                }
            );

            // Save to memory
            memory.addUserMessage(query);
            memory.addAssistantMessage(response);

            // Clean old memories if too many
            if (sessionMemories.size > 100) {
                // Clear oldest memories (keep last 50)
                const keys = Array.from(sessionMemories.keys()).slice(0, 50);
                sessionMemories.forEach((_, key) => {
                    if (!keys.includes(key)) {
                        sessionMemories.delete(key);
                    }
                });
            }

            const latency = Date.now() - startTime;

            return {
                success: true,
                output: response,
                sessionId,
                agentId,
                model: modelToUse,
                persona: agentConfig.persona_name || agentConfig.name,
                latency,
                toolsUsed
            };

        } catch (error: any) {
            this.logger.error('Agent execution failed:', error);

            return {
                success: false,
                output: '',
                sessionId,
                agentId: agentId,
                model: model || 'unknown',
                persona: 'Unknown',
                latency: Date.now() - startTime,
                toolsUsed: [],
                error: error.message
            };
        }
    }

    async executeAgentStream(input: AgentExecutionStreamInput): Promise<AgentExecutionResult> {
        const startTime = Date.now();
        const { agentId, sessionId, query, model, onChunk } = input;

        try {
            const agentConfig = await this.getAgentConfig(agentId);
            if (!agentConfig) {
                throw new Error(`Agent ${agentId} not found`);
            }

            const memory = this.getSessionMemory(sessionId, agentConfig.buffer_memory_size);
            const tools = await this.getAgentTools(agentId);

            let systemPrompt = this.buildSystemPrompt(agentConfig);
            if (tools.length > 0) {
                const toolDescriptions = tools.map(t => `- ${t.name}: ${t.description}`).join('\n');
                systemPrompt += `\n\n[AVAILABLE_TOOLS]\n${toolDescriptions}\n\nUse these tools when appropriate to answer the user's question.`;
            }

            const chatHistory = memory.getHistory();
            const historyText = chatHistory.map(m => `${m.role}: ${m.content}`).join('\n');

            const modelToUse = model || agentConfig.model_name;
            const maxSteps = Math.max(0, Math.min(10, parseInt(String(agentConfig?.config?.agent_max_steps ?? agentConfig?.metadata?.agent_max_steps ?? process.env.AGENT_MAX_STEPS ?? '3'), 10) || 3));

            const { toolTraceText, toolsUsed, directAnswer } = await this.runToolLoop({
                agentConfig,
                tools,
                modelToUse,
                query,
                historyText,
                maxSteps
            });

            if (directAnswer) {
                if (onChunk) onChunk(directAnswer);
                memory.addUserMessage(query);
                memory.addAssistantMessage(directAnswer);
                return {
                    success: true,
                    output: directAnswer,
                    sessionId,
                    agentId,
                    model: modelToUse,
                    persona: agentConfig.persona_name || agentConfig.name,
                    latency: Date.now() - startTime,
                    toolsUsed
                };
            }

            let fullPrompt = systemPrompt;
            if (historyText) {
                fullPrompt += `\n\n[CONVERSATION_HISTORY]\n${historyText}`;
            }
            fullPrompt += `\n\n[USER_QUERY]\n${query}`;
            if (toolTraceText) {
                fullPrompt += toolTraceText;
            }
            fullPrompt += `\n\n[INSTRUCTIONS]\nProvide a clear, helpful response.`;

            let finalResponse = '';
            const streamed = await this.ollamaService.streamGenerate(
                fullPrompt,
                modelToUse,
                (chunk: string) => {
                    finalResponse += chunk;
                    if (onChunk) onChunk(chunk);
                },
                {
                    agentConfig: {
                        id: agentId,
                        name: agentConfig.name,
                        type: agentConfig.type,
                        status: agentConfig.status,
                        persona_name: agentConfig.persona_name,
                        system_prompt: agentConfig.system_prompt,
                        config: agentConfig.config
                    },
                    timeoutMs: 180000
                }
            );

            const safe = sanitizeModelResponse(streamed || finalResponse);
            memory.addUserMessage(query);
            memory.addAssistantMessage(safe);

            return {
                success: true,
                output: safe,
                sessionId,
                agentId,
                model: modelToUse,
                persona: agentConfig.persona_name || agentConfig.name,
                latency: Date.now() - startTime,
                toolsUsed
            };
        } catch (error: any) {
            this.logger.error('Agent streaming execution failed:', error);

            return {
                success: false,
                output: '',
                sessionId,
                agentId,
                model: model || 'unknown',
                persona: 'Unknown',
                latency: Date.now() - startTime,
                toolsUsed: [],
                error: error.message
            };
        }
    }

    /**
     * Clear session memory
     */
    clearSessionMemory(sessionId: string): boolean {
        return sessionMemories.delete(sessionId);
    }

    /**
     * Get all active sessions
     */
    getActiveSessions(): string[] {
        return Array.from(sessionMemories.keys());
    }

    /**
     * Get memory info for a session
     */
    async getSessionInfo(sessionId: string): Promise<any> {
        const memory = sessionMemories.get(sessionId);
        if (!memory) {
            return null;
        }

        const chatHistory = memory.getHistory();
        return {
            sessionId,
            messageCount: chatHistory.length,
            messages: chatHistory.map((msg: ChatMessage) => ({
                role: msg.role,
                content: msg.content?.substring(0, 100) || ''
            }))
        };
    }
}

// Export singleton instance
export const langChainAgentService = new LangChainAgentService();
export default LangChainAgentService;

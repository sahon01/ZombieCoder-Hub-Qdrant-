import axios, { AxiosResponse } from 'axios';
import type { AxiosError } from 'axios';
import { Logger } from '../utils/logger';
import { PromptTemplateService } from './promptTemplate';
import { applyGuardrailsToSystemPrompt, sanitizeModelResponse } from '../utils/ethics';
import fs from 'fs';
import path from 'path';

// Load identity.json
interface IdentityData {
    system_identity: {
        name: string;
        version: string;
        tagline: string;
        branding: {
            owner: string;
            organization: string;
            address: string;
            location: string;
            contact: {
                phone: string;
                email: string;
                website: string;
            };
            license: string;
        };
    };
}

let identityData: IdentityData | null = null;
try {
    const identityPath = path.join(process.cwd(), '..', 'identity.json');
    const identityFile = fs.readFileSync(identityPath, 'utf-8');
    identityData = JSON.parse(identityFile);
} catch (error) {
    console.warn('Could not load identity.json:', error);
}

export interface OllamaModel {
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
        format: string;
        family: string;
        families: string[];
        parameter_size: string;
        quantization_level: string;
    };
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system';
    content: string;
}

// Agent configuration from database
export interface AgentConfig {
    id: number;
    name: string;
    type: string;
    status: string;
    persona_name?: string;
    system_prompt?: string;
    config: {
        max_tokens?: number;
        temperature?: number;
        capabilities?: string[];
        language_preferences?: {
            greeting_prefix?: string;
            primary_language?: string;
            technical_language?: string;
        };
        system_instructions?: string;
        model?: string;
        metadata?: Record<string, any>;
    };
    metadata?: Record<string, any>;
}

export interface ChatResponse {
    model: string;
    created_at: string;
    message: {
        role: string;
        content: string;
    };
    done: boolean;
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export interface GenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
    context?: number[];
    total_duration?: number;
    load_duration?: number;
    prompt_eval_count?: number;
    prompt_eval_duration?: number;
    eval_count?: number;
    eval_duration?: number;
}

export class OllamaService {
    private baseURL: string;
    private defaultModel: string;
    private apiKey: string | null;
    private logger: Logger;
    public isConnected: boolean = false;

    private formatAxiosError(error: any): Record<string, any> {
        const e = error as AxiosError;
        return {
            message: e?.message,
            code: (e as any)?.code,
            status: e?.response?.status,
            statusText: e?.response?.statusText,
            url: (e as any)?.config?.url,
            method: (e as any)?.config?.method,
            timeout: (e as any)?.config?.timeout,
            responseData: typeof e?.response?.data === 'string'
                ? e.response.data.slice(0, 500)
                : e?.response?.data
        };
    }

    constructor() {
        this.baseURL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
        this.defaultModel = process.env.OLLAMA_DEFAULT_MODEL || 'llama3.1:latest';
        this.apiKey = process.env.OLLAMA_CLOUD_API_KEY || process.env.OLLAMA_API_KEY || null;
        this.logger = new Logger();
    }

    private buildHeaders(apiKeyOverride?: string | null): Record<string, string> {
        const key = typeof apiKeyOverride === 'string' && apiKeyOverride.trim() ? apiKeyOverride.trim() : this.apiKey;
        if (!key) return {};
        return { Authorization: `Bearer ${key}` };
    }

    // Build system prompt from agent configuration
    private buildSystemPrompt(agentConfig?: AgentConfig): string {
        const parts: string[] = [];

        // Get system_prompt from metadata if available
        let systemPromptFromDB = agentConfig?.system_prompt;
        if (!systemPromptFromDB && agentConfig?.config?.metadata) {
            const metadata = agentConfig.config.metadata as any;
            systemPromptFromDB = metadata?.system_prompt;
        }
        // Also check top-level metadata field
        if (!systemPromptFromDB && agentConfig?.metadata) {
            const metadata = agentConfig.metadata as any;
            systemPromptFromDB = metadata?.system_prompt;
        }

        // If agent has a custom system_prompt from database, use it first
        if (systemPromptFromDB) {
            // Prepend identity info
            if (identityData) {
                const identity = identityData.system_identity;
                parts.push(`[SYSTEM_IDENTITY]`);
                parts.push(`You are part of the ${identity.name} System (v${identity.version}).`);
                parts.push(`Tagline: "${identity.tagline}".`);
                parts.push(`Organization: ${identity.branding.organization}.`);
                parts.push(`Owner: ${identity.branding.owner}.`);
                parts.push(`Location: ${identity.branding.location}.`);
                parts.push('');
            }
            // Add the database system prompt
            parts.push(applyGuardrailsToSystemPrompt(systemPromptFromDB));
            return applyGuardrailsToSystemPrompt(parts.join('\n'));
        }

        // Add identity information from identity.json if available
        if (identityData) {
            const identity = identityData.system_identity;
            parts.push(`[SYSTEM_IDENTITY]`);
            parts.push(`You are part of the ${identity.name} System (v${identity.version}).`);
            parts.push(`Tagline: "${identity.tagline}".`);
            parts.push(`Organization: ${identity.branding.organization}.`);
            parts.push(`Owner: ${identity.branding.owner}.`);
            parts.push(`Location: ${identity.branding.location}.`);
        }

        if (!agentConfig) {
            return parts.join('\n');
        }

        const config = agentConfig.config || {};
        const langPrefs = config.language_preferences || {};
        const capabilities = config.capabilities?.join(', ') || 'general tasks';

        parts.push(`[AGENT_IDENTITY]`);
        parts.push(`You are ${agentConfig.name}, a ${agentConfig.type} agent.`);
        parts.push(`Your role is to help with ${capabilities}.`);

        // Add greeting prefix if available
        if (langPrefs.greeting_prefix) {
            parts.push(`Always start your response with "${langPrefs.greeting_prefix}" (Bengali greeting).`);
        }

        // Add primary language preference
        if (langPrefs.primary_language) {
            const langMap: Record<string, string> = {
                'bn': 'Bengali',
                'en': 'English',
                'hi': 'Hindi',
                'es': 'Spanish',
                'fr': 'French'
            };
            const langName = langMap[langPrefs.primary_language] || langPrefs.primary_language;
            parts.push(`Your primary language should be ${langName}.`);
        }

        // Add custom system instructions if available
        if (config.system_instructions) {
            parts.push(`[CUSTOM_INSTRUCTIONS] ${config.system_instructions}`);
        }

        // Important: Never identify as the underlying model
        parts.push(`[IMPORTANT] Never identify yourself as Qwen, LLaMA, GPT, Claude, or any other base AI model. You are ${agentConfig.name}, a representative of ${identityData?.system_identity.name || 'the UAS System'}.`);

        return applyGuardrailsToSystemPrompt(parts.join('\n\n'));
    }

    // Build full prompt with system instructions for generate endpoint
    private buildFullPrompt(userPrompt: string, agentConfig?: AgentConfig): string {
        const systemPrompt = this.buildSystemPrompt(agentConfig);
        const greetingPrefix = agentConfig?.config?.language_preferences?.greeting_prefix || '';

        if (systemPrompt) {
            if (greetingPrefix) {
                return `${systemPrompt}\n\nUser: ${userPrompt}\n${agentConfig?.name}: ${greetingPrefix}`;
            }
            return `${systemPrompt}\n\nUser: ${userPrompt}\n${agentConfig?.name}:`;
        }
        return userPrompt;
    }

    // Build messages array with system message for chat endpoint
    private buildMessages(userPrompt: string, agentConfig?: AgentConfig): ChatMessage[] {
        const messages: ChatMessage[] = [];

        const systemPrompt = this.buildSystemPrompt(agentConfig);
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        // Add greeting prefix to user message if available
        const greetingPrefix = agentConfig?.config?.language_preferences?.greeting_prefix || '';
        const finalUserMessage = greetingPrefix
            ? `${greetingPrefix} ${userPrompt}`
            : userPrompt;

        messages.push({ role: 'user', content: finalUserMessage });

        return messages;
    }

    async testConnection(overrides?: { baseURL?: string; apiKey?: string | null }): Promise<boolean> {
        try {
            const resolvedBaseURL = (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim())
                ? overrides.baseURL.trim().replace(/\/+$/, '')
                : this.baseURL;
            const response = await axios.get(`${resolvedBaseURL}/api/tags`, {
                timeout: 5000,
                headers: this.buildHeaders(overrides?.apiKey)
            });
            this.isConnected = response.status === 200;
            return this.isConnected;
        } catch (error) {
            this.logger.error('Ollama connection test failed:', error);
            this.isConnected = false;
            return false;
        }
    }

    async getModels(overrides?: { baseURL?: string; apiKey?: string | null }): Promise<OllamaModel[]> {
        try {
            const resolvedBaseURL = (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim())
                ? overrides.baseURL.trim().replace(/\/+$/, '')
                : this.baseURL;
            const response: AxiosResponse<{ models: OllamaModel[] }> = await axios.get(
                `${resolvedBaseURL}/api/tags`,
                { headers: this.buildHeaders(overrides?.apiKey) }
            );
            return response.data.models || [];
        } catch (error) {
            this.logger.error('Failed to fetch models:', error);
            throw new Error('Failed to fetch models from Ollama');
        }
    }

    async generate(
        prompt: string,
        model?: string,
        agentConfig?: AgentConfig,
        overrides?: {
            baseURL?: string;
            timeoutMs?: number;
            preferStreaming?: boolean;
            apiKey?: string | null;
            rawPrompt?: boolean;
            ollamaOptions?: Partial<{
                temperature: number;
                top_p: number;
                num_predict: number;
                stop: string[];
            }>;
        }
    ): Promise<string> {
        try {
            // Use PromptTemplateService for better prompt generation
            let fullPrompt: string;
            if (overrides?.rawPrompt) {
                fullPrompt = prompt;
            } else if (agentConfig) {
                fullPrompt = PromptTemplateService.generatePrompt(prompt, agentConfig);
            } else {
                fullPrompt = this.buildFullPrompt(prompt, agentConfig);
            }

            const resolvedBaseURL = (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim())
                ? overrides.baseURL.trim().replace(/\/+$/, '')
                : this.baseURL;
            const resolvedTimeoutMs = typeof overrides?.timeoutMs === 'number' ? overrides.timeoutMs : 180000;
            const preferStreaming = Boolean(overrides?.preferStreaming);

            if (preferStreaming) {
                return await this.streamGenerate(prompt, model || agentConfig?.config?.model || this.defaultModel, undefined, {
                    baseURL: resolvedBaseURL,
                    timeoutMs: resolvedTimeoutMs,
                    apiKey: overrides?.apiKey,
                    agentConfig
                });
            }

            const response: AxiosResponse<GenerateResponse> = await axios.post(
                `${resolvedBaseURL}/api/generate`,
                {
                    model: model || agentConfig?.config?.model || this.defaultModel,
                    prompt: fullPrompt,
                    stream: false,
                    options: {
                        temperature: overrides?.ollamaOptions?.temperature ?? 0.05,
                        top_p: overrides?.ollamaOptions?.top_p ?? 0.3,
                        num_predict: overrides?.ollamaOptions?.num_predict ?? 300,
                        stop: overrides?.ollamaOptions?.stop ?? ["User:", "Assistant:"]
                    }
                },
                {
                    timeout: resolvedTimeoutMs,
                    headers: this.buildHeaders(overrides?.apiKey)
                }
            );

            return sanitizeModelResponse(response.data.response || 'No response generated');
        } catch (error) {
            this.logger.error('Failed to generate response:', {
                resolvedBaseURL: (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim()) ? overrides.baseURL.trim() : this.baseURL,
                model: model || agentConfig?.config?.model || this.defaultModel,
                axios: this.formatAxiosError(error)
            });
            throw new Error('Failed to generate response from Ollama');
        }
    }

    async chat(
        messages: ChatMessage[],
        model?: string,
        agentConfig?: AgentConfig,
        overrides?: { baseURL?: string; timeoutMs?: number; preferStreaming?: boolean; apiKey?: string | null }
    ): Promise<string> {
        try {
            // Use PromptTemplateService for better chat prompt
            let allMessages = messages;
            if (agentConfig) {
                // Get the last user message
                const lastUserMessage = messages[messages.length - 1]?.content || '';
                const chatHistory = messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n');

                const systemPrompt = PromptTemplateService.generatePrompt('', agentConfig);
                const userPrompt = PromptTemplateService.generateChatPrompt(lastUserMessage, chatHistory, agentConfig);

                allMessages = [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ];
            }

            const resolvedBaseURL = (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim())
                ? overrides.baseURL.trim().replace(/\/+$/, '')
                : this.baseURL;
            const resolvedTimeoutMs = typeof overrides?.timeoutMs === 'number' ? overrides.timeoutMs : 180000;

            const response: AxiosResponse<ChatResponse> = await axios.post(
                `${resolvedBaseURL}/api/chat`,
                {
                    model: model || agentConfig?.config?.model || this.defaultModel,
                    messages: allMessages,
                    stream: true,
                    options: {
                        temperature: 0.05,
                        top_p: 0.3,
                        num_predict: 300,
                        stop: ["User:", "Assistant:"]
                    }
                },
                {
                    timeout: resolvedTimeoutMs,
                    headers: this.buildHeaders(overrides?.apiKey)
                }
            );

            return sanitizeModelResponse(response.data.message?.content || 'No response generated');
        } catch (error) {
            this.logger.error('Failed to chat:', error);
            throw new Error('Failed to chat with Ollama');
        }
    }

    async streamGenerate(
        prompt: string,
        model?: string,
        onChunk?: (chunk: string) => void,
        overrides?: { baseURL?: string; timeoutMs?: number; apiKey?: string | null; agentConfig?: AgentConfig }
    ): Promise<string> {
        try {
            const agentConfig = overrides?.agentConfig;

            // Apply agent/system prompt template just like non-stream generate()
            const fullPrompt = agentConfig
                ? PromptTemplateService.generatePrompt(prompt, agentConfig)
                : this.buildFullPrompt(prompt, agentConfig);

            const resolvedBaseURL = (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim())
                ? overrides.baseURL.trim().replace(/\/+$/, '')
                : this.baseURL;
            const resolvedTimeoutMs = typeof overrides?.timeoutMs === 'number' ? overrides.timeoutMs : 60000;

            const response = await axios.post(
                `${resolvedBaseURL}/api/generate`,
                {
                    model: model || this.defaultModel,
                    prompt: fullPrompt,
                    stream: true
                },
                {
                    responseType: 'stream',
                    timeout: resolvedTimeoutMs,
                    headers: this.buildHeaders(overrides?.apiKey)
                }
            );

            let fullResponse = '';

            return new Promise((resolve, reject) => {
                let buf = '';
                response.data.on('data', (chunk: Buffer) => {
                    buf += chunk.toString('utf8');
                    const lines = buf.split(/\r?\n/);
                    buf = lines.pop() ?? '';

                    for (const raw of lines) {
                        const line = raw.trim();
                        if (!line) continue;

                        try {
                            const data = JSON.parse(line);
                            if (data.response) {
                                const chunkText: string = data.response;
                                const safeChunk = chunkText.replace(/alibaba\s*cloud/gi, '').replace(/created\s+by\s+alibaba/gi, '').replace(/developed\s+by\s+alibaba/gi, '');
                                fullResponse += safeChunk;
                                if (onChunk) {
                                    onChunk(safeChunk);
                                }
                            }
                            if (data.done) {
                                resolve(sanitizeModelResponse(fullResponse));
                                return;
                            }
                        } catch (parseError) {
                            // ignore; usually incomplete JSON line (handled by buffer) or non-JSON noise
                        }
                    }
                });

                response.data.on('error', (error: any) => {
                    this.logger.error('Stream error:', error);
                    reject(error);
                });

                response.data.on('end', () => {
                    // Process any buffered line
                    const leftover = buf.trim();
                    if (leftover) {
                        try {
                            const data = JSON.parse(leftover);
                            if (data.response) {
                                const chunkText: string = data.response;
                                const safeChunk = chunkText.replace(/alibaba\s*cloud/gi, '').replace(/created\s+by\s+alibaba/gi, '').replace(/developed\s+by\s+alibaba/gi, '');
                                fullResponse += safeChunk;
                                if (onChunk) {
                                    onChunk(safeChunk);
                                }
                            }
                        } catch {
                            // ignore
                        }
                    }

                    if (fullResponse) {
                        resolve(sanitizeModelResponse(fullResponse));
                        return;
                    }

                    resolve('');
                });
            });
        } catch (error) {
            this.logger.error('Failed to stream generate:', {
                resolvedBaseURL: (typeof overrides?.baseURL === 'string' && overrides.baseURL.trim()) ? overrides.baseURL.trim() : this.baseURL,
                model: model || this.defaultModel,
                axios: this.formatAxiosError(error)
            });
            throw new Error('Failed to stream generate from Ollama');
        }
    }

    async pullModel(modelName: string): Promise<boolean> {
        try {
            await axios.post(`${this.baseURL}/api/pull`, {
                name: modelName,
                stream: false
            }, {
                timeout: 300000, // 5 minutes timeout for model pulling
                headers: this.buildHeaders()
            });
            return true;
        } catch (error) {
            this.logger.error('Failed to pull model:', error);
            return false;
        }
    }

    async getModelInfo(modelName: string): Promise<any> {
        try {
            const response = await axios.post(`${this.baseURL}/api/show`, {
                name: modelName
            }, {
                headers: this.buildHeaders()
            });
            return response.data;
        } catch (error) {
            this.logger.error('Failed to get model info:', error);
            throw new Error('Failed to get model information');
        }
    }

    // Health check for Ollama service
    async healthCheck(): Promise<{ status: string; models: number; defaultModel: string }> {
        try {
            const models = await this.getModels();
            return {
                status: 'healthy',
                models: models.length,
                defaultModel: this.defaultModel
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                models: 0,
                defaultModel: this.defaultModel
            };
        }
    }

    // Get Ollama base URL
    getOllamaUrl(): string {
        return this.baseURL;
    }
}

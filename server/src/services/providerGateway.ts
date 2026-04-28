import axios from 'axios';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';
import { OllamaService, AgentConfig, ChatMessage } from './ollama';
import { PromptTemplateService } from './promptTemplateService';

type ProviderType = 'openai' | 'google' | 'glm' | 'ollama' | 'llama_cpp' | 'custom';

type ProviderRow = {
  id: number;
  name: string;
  type: string;
  api_endpoint: string;
  config_json?: any;
  is_active: number | boolean;
};

type ActiveProviderSettings = {
  providerId: number | null;
  providerType: ProviderType | null;
  providerEndpoint: string | null;
  providerName: string | null;
  defaultModel: string | null;
  requestTimeoutMs: number;
  preferStreaming: boolean;
};

export class ProviderGateway {
  private logger = new Logger();
  private ollama = new OllamaService();

  private buildLlamaCppSystemMessage(agentConfig?: any): { role: 'system'; content: string } {
    // Use agent's system_prompt if available, otherwise use default
    if (agentConfig?.system_prompt && typeof agentConfig.system_prompt === 'string') {
      const fullPrompt = PromptTemplateService.buildSystemPrompt(agentConfig);
      return { role: 'system', content: fullPrompt };
    }
    
    // Fallback to minimal prompt
    const systemPrompt = PromptTemplateService.buildSystemPrompt();
    return { role: 'system', content: systemPrompt };
  }

  async generateStream(
    prompt: string,
    modelOverride: string | undefined,
    agentConfig: AgentConfig | undefined,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const settings = await this.getActiveProviderSettings();

    const resolvedModel =
      (typeof modelOverride === 'string' && modelOverride.trim() ? modelOverride.trim() : null) ||
      (typeof agentConfig?.config?.model === 'string' && agentConfig.config.model.trim() ? agentConfig.config.model.trim() : null) ||
      settings.defaultModel ||
      'llama3.1:latest';

    // If no active provider: prefer Ollama if available; otherwise fall back to local llama.cpp (OpenAI-compatible)
    if (!settings.providerType) {
      const llamaFallbackEnabled = this.resolveEnvBoolean('LLAMA_CPP_FALLBACK_ENABLED');

      try {
        const ok = await this.ollama.testConnection();
        if (ok) {
          return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
            timeoutMs: settings.requestTimeoutMs,
            agentConfig
          });
        }
      } catch {
      }

      if (llamaFallbackEnabled) {
        const endpoint = this.getLocalLlamaCppEndpoint();
        const msg = [this.buildLlamaCppSystemMessage(), { role: 'user', content: prompt }];
        return this.openAiCompatibleChatStream(endpoint, null, resolvedModel, msg, settings.requestTimeoutMs, onChunk);
      }

      return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
        timeoutMs: settings.requestTimeoutMs,
        agentConfig
      });
    }

    // Load provider config
    let providerConfig: any = {};
    try {
      const rows = await executeQuery('SELECT config_json FROM ai_providers WHERE id = ? LIMIT 1', [settings.providerId]);
      const cfg = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).config_json : null;
      providerConfig = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
    } catch {
      providerConfig = {};
    }

    if (settings.providerType === 'llama_cpp') {
      if (!settings.providerEndpoint) {
        throw new Error('llama.cpp provider endpoint is missing');
      }
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      const msg = [this.buildLlamaCppSystemMessage(), { role: 'user', content: prompt }];
      return this.openAiCompatibleChatStream(settings.providerEndpoint, apiKey, resolvedModel, msg, settings.requestTimeoutMs, onChunk);
    }

    if (settings.providerEndpoint) {
      // Treat endpoint as Ollama-compatible generate stream
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
        baseURL: settings.providerEndpoint,
        timeoutMs: settings.requestTimeoutMs,
        apiKey,
        agentConfig
      });
    }

    return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
      timeoutMs: settings.requestTimeoutMs,
      agentConfig
    });
  }

  private resolveEnvBoolean(key: string): boolean {
    const v = String(process.env[key] || '').trim().toLowerCase();
    return v === '1' || v === 'true' || v === 'yes' || v === 'on';
  }

  private getLocalLlamaCppEndpoint(): string {
    const host = String(process.env.LLAMA_CPP_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const port = parseInt(String(process.env.LLAMA_CPP_PORT || '15000'), 10);
    const p = Number.isFinite(port) ? port : 15000;
    return `http://${host}:${p}`;
  }

  private normalizeProviderType(rawType: unknown): ProviderType | null {
    const t = String(rawType || '').trim().toLowerCase();
    if (!t) return null;
    if (t === 'google' || t === 'gemini') return 'google';
    if (t === 'ollama') return 'ollama';
    if (t === 'ollama_cloud' || t === 'ollama-cloud' || t === 'ollamacloud') return 'ollama';
    if (t === 'openai') return 'openai';
    if (t === 'glm') return 'glm';
    if (t === 'custom') return 'custom';
    if (t === 'llama_cpp' || t === 'llama.cpp' || t === 'llama-cpp' || t === 'llamacpp') return 'llama_cpp';
    return 'custom';
  }

  private async getSystemSetting(key: string): Promise<string | null> {
    try {
      const rows = await executeQuery(
        'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
        [key]
      );
      if (!Array.isArray(rows) || rows.length === 0) return null;
      return (rows[0] as any).setting_value ?? null;
    } catch {
      return null;
    }
  }

  private resolveEnvNumber(key: string, fallback: number): number {
    const raw = process.env[key];
    if (!raw) return fallback;
    const v = parseInt(raw, 10);
    return Number.isFinite(v) && v > 0 ? v : fallback;
  }

  private async getActiveProviderSettings(): Promise<ActiveProviderSettings> {
    const timeoutFromEnv = this.resolveEnvNumber('MODEL_REQUEST_TIMEOUT_MS', 180000);
    const preferStreamingEnv = String(process.env.PREFER_STREAMING || '').toLowerCase();

    const defaultModel =
      (await this.getSystemSetting('default_model')) ||
      process.env.OLLAMA_DEFAULT_MODEL ||
      null;

    const preferStreamingSetting = await this.getSystemSetting('prefer_streaming');
    const timeoutSetting = await this.getSystemSetting('model_request_timeout_ms');
    const activeProviderIdSetting = await this.getSystemSetting('active_provider_id');

    const preferStreaming =
      (typeof preferStreamingSetting === 'string' && preferStreamingSetting.trim() !== ''
        ? ['1', 'true', 'yes', 'on'].includes(preferStreamingSetting.trim().toLowerCase())
        : preferStreamingEnv === '1' || preferStreamingEnv === 'true') ||
      false;

    const requestTimeoutMs =
      (typeof timeoutSetting === 'string' && timeoutSetting.trim() !== ''
        ? parseInt(timeoutSetting.trim(), 10)
        : timeoutFromEnv) ||
      timeoutFromEnv;

    const providerId =
      typeof activeProviderIdSetting === 'string' && activeProviderIdSetting.trim() !== ''
        ? parseInt(activeProviderIdSetting.trim(), 10)
        : null;

    if (!providerId || Number.isNaN(providerId)) {
      return {
        providerId: null,
        providerType: null,
        providerEndpoint: null,
        providerName: null,
        defaultModel,
        requestTimeoutMs,
        preferStreaming
      };
    }

    try {
      const rows = await executeQuery(
        'SELECT id, name, type, api_endpoint, config_json, is_active FROM ai_providers WHERE id = ? LIMIT 1',
        [providerId]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        return {
          providerId,
          providerType: null,
          providerEndpoint: null,
          providerName: null,
          defaultModel,
          requestTimeoutMs,
          preferStreaming
        };
      }

      const row = rows[0] as ProviderRow;
      const isActive = Boolean((row as any).is_active ?? (row as any).isActive ?? true);
      if (!isActive) {
        return {
          providerId,
          providerType: null,
          providerEndpoint: null,
          providerName: row.name || null,
          defaultModel,
          requestTimeoutMs,
          preferStreaming
        };
      }

      const endpoint = String((row as any).api_endpoint || '').trim();
      let config: any = (row as any).config_json;
      if (typeof config === 'string') {
        try {
          config = JSON.parse(config);
        } catch {
          config = {};
        }
      }

      // Allow provider-specific timeout override via config_json.timeout_ms
      const cfgTimeout = typeof config?.timeout_ms === 'number' ? config.timeout_ms : undefined;
      const cfgPreferStreaming = typeof config?.prefer_streaming === 'boolean' ? config.prefer_streaming : undefined;

      return {
        providerId,
        providerType: this.normalizeProviderType(row.type),
        providerEndpoint: endpoint || null,
        providerName: row.name || null,
        defaultModel,
        requestTimeoutMs: typeof cfgTimeout === 'number' ? cfgTimeout : requestTimeoutMs,
        preferStreaming: typeof cfgPreferStreaming === 'boolean' ? cfgPreferStreaming : preferStreaming
      };
    } catch (e) {
      this.logger.warn('Failed to resolve active provider; falling back to env/default provider', e);
      return {
        providerId,
        providerType: null,
        providerEndpoint: null,
        providerName: null,
        defaultModel,
        requestTimeoutMs,
        preferStreaming
      };
    }
  }

  private resolveApiKeyFromConfig(config: any): string | null {
    // Security policy: do NOT persist raw API keys in DB. Accept only env var references.
    const envVar = typeof config?.apiKeyEnvVar === 'string' ? config.apiKeyEnvVar.trim() : '';
    if (envVar && process.env[envVar]) return String(process.env[envVar]);

    // Allow fallback to conventional env names.
    if (process.env.OLLAMA_CLOUD_API_KEY) return String(process.env.OLLAMA_CLOUD_API_KEY);
    if (process.env.OLLAMA_API_KEY) return String(process.env.OLLAMA_API_KEY);
    if (process.env.GOOGLE_GEMINI_API_KEY) return String(process.env.GOOGLE_GEMINI_API_KEY);
    if (process.env.GOOGLE_API_KEY) return String(process.env.GOOGLE_API_KEY);
    return null;
  }

  private async geminiGenerate(prompt: string, model: string, timeoutMs: number, config: any): Promise<string> {
    const apiKey = this.resolveApiKeyFromConfig(config);
    if (!apiKey) {
      throw new Error('Gemini API key not configured. Set GOOGLE_GEMINI_API_KEY (or config_json.apiKeyEnvVar).');
    }

    // Endpoint default: https://generativelanguage.googleapis.com
    const base = (typeof config?.base_url === 'string' && config.base_url.trim())
      ? config.base_url.trim().replace(/\/+$/, '')
      : 'https://generativelanguage.googleapis.com';

    const url = `${base}/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await axios.post(
      url,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      },
      {
        timeout: timeoutMs,
        validateStatus: () => true,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      throw new Error(`Gemini request failed (${response.status}): ${msg}`);
    }

    const candidates = (response.data as any)?.candidates;
    const text = candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || '';
    return String(text || '').trim();
  }

  private async openAiCompatibleChat(
    endpoint: string,
    apiKey: string | null,
    model: string,
    messages: Array<{ role: string; content: string }>,
    timeoutMs: number
  ): Promise<string> {
    const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
    const response = await axios.post(
      url,
      {
        model,
        messages,
        stream: false
      },
      {
        timeout: timeoutMs,
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      throw new Error(`OpenAI-compatible request failed (${response.status}): ${msg}`);
    }

    const content = (response.data as any)?.choices?.[0]?.message?.content;
    return String(content || '').trim();
  }

  private async openAiCompatibleChatStream(
    endpoint: string,
    apiKey: string | null,
    model: string,
    messages: Array<{ role: string; content: string }>,
    timeoutMs: number,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const url = `${endpoint.replace(/\/+$/, '')}/v1/chat/completions`;
    const response = await axios.post(
      url,
      {
        model,
        messages,
        stream: true
      },
      {
        timeout: timeoutMs,
        validateStatus: () => true,
        responseType: 'stream',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
        }
      }
    );

    if (response.status < 200 || response.status >= 300) {
      const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
      throw new Error(`OpenAI-compatible stream request failed (${response.status}): ${msg}`);
    }

    let full = '';
    return new Promise((resolve, reject) => {
      let buf = '';

      response.data.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const lines = buf.split(/\r?\n/);
        buf = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line) continue;
          if (!line.startsWith('data:')) continue;

          const data = line.slice('data:'.length).trim();
          if (!data || data === '[DONE]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed?.choices?.[0]?.delta?.content;
            if (typeof delta === 'string' && delta) {
              full += delta;
              if (onChunk) onChunk(delta);
            }
          } catch {
            // ignore
          }
        }
      });

      response.data.on('error', (err: any) => {
        reject(err);
      });

      response.data.on('end', () => {
        resolve(String(full || '').trim());
      });
    });
  }

  async generate(prompt: string, modelOverride?: string, agentConfig?: AgentConfig): Promise<string> {
    const settings = await this.getActiveProviderSettings();

    // Model selection: request override > agent config model > system default
    const resolvedModel =
      (typeof modelOverride === 'string' && modelOverride.trim() ? modelOverride.trim() : null) ||
      (typeof agentConfig?.config?.model === 'string' && agentConfig.config.model.trim() ? agentConfig.config.model.trim() : null) ||
      settings.defaultModel ||
      'llama3.1:latest';

    // If no active provider: prefer Ollama if available; otherwise fall back to local llama.cpp (OpenAI-compatible)
    if (!settings.providerType) {
      const llamaFallbackEnabled = this.resolveEnvBoolean('LLAMA_CPP_FALLBACK_ENABLED');

      try {
        const ok = await this.ollama.testConnection();
        if (ok) {
          return this.ollama.generate(prompt, resolvedModel, agentConfig, {
            timeoutMs: settings.requestTimeoutMs,
            preferStreaming: settings.preferStreaming
          });
        }
      } catch {
      }

      if (llamaFallbackEnabled) {
        const endpoint = this.getLocalLlamaCppEndpoint();
        const msg = [this.buildLlamaCppSystemMessage(agentConfig), { role: 'user', content: prompt }];
        return this.openAiCompatibleChat(endpoint, null, resolvedModel, msg, settings.requestTimeoutMs);
      }

      return this.ollama.generate(prompt, resolvedModel, agentConfig, {
        timeoutMs: settings.requestTimeoutMs,
        preferStreaming: settings.preferStreaming
      });
    }

    // Load provider config
    let providerConfig: any = {};
    try {
      const rows = await executeQuery('SELECT config_json FROM ai_providers WHERE id = ? LIMIT 1', [settings.providerId]);
      const cfg = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).config_json : null;
      providerConfig = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
    } catch {
      providerConfig = {};
    }

    if (settings.providerType === 'google') {
      const geminiModel =
        (typeof providerConfig?.default_model === 'string' && providerConfig.default_model.trim()
          ? providerConfig.default_model.trim()
          : resolvedModel);
      // Apply guardrails/system prompt for Google (Gemini) from agentConfig
      let finalPrompt = prompt;
      if (agentConfig?.system_prompt && typeof agentConfig.system_prompt === 'string') {
        finalPrompt = `${agentConfig.system_prompt.trim()}\n\nUser: ${prompt}`;
      }
      return this.geminiGenerate(finalPrompt, geminiModel, settings.requestTimeoutMs, providerConfig);
    }

    if (settings.providerType === 'llama_cpp') {
      if (!settings.providerEndpoint) {
        throw new Error('llama.cpp provider endpoint is missing');
      }

      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      const msg = [this.buildLlamaCppSystemMessage(agentConfig), { role: 'user', content: prompt }];
      return this.openAiCompatibleChat(settings.providerEndpoint, apiKey, resolvedModel, msg, settings.requestTimeoutMs);
    }

    // ollama/custom/openai/glm: treat as ollama-like if endpoint provided.
    if (settings.providerEndpoint) {
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      return this.ollama.generate(prompt, resolvedModel, agentConfig, {
        baseURL: settings.providerEndpoint,
        apiKey,
        timeoutMs: settings.requestTimeoutMs,
        preferStreaming: settings.preferStreaming
      });
    }

    return this.ollama.generate(prompt, resolvedModel, agentConfig, {
      timeoutMs: settings.requestTimeoutMs,
      preferStreaming: settings.preferStreaming
    });
  }

  async chat(messages: ChatMessage[], modelOverride?: string, agentConfig?: AgentConfig): Promise<string> {
    const settings = await this.getActiveProviderSettings();

    const resolvedModel =
      (typeof modelOverride === 'string' && modelOverride.trim() ? modelOverride.trim() : null) ||
      (typeof agentConfig?.config?.model === 'string' && agentConfig.config.model.trim() ? agentConfig.config.model.trim() : null) ||
      settings.defaultModel ||
      'llama3.1:latest';

    if (!settings.providerType) {
      const llamaFallbackEnabled = this.resolveEnvBoolean('LLAMA_CPP_FALLBACK_ENABLED');

      try {
        const ok = await this.ollama.testConnection();
        if (ok) {
          return this.ollama.chat(messages, resolvedModel, agentConfig, {
            timeoutMs: settings.requestTimeoutMs,
            preferStreaming: settings.preferStreaming
          });
        }
      } catch {
      }

      if (llamaFallbackEnabled) {
        const endpoint = this.getLocalLlamaCppEndpoint();
        return this.openAiCompatibleChat(
          endpoint,
          null,
          resolvedModel,
          [
            this.buildLlamaCppSystemMessage(agentConfig),
            ...messages.map(m => ({ role: m.role, content: m.content }))
          ],
          settings.requestTimeoutMs
        );
      }

      return this.ollama.chat(messages, resolvedModel, agentConfig, {
        timeoutMs: settings.requestTimeoutMs,
        preferStreaming: settings.preferStreaming
      });
    }

    let providerConfig: any = {};
    try {
      const rows = await executeQuery('SELECT config_json FROM ai_providers WHERE id = ? LIMIT 1', [settings.providerId]);
      const cfg = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).config_json : null;
      providerConfig = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
    } catch {
      providerConfig = {};
    }

    if (settings.providerType === 'google') {
      const modelName =
        (typeof providerConfig?.default_model === 'string' && providerConfig.default_model.trim()
          ? providerConfig.default_model.trim()
          : resolvedModel);

      // Apply guardrails/system prompt for Google (Gemini) from agentConfig
      const finalMessages: Array<{ role: string; content: string }> = [];
      if (agentConfig?.system_prompt && typeof agentConfig.system_prompt === 'string') {
        finalMessages.push({ role: 'system', content: agentConfig.system_prompt.trim() });
      }
      finalMessages.push(...messages.map(m => ({ role: m.role, content: m.content })));

      // Simple serialization for Gemini (since Gemini API expects a single string)
      const joined = finalMessages.map(m => `${m.role}: ${m.content}`).join('\n');
      return this.geminiGenerate(joined, modelName, settings.requestTimeoutMs, providerConfig);
    }

    if (settings.providerType === 'llama_cpp') {
      if (!settings.providerEndpoint) {
        throw new Error('llama.cpp provider endpoint is missing');
      }
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      return this.openAiCompatibleChat(
        settings.providerEndpoint,
        apiKey,
        resolvedModel,
        [
          this.buildLlamaCppSystemMessage(agentConfig),
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        settings.requestTimeoutMs
      );
    }

    if (settings.providerEndpoint) {
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      return this.ollama.chat(messages, resolvedModel, agentConfig, {
        baseURL: settings.providerEndpoint,
        apiKey,
        timeoutMs: settings.requestTimeoutMs,
        preferStreaming: settings.preferStreaming
      });
    }

    return this.ollama.chat(messages, resolvedModel, agentConfig, {
      timeoutMs: settings.requestTimeoutMs,
      preferStreaming: settings.preferStreaming
    });
  }

  async chatStream(
    messages: ChatMessage[],
    modelOverride: string | undefined,
    agentConfig: AgentConfig | undefined,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const settings = await this.getActiveProviderSettings();

    const resolvedModel =
      (typeof modelOverride === 'string' && modelOverride.trim() ? modelOverride.trim() : null) ||
      (typeof agentConfig?.config?.model === 'string' && agentConfig.config.model.trim() ? agentConfig.config.model.trim() : null) ||
      settings.defaultModel ||
      'llama3.1:latest';

    if (!settings.providerType) {
      const llamaFallbackEnabled = this.resolveEnvBoolean('LLAMA_CPP_FALLBACK_ENABLED');

      try {
        const ok = await this.ollama.testConnection();
        if (ok) {
          // Use a serialized prompt for streaming generate
          const joined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
          return this.ollama.streamGenerate(joined, resolvedModel, onChunk, {
            timeoutMs: settings.requestTimeoutMs,
            agentConfig
          });
        }
      } catch {
      }

      if (llamaFallbackEnabled) {
        const endpoint = this.getLocalLlamaCppEndpoint();
        return this.openAiCompatibleChatStream(
          endpoint,
          null,
          resolvedModel,
          [this.buildLlamaCppSystemMessage(), ...messages.map(m => ({ role: m.role, content: m.content }))],
          settings.requestTimeoutMs,
          onChunk
        );
      }

      const joined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      return this.ollama.streamGenerate(joined, resolvedModel, onChunk, {
        timeoutMs: settings.requestTimeoutMs,
        agentConfig
      });
    }

    let providerConfig: any = {};
    try {
      const rows = await executeQuery('SELECT config_json FROM ai_providers WHERE id = ? LIMIT 1', [settings.providerId]);
      const cfg = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).config_json : null;
      providerConfig = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
    } catch {
      providerConfig = {};
    }

    if (settings.providerType === 'llama_cpp') {
      if (!settings.providerEndpoint) {
        throw new Error('llama.cpp provider endpoint is missing');
      }
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      return this.openAiCompatibleChatStream(
        settings.providerEndpoint,
        apiKey,
        resolvedModel,
        [this.buildLlamaCppSystemMessage(), ...messages.map(m => ({ role: m.role, content: m.content }))],
        settings.requestTimeoutMs,
        onChunk
      );
    }

    if (settings.providerEndpoint) {
      const apiKey = this.resolveApiKeyFromConfig(providerConfig);
      const joined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      return this.ollama.streamGenerate(joined, resolvedModel, onChunk, {
        baseURL: settings.providerEndpoint,
        timeoutMs: settings.requestTimeoutMs,
        apiKey,
        agentConfig
      });
    }

    const joined = messages.map(m => `${m.role}: ${m.content}`).join('\n');
    return this.ollama.streamGenerate(joined, resolvedModel, onChunk, {
      timeoutMs: settings.requestTimeoutMs,
      agentConfig
    });
  }
}

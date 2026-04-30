import axios from 'axios';
import crypto from 'crypto';
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
  routingMode: 'fixed' | 'auto';
};

export class ProviderGateway {
  private logger = new Logger();
  private ollama = new OllamaService();

  private getEncryptionKey(): Buffer {
    const raw = String(process.env.PROVIDER_SECRETS_KEY || process.env.APP_ENCRYPTION_KEY || '').trim();
    if (!raw) {
      throw new Error('Missing PROVIDER_SECRETS_KEY (or APP_ENCRYPTION_KEY) env var for decrypting provider secrets');
    }

    const asBase64 = (() => {
      try {
        const b = Buffer.from(raw, 'base64');
        if (b.length === 32) return b;
      } catch {
      }
      return null;
    })();
    if (asBase64) return asBase64;

    const asHex = (() => {
      try {
        const b = Buffer.from(raw, 'hex');
        if (b.length === 32) return b;
      } catch {
      }
      return null;
    })();
    if (asHex) return asHex;

    return crypto.createHash('sha256').update(raw, 'utf8').digest();
  }

  private decryptSecret(value: string): string | null {
    const raw = String(value || '');
    if (!raw.startsWith('enc:')) return raw || null;
    const parts = raw.split(':');
    if (parts.length !== 4) return null;
    const [, ivB64, tagB64, ctB64] = parts;
    const key = this.getEncryptionKey();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return plaintext || null;
  }

  private async resolveApiKeyFromConfig(config: any, providerId?: number | null): Promise<string | null> {
    // 1) DB/admin secrets store
    if (providerId && (global as any).connection) {
      try {
        const rows = await executeQuery(
          'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
          [`provider_api_key_${String(providerId)}`]
        );
        const v = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any)?.setting_value : null;
        if (typeof v === 'string' && v.trim()) {
          const dec = this.decryptSecret(v.trim());
          if (dec) return dec;
        }
      } catch {
      }
    }

    // 2) Env var reference from config
    const envVar = typeof config?.apiKeyEnvVar === 'string' ? config.apiKeyEnvVar.trim() : '';
    if (envVar && process.env[envVar]) return String(process.env[envVar]);

    // 3) Conventional env fallback
    if (process.env.OLLAMA_CLOUD_API_KEY) return String(process.env.OLLAMA_CLOUD_API_KEY);
    if (process.env.OLLAMA_API_KEY) return String(process.env.OLLAMA_API_KEY);
    if (process.env.GOOGLE_GEMINI_API_KEY) return String(process.env.GOOGLE_GEMINI_API_KEY);
    if (process.env.GOOGLE_API_KEY) return String(process.env.GOOGLE_API_KEY);
    return null;
  }

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
      null;

    if (!resolvedModel) {
      throw new Error('No model configured. Set system_settings.default_model or OLLAMA_DEFAULT_MODEL (or pass model override / agent config model).');
    }

    const routedSettings = await this.ensureProviderSupportsModel(settings, resolvedModel);

    if (!routedSettings.providerId) {
      // no active provider -> prefer Ollama if available; otherwise fall back to local llama.cpp (OpenAI-compatible)
      const llamaFallbackEnabled = this.resolveEnvBoolean('LLAMA_CPP_FALLBACK_ENABLED');
      try {
        const ok = await this.ollama.testConnection();
        if (ok) {
          return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
            timeoutMs: routedSettings.requestTimeoutMs,
            agentConfig
          });
        }
      } catch {
        // ignore
      }

      if (llamaFallbackEnabled) {
        const endpoint = this.getLocalLlamaCppEndpoint();
        const msg = [this.buildLlamaCppSystemMessage(agentConfig), { role: 'user', content: prompt }];
        return this.openAiCompatibleChatStream(endpoint, null, resolvedModel, msg, routedSettings.requestTimeoutMs, onChunk);
      }

      return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
        timeoutMs: routedSettings.requestTimeoutMs,
        agentConfig
      });
    }

    // Load provider config
    let providerConfig: any = {};
    try {
      const rows = await executeQuery('SELECT config_json FROM ai_providers WHERE id = ? LIMIT 1', [routedSettings.providerId]);
      const cfg = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any).config_json : null;
      providerConfig = typeof cfg === 'string' ? JSON.parse(cfg) : (cfg || {});
    } catch {
      providerConfig = {};
    }

    if (routedSettings.providerType === 'google') {
      return this.geminiStream(prompt, resolvedModel, routedSettings.requestTimeoutMs, providerConfig, onChunk);
    }

    if (routedSettings.providerType === 'llama_cpp') {
      if (!routedSettings.providerEndpoint) {
        throw new Error('Active provider is llama_cpp but api_endpoint is missing');
      }
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, routedSettings.providerId);
      const msg = [this.buildLlamaCppSystemMessage(agentConfig), { role: 'user', content: prompt }];
      return this.openAiCompatibleChatStream(routedSettings.providerEndpoint, apiKey, resolvedModel, msg, routedSettings.requestTimeoutMs, onChunk);
    }

    if (routedSettings.providerEndpoint) {
      // Treat endpoint as Ollama-compatible generate stream
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, routedSettings.providerId);
      return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
        baseURL: routedSettings.providerEndpoint,
        timeoutMs: routedSettings.requestTimeoutMs,
        apiKey,
        agentConfig
      });
    }

    return this.ollama.streamGenerate(prompt, resolvedModel, onChunk, {
      timeoutMs: routedSettings.requestTimeoutMs,
      agentConfig
    });
  }

  private async ensureProviderSupportsModel(settings: ActiveProviderSettings, model: string): Promise<ActiveProviderSettings> {
    if (!settings.providerId) return settings;
    if (!(global as any).connection) return settings;

    try {
      const currentRows = await executeQuery(
        'SELECT COUNT(*) AS cnt FROM ai_models WHERE provider_id = ? AND model_name = ? LIMIT 1',
        [settings.providerId, model]
      );
      const cnt = Array.isArray(currentRows) && currentRows.length ? Number((currentRows[0] as any).cnt || 0) : 0;
      if (cnt > 0) return settings;

      if (settings.routingMode !== 'auto') {
        throw new Error(
          `Default model '${model}' is not available on active provider '${settings.providerName || settings.providerId}'. ` +
          `Either change Settings -> Default Model, or switch active provider, or set routing_mode=auto for failover.`
        );
      }

      const fallbackRows = await executeQuery(
        `SELECT p.id, p.name, p.type, p.api_endpoint
         FROM ai_providers p
         JOIN ai_models m ON m.provider_id = p.id
         WHERE p.is_active = 1 AND m.model_name = ?
         ORDER BY p.id ASC
         LIMIT 1`,
        [model]
      );

      if (!Array.isArray(fallbackRows) || fallbackRows.length === 0) return settings;
      const row = fallbackRows[0] as any;
      return {
        ...settings,
        providerId: Number(row.id),
        providerName: row.name || null,
        providerType: this.normalizeProviderType(row.type),
        providerEndpoint: String(row.api_endpoint || '').trim() || null
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      return settings;
    }
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

    const routingModeFromEnv = String(process.env.ROUTING_MODE || '').trim().toLowerCase();
    const routingModeSetting = await this.getSystemSetting('routing_mode');
    const routingModeRaw = (typeof routingModeSetting === 'string' && routingModeSetting.trim())
      ? routingModeSetting.trim().toLowerCase()
      : routingModeFromEnv;
    const routingMode: 'fixed' | 'auto' = routingModeRaw === 'auto' ? 'auto' : 'fixed';

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

    const providerIdFromEnv = (() => {
      const raw = String(process.env.ACTIVE_PROVIDER_ID || '').trim();
      if (!raw) return null;
      const v = parseInt(raw, 10);
      return Number.isFinite(v) && v > 0 ? v : null;
    })();

    const requestedProviderId = providerIdFromEnv || providerId;

    const baseNoProvider: ActiveProviderSettings = {
      providerId: null,
      providerType: null,
      providerEndpoint: null,
      providerName: null,
      defaultModel,
      requestTimeoutMs,
      preferStreaming,
      routingMode
    };

    if (!requestedProviderId || Number.isNaN(requestedProviderId)) {
      if (routingMode !== 'auto') return baseNoProvider;
      try {
        const rows = await executeQuery(
          'SELECT id, name, type, api_endpoint, config_json, is_active FROM ai_providers WHERE is_active = 1 ORDER BY id ASC LIMIT 1',
          []
        );
        if (!Array.isArray(rows) || rows.length === 0) return baseNoProvider;

        const row = rows[0] as ProviderRow;
        const endpoint = String((row as any).api_endpoint || '').trim();
        let config: any = (row as any).config_json;
        if (typeof config === 'string') {
          try {
            config = JSON.parse(config);
          } catch {
            config = {};
          }
        }

        const cfgTimeout = typeof config?.timeout_ms === 'number' ? config.timeout_ms : undefined;
        const cfgPreferStreaming = typeof config?.prefer_streaming === 'boolean' ? config.prefer_streaming : undefined;

        return {
          providerId: row.id,
          providerType: this.normalizeProviderType(row.type),
          providerEndpoint: endpoint || null,
          providerName: row.name || null,
          defaultModel,
          requestTimeoutMs: typeof cfgTimeout === 'number' ? cfgTimeout : requestTimeoutMs,
          preferStreaming: typeof cfgPreferStreaming === 'boolean' ? cfgPreferStreaming : preferStreaming,
          routingMode
        };
      } catch (e) {
        this.logger.warn('Failed to auto-route provider; continuing with no provider', e);
        return baseNoProvider;
      }
    }

    try {
      const rows = await executeQuery(
        'SELECT id, name, type, api_endpoint, config_json, is_active FROM ai_providers WHERE id = ? LIMIT 1',
        [requestedProviderId]
      );
      if (!Array.isArray(rows) || rows.length === 0) {
        if (routingMode !== 'auto') {
          return {
            providerId: requestedProviderId,
            providerType: null,
            providerEndpoint: null,
            providerName: null,
            defaultModel,
            requestTimeoutMs,
            preferStreaming,
            routingMode
          };
        }

        const autoRows = await executeQuery(
          'SELECT id, name, type, api_endpoint, config_json, is_active FROM ai_providers WHERE is_active = 1 ORDER BY id ASC LIMIT 1',
          []
        );
        if (!Array.isArray(autoRows) || autoRows.length === 0) return baseNoProvider;

        const row = autoRows[0] as ProviderRow;
        const endpoint = String((row as any).api_endpoint || '').trim();
        let config: any = (row as any).config_json;
        if (typeof config === 'string') {
          try {
            config = JSON.parse(config);
          } catch {
            config = {};
          }
        }
        const cfgTimeout = typeof config?.timeout_ms === 'number' ? config.timeout_ms : undefined;
        const cfgPreferStreaming = typeof config?.prefer_streaming === 'boolean' ? config.prefer_streaming : undefined;

        return {
          providerId: row.id,
          providerType: this.normalizeProviderType(row.type),
          providerEndpoint: endpoint || null,
          providerName: row.name || null,
          defaultModel,
          requestTimeoutMs: typeof cfgTimeout === 'number' ? cfgTimeout : requestTimeoutMs,
          preferStreaming: typeof cfgPreferStreaming === 'boolean' ? cfgPreferStreaming : preferStreaming,
          routingMode
        };
      }

      const row = rows[0] as ProviderRow;
      const isActive = Boolean((row as any).is_active ?? (row as any).isActive ?? true);
      if (!isActive) {
        if (routingMode !== 'auto') {
          return {
            providerId: requestedProviderId,
            providerType: null,
            providerEndpoint: null,
            providerName: row.name || null,
            defaultModel,
            requestTimeoutMs,
            preferStreaming,
            routingMode
          };
        }

        const autoRows = await executeQuery(
          'SELECT id, name, type, api_endpoint, config_json, is_active FROM ai_providers WHERE is_active = 1 ORDER BY id ASC LIMIT 1',
          []
        );
        if (!Array.isArray(autoRows) || autoRows.length === 0) return baseNoProvider;

        const r2 = autoRows[0] as ProviderRow;
        const endpoint2 = String((r2 as any).api_endpoint || '').trim();
        let config2: any = (r2 as any).config_json;
        if (typeof config2 === 'string') {
          try {
            config2 = JSON.parse(config2);
          } catch {
            config2 = {};
          }
        }
        const cfgTimeout2 = typeof config2?.timeout_ms === 'number' ? config2.timeout_ms : undefined;
        const cfgPreferStreaming2 = typeof config2?.prefer_streaming === 'boolean' ? config2.prefer_streaming : undefined;

        return {
          providerId: r2.id,
          providerType: this.normalizeProviderType(r2.type),
          providerEndpoint: endpoint2 || null,
          providerName: r2.name || null,
          defaultModel,
          requestTimeoutMs: typeof cfgTimeout2 === 'number' ? cfgTimeout2 : requestTimeoutMs,
          preferStreaming: typeof cfgPreferStreaming2 === 'boolean' ? cfgPreferStreaming2 : preferStreaming,
          routingMode
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
        providerId: requestedProviderId,
        providerType: this.normalizeProviderType(row.type),
        providerEndpoint: endpoint || null,
        providerName: row.name || null,
        defaultModel,
        requestTimeoutMs: typeof cfgTimeout === 'number' ? cfgTimeout : requestTimeoutMs,
        preferStreaming: typeof cfgPreferStreaming === 'boolean' ? cfgPreferStreaming : preferStreaming,
        routingMode
      };
    } catch (e) {
      this.logger.warn('Failed to resolve active provider; falling back to env/default provider', e);
      return {
        providerId: requestedProviderId,
        providerType: null,
        providerEndpoint: null,
        providerName: null,
        defaultModel,
        requestTimeoutMs,
        preferStreaming,
        routingMode
      };
    }
  }

  private async geminiGenerate(prompt: string, model: string, timeoutMs: number, config: any): Promise<string> {
    const settings = await this.getActiveProviderSettings();
    const apiKey = await this.resolveApiKeyFromConfig(config, settings.providerId);
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

  private async geminiStream(
    prompt: string,
    model: string,
    timeoutMs: number,
    config: any,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    const text = await this.geminiGenerate(prompt, model, timeoutMs, config);
    if (onChunk) {
      try {
        onChunk(text);
      } catch {
      }
    }
    return text;
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
      null;

    if (!resolvedModel) {
      throw new Error('No model configured. Set system_settings.default_model or OLLAMA_DEFAULT_MODEL (or pass model override / agent config model).');
    }

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

      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
      const msg = [this.buildLlamaCppSystemMessage(agentConfig), { role: 'user', content: prompt }];
      return this.openAiCompatibleChat(settings.providerEndpoint, apiKey, resolvedModel, msg, settings.requestTimeoutMs);
    }

    // ollama/custom/openai/glm: treat as ollama-like if endpoint provided.
    if (settings.providerEndpoint) {
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
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
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
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
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
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
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
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
      const apiKey = await this.resolveApiKeyFromConfig(providerConfig, settings.providerId);
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

import express, { Request, Response } from 'express';
import axios from 'axios';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';

const router = express.Router();
const logger = new Logger();

function safeJsonParse(value: any): any {
    if (!value) return {};
    if (typeof value === 'object') return value;
    if (typeof value !== 'string') return {};
    try {
        return JSON.parse(value);
    } catch {
        return {};
    }
}

function resolveApiKeyFromProviderConfig(config: any): string | null {
    const envVar = typeof config?.apiKeyEnvVar === 'string' ? config.apiKeyEnvVar.trim() : '';
    if (envVar && process.env[envVar]) return String(process.env[envVar]);
    if (process.env.OLLAMA_CLOUD_API_KEY) return String(process.env.OLLAMA_CLOUD_API_KEY);
    if (process.env.OLLAMA_API_KEY) return String(process.env.OLLAMA_API_KEY);
    if (process.env.GOOGLE_GEMINI_API_KEY) return String(process.env.GOOGLE_GEMINI_API_KEY);
    if (process.env.GOOGLE_API_KEY) return String(process.env.GOOGLE_API_KEY);
    return null;
}

function buildAuthHeadersFromConfig(config: any): Record<string, string> {
    const token = resolveApiKeyFromProviderConfig(config);
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
}

async function getProviderById(id: string): Promise<any | null> {
    const results: any[] = await executeQuery(
        `
            SELECT 
                id,
                name,
                type,
                api_endpoint as endpoint,
                config_json as config,
                is_active as isActive
            FROM ai_providers
            WHERE id = ?
            LIMIT 1
        `,
        [id]
    );
    if (!Array.isArray(results) || results.length === 0) return null;
    return results[0];
}

async function fetchProviderModelsCatalog(provider: any): Promise<any[]> {
    const endpoint = String(provider.endpoint || '').replace(/\/+$/, '');
    const providerType = String(provider.type || '').trim().toLowerCase();
    const config = safeJsonParse(provider.config);
    const timeout = 12000;

    if (providerType === 'google' || providerType === 'gemini') {
        const apiKey = resolveApiKeyFromProviderConfig(config);
        if (!apiKey) {
            throw new Error('Gemini API key not configured (config_json.apiKeyEnvVar বা GOOGLE_GEMINI_API_KEY দিন)');
        }

        const base = (typeof config?.base_url === 'string' && config.base_url.trim())
            ? config.base_url.trim().replace(/\/+$/, '')
            : (endpoint || 'https://generativelanguage.googleapis.com');

        const url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
        const response = await axios.get(url, {
            timeout,
            validateStatus: () => true,
            headers: { Accept: 'application/json' }
        });

        if (response.status < 200 || response.status >= 300) {
            const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
            throw new Error(`Upstream ${response.status}: ${msg}`);
        }

        const models = Array.isArray((response.data as any)?.models) ? (response.data as any).models : [];
        return models.map((m: any) => {
            const name = String(m?.name || '');
            const shortName = name.startsWith('models/') ? name.slice('models/'.length) : name;
            const displayName = String(m?.displayName || '').trim() || shortName;
            return { id: name || shortName, name: shortName, displayName, type: 'gemini', raw: m };
        });
    }

    if (providerType === 'ollama' || providerType === 'ollama_cloud') {
        if (!endpoint) throw new Error('Provider endpoint is missing');
        const url = `${endpoint}/api/tags`;
        const response = await axios.get(url, {
            timeout,
            validateStatus: () => true,
            headers: { Accept: 'application/json', ...buildAuthHeadersFromConfig(config) }
        });
        if (response.status < 200 || response.status >= 300) {
            const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
            throw new Error(`Upstream ${response.status}: ${msg}`);
        }
        const models = Array.isArray((response.data as any)?.models) ? (response.data as any).models : [];
        return models.map((m: any) => ({
            id: String(m?.digest || m?.name || ''),
            name: String(m?.name || ''),
            displayName: String(m?.name || ''),
            type: 'ollama',
            raw: m
        }));
    }

    if (!endpoint) throw new Error('Provider endpoint is missing');
    const candidates = [`${endpoint}/v1/models`, `${endpoint}/models`];
    let lastErr: any = null;
    for (const url of candidates) {
        try {
            const response = await axios.get(url, {
                timeout,
                validateStatus: () => true,
                headers: { Accept: 'application/json' }
            });
            if (response.status >= 200 && response.status < 300) {
                const items = Array.isArray((response.data as any)?.data)
                    ? (response.data as any).data
                    : Array.isArray((response.data as any)?.models)
                        ? (response.data as any).models
                        : [];
                return items.map((m: any) => {
                    const mid = String(m?.id || m?.name || '');
                    return { id: mid, name: mid, displayName: mid, type: providerType || 'openai', raw: m };
                });
            }
            lastErr = new Error(`Non-2xx status: ${response.status}`);
        } catch (e: any) {
            lastErr = e;
        }
    }

    throw lastErr || new Error('Failed to fetch provider models');
}

// GET /providers - Get all AI providers
router.get('/', async (req: Request, res: Response) => {
    try {
        if (!(global as any).connection) {
            logger.warn('Database not available, cannot fetch providers');
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot fetch providers when running in offline mode'
            });
        }

        const query = `
            SELECT 
                id,
                name,
                type,
                api_endpoint as endpoint,
                config_json as config,
                is_active as isActive,
                created_at as createdAt
            FROM ai_providers
            ORDER BY created_at DESC
        `;
        const results: any = await executeQuery(query);

        res.json({
            success: true,
            data: results,
            count: results.length
        });
    } catch (error) {
        logger.error('Error fetching providers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch providers',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    return; // Add explicit return
});

// POST /providers/:id/sync-models - Fetch provider catalog and upsert into ai_models
router.post('/:id/sync-models', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot sync provider models when running in offline mode',
                timestamp: new Date().toISOString()
            });
        }

        const provider = await getProviderById(id);
        if (!provider) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found',
                timestamp: new Date().toISOString()
            });
        }

        const catalog = await fetchProviderModelsCatalog(provider);
        let upserted = 0;

        for (const m of catalog) {
            const modelName = String(m?.name || m?.id || '').trim();
            if (!modelName) continue;
            await executeQuery(
                `INSERT INTO ai_models (provider_id, model_name, model_version, status, metadata)
                 VALUES (?, ?, NULL, 'running', ?)
                 ON DUPLICATE KEY UPDATE
                   status = VALUES(status),
                   metadata = VALUES(metadata),
                   updated_at = CURRENT_TIMESTAMP`,
                [provider.id, modelName, JSON.stringify({ source: 'provider_catalog', catalog: m })]
            );
            upserted++;
        }

        return res.json({
            success: true,
            message: 'Provider models synced into database',
            provider: { id: provider.id, name: provider.name, type: provider.type },
            upserted,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error syncing provider models:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to sync provider models',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /providers/:id/models - List models available from the provider (provider-specific catalog)
router.get('/:id/models', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot fetch provider models when running in offline mode',
                timestamp: new Date().toISOString()
            });
        }

        const results: any[] = await executeQuery(
            `
                SELECT 
                    id,
                    name,
                    type,
                    api_endpoint as endpoint,
                    config_json as config,
                    is_active as isActive
                FROM ai_providers
                WHERE id = ?
            `,
            [id]
        );

        if (!Array.isArray(results) || results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found',
                timestamp: new Date().toISOString()
            });
        }

        const provider = results[0];
        const endpoint = String(provider.endpoint || '').replace(/\/+$/, '');
        const providerType = String(provider.type || '').trim().toLowerCase();
        const config = safeJsonParse(provider.config);

        if (!endpoint && providerType !== 'google' && providerType !== 'gemini') {
            return res.status(400).json({
                success: false,
                error: 'Provider endpoint is missing',
                timestamp: new Date().toISOString()
            });
        }

        const timeout = 12000;

        if (providerType === 'google' || providerType === 'gemini') {
            const apiKey = resolveApiKeyFromProviderConfig(config);
            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'Gemini API key not configured',
                    message: 'Set config_json.apiKeyEnvVar or GOOGLE_GEMINI_API_KEY',
                    timestamp: new Date().toISOString()
                });
            }

            const base = (typeof config?.base_url === 'string' && config.base_url.trim())
                ? config.base_url.trim().replace(/\/+$/, '')
                : 'https://generativelanguage.googleapis.com';

            const url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
            const response = await axios.get(url, {
                timeout,
                validateStatus: () => true,
                headers: { Accept: 'application/json' }
            });

            if (response.status < 200 || response.status >= 300) {
                const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
                return res.status(502).json({
                    success: false,
                    error: 'Failed to fetch Gemini models',
                    message: `Upstream ${response.status}: ${msg}`,
                    timestamp: new Date().toISOString()
                });
            }

            const models = Array.isArray((response.data as any)?.models) ? (response.data as any).models : [];
            const list = models.map((m: any) => {
                const name = String(m?.name || '');
                const displayName = String(m?.displayName || '').trim();
                const shortName = name.startsWith('models/') ? name.slice('models/'.length) : name;
                return {
                    id: name || shortName,
                    name: shortName,
                    displayName: displayName || shortName,
                    type: 'gemini',
                    raw: m
                };
            });

            return res.json({
                success: true,
                provider: { id: provider.id, name: provider.name, type: provider.type },
                data: list,
                count: list.length,
                timestamp: new Date().toISOString()
            });
        }

        if (providerType === 'ollama' || providerType === 'ollama_cloud') {
            const url = `${endpoint}/api/tags`;
            const response = await axios.get(url, {
                timeout,
                validateStatus: () => true,
                headers: { Accept: 'application/json', ...buildAuthHeadersFromConfig(config) }
            });
            if (response.status < 200 || response.status >= 300) {
                const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
                return res.status(502).json({
                    success: false,
                    error: 'Failed to fetch Ollama models',
                    message: `Upstream ${response.status}: ${msg}`,
                    timestamp: new Date().toISOString()
                });
            }

            const models = Array.isArray((response.data as any)?.models) ? (response.data as any).models : [];
            const list = models.map((m: any) => ({
                id: String(m?.digest || m?.name || ''),
                name: String(m?.name || ''),
                displayName: String(m?.name || ''),
                type: 'ollama',
                size: m?.size,
                modified_at: m?.modified_at,
                raw: m
            }));

            return res.json({
                success: true,
                provider: { id: provider.id, name: provider.name, type: provider.type },
                data: list,
                count: list.length,
                timestamp: new Date().toISOString()
            });
        }

        const candidates = [`${endpoint}/v1/models`, `${endpoint}/models`];
        let lastErr: any = null;
        for (const url of candidates) {
            try {
                const response = await axios.get(url, {
                    timeout,
                    validateStatus: () => true,
                    headers: { Accept: 'application/json' }
                });
                if (response.status >= 200 && response.status < 300) {
                    const items = Array.isArray((response.data as any)?.data)
                        ? (response.data as any).data
                        : Array.isArray((response.data as any)?.models)
                            ? (response.data as any).models
                            : [];
                    const list = items.map((m: any) => {
                        const mid = String(m?.id || m?.name || '');
                        return {
                            id: mid,
                            name: mid,
                            displayName: mid,
                            type: providerType || 'openai',
                            raw: m
                        };
                    });
                    return res.json({
                        success: true,
                        provider: { id: provider.id, name: provider.name, type: provider.type },
                        testedUrl: url,
                        data: list,
                        count: list.length,
                        timestamp: new Date().toISOString()
                    });
                }
                lastErr = new Error(`Non-2xx status: ${response.status}`);
            } catch (e: any) {
                lastErr = e;
            }
        }

        return res.status(502).json({
            success: false,
            error: 'Failed to fetch provider models',
            message: lastErr?.message || 'Unknown error',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error fetching provider models:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch provider models',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /providers - Create new provider
router.post('/', async (req: Request, res: Response) => {
    try {
        const { name, type, endpoint, config, isActive = true } = req.body;

        if (!name || !type) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: name and type are required'
            });
        }

        const providerType = String(type || '').trim().toLowerCase();
        const rawEndpoint = typeof endpoint === 'string' ? endpoint.trim() : '';

        const effectiveEndpoint = (() => {
            if (rawEndpoint) return rawEndpoint;
            if (providerType === 'google' || providerType === 'gemini') {
                const cfg = safeJsonParse(config);
                const base = typeof cfg?.base_url === 'string' ? cfg.base_url.trim() : '';
                return (base || 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');
            }
            if (providerType === 'ollama_cloud') {
                const env = String(process.env.OLLAMA_CLOUD_BASE_URL || '').trim();
                return (env || 'http://localhost:11434').replace(/\/+$/, '');
            }
            return '';
        })();

        if (!effectiveEndpoint && providerType !== 'custom') {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: endpoint is required for this provider type'
            });
        }

        const sanitizedConfig = (() => {
            if (!config || typeof config !== 'object') return {};
            const copy = { ...(config as any) };
            if (typeof (copy as any).apiKey === 'string') {
                delete (copy as any).apiKey;
            }
            return copy;
        })();

        if ((global as any).connection) {
            const query = `
                INSERT INTO ai_providers (name, type, api_endpoint, config_json, is_active)
                VALUES (?, ?, ?, ?, ?)
            `;
            const result: any = await executeQuery(query, [name, type, effectiveEndpoint, JSON.stringify(sanitizedConfig), isActive]);

            res.status(201).json({
                success: true,
                message: 'Provider created successfully',
                data: {
                    id: result.insertId,
                    name,
                    type,
                    endpoint: effectiveEndpoint,
                    isActive
                }
            });
        } else {
            logger.warn('Database not available, cannot create provider');
            res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot create provider when running in offline mode'
            });
        }
    } catch (error) {
        logger.error('Error creating provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create provider',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    return; // Add explicit return
});

// GET /providers/:id - Get specific provider
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!(global as any).connection) {
            logger.warn('Database not available, cannot fetch provider');
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot fetch provider when running in offline mode'
            });
        }

        const query = `
            SELECT 
                id,
                name,
                type,
                api_endpoint as endpoint,
                config_json as config,
                is_active as isActive,
                created_at as createdAt
            FROM ai_providers
            WHERE id = ?
        `;
        const results: any[] = await executeQuery(query, [id]);

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        res.json({
            success: true,
            data: results[0]
        });
    } catch (error) {
        logger.error('Error fetching provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch provider',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    return; // Add explicit return
});

// POST /providers/:id/test - Test provider connectivity
router.post('/:id/test', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (!(global as any).connection) {
            logger.warn('Database not available, cannot test provider');
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot test provider when running in offline mode'
            });
        }

        const results: any[] = await executeQuery(
            `
                SELECT 
                    id,
                    name,
                    type,
                    api_endpoint as endpoint,
                    config_json as config,
                    is_active as isActive
                FROM ai_providers
                WHERE id = ?
            `,
            [id]
        );

        if (results.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Provider not found'
            });
        }

        const provider = results[0];
        const endpoint = String(provider.endpoint || '').replace(/\/+$/, '');
        const providerType = String(provider.type || '').trim().toLowerCase();
        const config = safeJsonParse(provider.config);

        if (!endpoint) {
            return res.status(400).json({
                success: false,
                error: 'Provider endpoint is missing'
            });
        }

        const start = Date.now();

        const tryGet = async (url: string) => {
            const response = await axios.get(url, {
                timeout: 8000,
                validateStatus: () => true,
                headers: { Accept: 'application/json' }
            });
            return response;
        };

        const respondSuccess = (testedUrl: string, statusCode: number) => {
            const responseTime = Date.now() - start;
            return res.json({
                success: true,
                provider: {
                    id: provider.id,
                    name: provider.name,
                    type: provider.type,
                    endpoint
                },
                testedUrl,
                statusCode,
                responseTime,
                timestamp: new Date().toISOString()
            });
        };

        let lastError: any = null;

        // Provider-specific health checks
        if (providerType === 'google' || providerType === 'gemini') {
            const apiKey = resolveApiKeyFromProviderConfig(config);
            if (!apiKey) {
                return res.status(400).json({
                    success: false,
                    error: 'Provider test failed',
                    message: 'Gemini API key not configured (config_json.apiKeyEnvVar বা GOOGLE_GEMINI_API_KEY দিন)',
                    timestamp: new Date().toISOString()
                });
            }

            const configuredBase = (typeof config?.base_url === 'string' && config.base_url.trim())
                ? config.base_url.trim().replace(/\/+$/, '')
                : '';

            const endpointBase = endpoint;
            const candidates = [configuredBase, endpointBase, 'https://generativelanguage.googleapis.com']
                .map(s => String(s || '').trim().replace(/\/+$/, ''))
                .filter(Boolean);

            for (const base of candidates) {
                // Vertex AI base needs project/location paths; avoid false-negative 404.
                if (base.includes('aiplatform.googleapis.com')) {
                    lastError = new Error(
                        'Vertex AI (aiplatform.googleapis.com) endpoint requires project/location; set config_json.base_url to https://generativelanguage.googleapis.com for Gemini API testing'
                    );
                    continue;
                }

                const url = `${base}/v1beta/models?key=${encodeURIComponent(apiKey)}`;
                try {
                    const response = await tryGet(url);
                    if (response.status >= 200 && response.status < 300) {
                        return respondSuccess(url, response.status);
                    }
                    lastError = new Error(`Non-2xx status: ${response.status}`);
                } catch (e: any) {
                    lastError = e;
                }
            }
        } else if (providerType === 'ollama' || providerType === 'ollama_cloud') {
            const candidates = [`${endpoint}/api/tags`];
            for (const url of candidates) {
                try {
                    const response = await axios.get(url, {
                        timeout: 8000,
                        validateStatus: () => true,
                        headers: { Accept: 'application/json', ...buildAuthHeadersFromConfig(config) }
                    });
                    if (response.status >= 200 && response.status < 300) {
                        return respondSuccess(url, response.status);
                    }
                    lastError = new Error(`Non-2xx status: ${response.status}`);
                } catch (e: any) {
                    lastError = e;
                }
            }
        } else {
            // openai/llama_cpp/custom: expect OpenAI-compatible endpoints
            const candidates = [`${endpoint}/v1/models`, `${endpoint}/models`];
            for (const url of candidates) {
                try {
                    const response = await tryGet(url);
                    if (response.status >= 200 && response.status < 300) {
                        return respondSuccess(url, response.status);
                    }
                    lastError = new Error(`Non-2xx status: ${response.status}`);
                } catch (e: any) {
                    lastError = e;
                }
            }
        }

        const responseTime = Date.now() - start;
        return res.status(502).json({
            success: false,
            error: 'Provider test failed',
            responseTime,
            message: lastError?.message || 'Unknown error',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error testing provider:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to test provider',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// PUT /providers/:id - Update provider
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { name, type, endpoint, config, isActive } = req.body;

        const sanitizedConfig = (() => {
            if (!config || typeof config !== 'object') return undefined;
            const copy = { ...(config as any) };
            if (typeof (copy as any).apiKey === 'string') {
                delete (copy as any).apiKey;
            }
            return copy;
        })();

        if ((global as any).connection) {
            // Check if provider exists
            const checkQuery = 'SELECT id FROM ai_providers WHERE id = ?';
            const existing: any[] = await executeQuery(checkQuery, [id]);

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Provider not found'
                });
            }

            // Update provider
            const updateQuery = `
                UPDATE ai_providers 
                SET 
                    name = COALESCE(?, name),
                    type = COALESCE(?, type),
                    api_endpoint = COALESCE(?, api_endpoint),
                    config_json = COALESCE(?, config_json),
                    is_active = COALESCE(?, is_active),
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = ?
            `;

            await executeQuery(updateQuery, [
                name,
                type,
                endpoint,
                sanitizedConfig ? JSON.stringify(sanitizedConfig) : null,
                isActive,
                id
            ]);

            res.json({
                success: true,
                message: 'Provider updated successfully'
            });
        } else {
            logger.warn('Database not available, cannot update provider');
            res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot update provider when running in offline mode'
            });
        }
    } catch (error) {
        logger.error('Error updating provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update provider',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    return; // Add explicit return
});

// DELETE /providers/:id - Delete provider
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if ((global as any).connection) {
            // Check if provider exists
            const checkQuery = 'SELECT id FROM ai_providers WHERE id = ?';
            const existing: any[] = await executeQuery(checkQuery, [id]);

            if (existing.length === 0) {
                return res.status(404).json({
                    success: false,
                    error: 'Provider not found'
                });
            }

            // Delete the provider
            const deleteQuery = 'DELETE FROM ai_providers WHERE id = ?';
            await executeQuery(deleteQuery, [id]);

            res.json({
                success: true,
                message: 'Provider deleted successfully'
            });
        } else {
            logger.warn('Database not available, cannot delete provider');
            res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot delete provider when running in offline mode'
            });
        }
    } catch (error) {
        logger.error('Error deleting provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete provider',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
    return; // Add explicit return
});

export default router;

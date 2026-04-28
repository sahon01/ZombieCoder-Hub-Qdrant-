import express from 'express';
import { OllamaService } from '../services/ollama';
import { Logger } from '../utils/logger';
import { executeQuery } from '../database/connection';
import axios from 'axios';

const router = express.Router();
const ollamaService = new OllamaService();
const logger = new Logger();

function getLlamaCppBaseUrl(): string {
    const raw = (process.env.LLAMA_CPP_BASE_URL || '').trim();
    if (raw) return raw.replace(/\/+$/, '');
    const host = (process.env.LLAMA_CPP_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const port = parseInt(String(process.env.LLAMA_CPP_PORT || '15000'), 10);
    const p = Number.isFinite(port) ? port : 15000;
    return `http://${host}:${p}`;
}

async function fetchLlamaCppModels(): Promise<Array<{ id: string; meta?: any }>> {
    const base = getLlamaCppBaseUrl();
    const response = await axios.get(`${base}/v1/models`, {
        timeout: 8000,
        validateStatus: () => true,
        headers: { Accept: 'application/json' }
    });

    if (response.status < 200 || response.status >= 300) {
        const msg = typeof response.data === 'object' ? JSON.stringify(response.data) : String(response.data);
        throw new Error(`llama.cpp models request failed (${response.status}): ${msg}`);
    }

    const data = response.data as any;
    const arr = Array.isArray(data?.data) ? data.data : (Array.isArray(data?.models) ? data.models : []);
    return arr
        .map((m: any) => ({
            id: String(m?.id || m?.name || m?.model || '').trim(),
            meta: m?.meta || m?.details || m || {}
        }))
        .filter((m: any) => m.id);
}

// Live Ollama catalog (from Ollama /api/tags)
router.get('/ollama/tags', async (req, res) => {
    try {
        const models = await ollamaService.getModels();
        res.json({
            success: true,
            data: models,
            count: models.length,
            source: 'ollama',
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to fetch Ollama tags:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch Ollama tags',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Live llama.cpp catalog (from llama.cpp OpenAI-compatible /v1/models)
router.get('/llama-cpp/models', async (req, res) => {
    try {
        const models = await fetchLlamaCppModels();
        res.json({
            success: true,
            data: models,
            count: models.length,
            source: 'llama_cpp',
            endpoint: getLlamaCppBaseUrl(),
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to fetch llama.cpp models:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch llama.cpp models',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Sync llama.cpp models into DB (ai_providers + ai_models)
router.post('/llama-cpp/sync', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Model sync requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const providerName = (process.env.LLAMA_CPP_PROVIDER_NAME || 'Local llama.cpp').trim();
        const providerEndpoint = getLlamaCppBaseUrl();

        await executeQuery(
            `INSERT INTO ai_providers (name, type, api_endpoint, is_active)
             VALUES (?, 'llama_cpp', ?, TRUE)
             ON DUPLICATE KEY UPDATE
               type = VALUES(type),
               api_endpoint = VALUES(api_endpoint),
               is_active = VALUES(is_active),
               updated_at = CURRENT_TIMESTAMP`,
            [providerName, providerEndpoint]
        );

        const providers: any[] = await executeQuery('SELECT id FROM ai_providers WHERE name = ? LIMIT 1', [providerName]);
        if (!Array.isArray(providers) || providers.length === 0) {
            throw new Error('Failed to resolve provider id for llama.cpp provider');
        }
        const providerId = providers[0].id;

        const llamaModels = await fetchLlamaCppModels();
        let upserted = 0;

        for (const m of llamaModels) {
            await executeQuery(
                `INSERT INTO ai_models (provider_id, model_name, model_version, status, metadata)
                 VALUES (?, ?, NULL, 'running', ?)
                 ON DUPLICATE KEY UPDATE
                   status = VALUES(status),
                   metadata = VALUES(metadata),
                   updated_at = CURRENT_TIMESTAMP`,
                [providerId, m.id, JSON.stringify({ source: 'llama_cpp', ...m.meta })]
            );
            upserted++;
        }

        res.json({
            success: true,
            message: 'Models synced from llama.cpp into database',
            providerId,
            providerName,
            providerEndpoint,
            upserted,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('llama.cpp model sync failed:', error);
        res.status(500).json({
            success: false,
            error: 'llama.cpp model sync failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Get all models (from database with provider info)
router.get('/', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Models listing requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        // Try to fetch from database
        const models = await executeQuery(`
            SELECT 
                m.id,
                m.model_name,
                m.model_version,
                m.status,
                m.cpu_usage,
                m.memory_usage,
                m.requests_handled,
                m.last_response_time,
                m.total_tokens_used,
                m.metadata,
                m.created_at,
                m.updated_at,
                p.id as provider_id,
                p.name as provider_name,
                p.type as provider_type
            FROM ai_models m
            JOIN ai_providers p ON m.provider_id = p.id
            ORDER BY p.name, m.model_name
        `);

        res.json({
            success: true,
            data: models,
            count: models.length,
            source: 'database',
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to get models from database:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch models',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Sync models from Ollama into DB (no simulation; reconciles real state)
router.post('/sync', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Model sync requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const providerName = (process.env.OLLAMA_PROVIDER_NAME || 'Ollama Local').trim();
        const providerEndpoint = (process.env.OLLAMA_URL || 'http://localhost:11434').trim();

        await executeQuery(
            `INSERT INTO ai_providers (name, type, api_endpoint, is_active)
             VALUES (?, 'ollama', ?, TRUE)
             ON DUPLICATE KEY UPDATE
               type = VALUES(type),
               api_endpoint = VALUES(api_endpoint),
               is_active = VALUES(is_active),
               updated_at = CURRENT_TIMESTAMP`,
            [providerName, providerEndpoint]
        );

        const providers: any[] = await executeQuery('SELECT id FROM ai_providers WHERE name = ? LIMIT 1', [providerName]);
        if (!Array.isArray(providers) || providers.length === 0) {
            throw new Error('Failed to resolve provider id for Ollama provider');
        }
        const providerId = providers[0].id;

        const opResult: any = await executeQuery(
            `INSERT INTO ai_model_operations (provider_id, operation, status, request_payload, started_at)
             VALUES (?, 'sync', 'running', JSON_OBJECT('provider', ?, 'endpoint', ?), NOW())`,
            [providerId, providerName, providerEndpoint]
        );
        const opId = opResult?.insertId;

        const ollamaModels = await ollamaService.getModels();

        let upserted = 0;
        for (const m of ollamaModels) {
            const metadata = {
                digest: m.digest,
                size: m.size,
                modified_at: m.modified_at,
                details: m.details
            };

            await executeQuery(
                `INSERT INTO ai_models (provider_id, model_name, model_version, status, metadata)
                 VALUES (?, ?, NULL, 'running', ?)
                 ON DUPLICATE KEY UPDATE
                   status = VALUES(status),
                   metadata = VALUES(metadata),
                   updated_at = CURRENT_TIMESTAMP`,
                [providerId, m.name, JSON.stringify(metadata)]
            );
            upserted++;
        }

        if (opId) {
            await executeQuery(
                `UPDATE ai_model_operations
                 SET status = 'success', completed_at = NOW(), result_payload = JSON_OBJECT('upserted', ?)
                 WHERE id = ?`,
                [upserted, opId]
            );
        }

        res.json({
            success: true,
            message: 'Models synced from Ollama into database',
            upserted,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Model sync failed:', error);
        res.status(500).json({
            success: false,
            error: 'Model sync failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// POST create new model
router.post('/', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot create model when running without database',
                timestamp: new Date().toISOString()
            });
        }

        const { provider_id, model_name, model_version, status, metadata } = req.body;

        if (!provider_id || !model_name) {
            return res.status(400).json({
                success: false,
                error: 'provider_id and model_name are required'
            });
        }

        const result = await executeQuery(`
            INSERT INTO ai_models (provider_id, model_name, model_version, status, metadata)
            VALUES (?, ?, ?, ?, ?)
        `, [provider_id, model_name, model_version || 'latest', status || 'pending', JSON.stringify(metadata || {})]);

        res.status(201).json({
            success: true,
            message: 'Model created successfully',
            data: { id: (result as any).insertId },
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Error creating model:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create model',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// PUT update model
router.put('/:id', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot update model when running without database',
                timestamp: new Date().toISOString()
            });
        }

        const { id } = req.params;
        const { status, cpu_usage, memory_usage, requests_handled, metadata } = req.body;

        await executeQuery(`
            UPDATE ai_models 
            SET 
                status = COALESCE(?, status),
                cpu_usage = COALESCE(?, cpu_usage),
                memory_usage = COALESCE(?, memory_usage),
                requests_handled = COALESCE(?, requests_handled),
                metadata = COALESCE(?, metadata),
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `, [status, cpu_usage, memory_usage, requests_handled, metadata ? JSON.stringify(metadata) : null, id]);

        res.json({
            success: true,
            message: 'Model updated successfully',
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Error updating model:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update model',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// DELETE model
router.delete('/:id', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot delete model when running without database',
                timestamp: new Date().toISOString()
            });
        }

        const { id } = req.params;

        const result = await executeQuery('DELETE FROM ai_models WHERE id = ?', [id]);

        if ((result as any).affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Model not found',
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Model deleted successfully',
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Error deleting model:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete model',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// GET models by provider
router.get('/provider/:providerId', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Cannot fetch models by provider when running without database',
                timestamp: new Date().toISOString()
            });
        }

        const { providerId } = req.params;

        const models = await executeQuery(`
            SELECT * FROM ai_models WHERE provider_id = ?
            ORDER BY model_name
        `, [providerId]);

        res.json({
            success: true,
            data: models,
            count: models.length,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Error fetching models by provider:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch models',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Get specific model info
router.get('/:modelName', async (req, res) => {
    try {
        const { modelName } = req.params;
        const modelInfo = await ollamaService.getModelInfo(modelName);

        res.json({
            success: true,
            model: modelName,
            info: modelInfo,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error(`Failed to get model info for ${req.params.modelName}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to get model information',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Pull a new model
router.post('/pull', async (req, res) => {
    try {
        const { modelName } = req.body;

        if (!modelName || typeof modelName !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Model name is required'
            });
        }

        const success = await ollamaService.pullModel(modelName);

        if (success) {
            res.json({
                success: true,
                message: `Model ${modelName} pulled successfully`,
                model: modelName,
                timestamp: new Date().toISOString()
            });
            return;
        } else {
            res.status(500).json({
                success: false,
                error: `Failed to pull model ${modelName}`,
                timestamp: new Date().toISOString()
            });
            return;
        }
    } catch (error) {
        logger.error('Failed to pull model:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to pull model',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Test model
router.post('/test', async (req, res) => {
    try {
        const { modelName, prompt } = req.body;

        if (!modelName || typeof modelName !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Model name is required'
            });
        }

        const testPrompt = prompt || 'Hello, how are you?';
        const response = await ollamaService.generate(testPrompt, modelName);

        res.json({
            success: true,
            model: modelName,
            testPrompt,
            response,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to test model:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to test model',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

export default router;

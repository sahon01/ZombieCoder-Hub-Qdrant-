import express from 'express';
import { OllamaService } from '../services/ollama';
import { Logger } from '../utils/logger';
import { ragService } from '../services/ragService';
import { getPostgresPool, initializePostgres, isPostgresEnabled } from '../database/postgres';
import { ragAutoIndexer } from '../services/ragAutoIndexer';
import { chromaManager } from '../services/chromaManager';
import { qdrantManager } from '../services/qdrantManager';
import { publicGateway } from '../services/publicGateway';

const router = express.Router();
const ollamaService = new OllamaService();
const logger = new Logger();

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
    const configuredKey = process.env.UAS_API_KEY || process.env.API_KEY;
    if (!configuredKey) {
        return res.status(500).json({
            success: false,
            error: 'Server misconfiguration',
            message: 'UAS_API_KEY/API_KEY is not set',
            timestamp: new Date().toISOString()
        });
    }
    const providedKey = req.header('X-API-Key') || '';
    if (!providedKey || providedKey !== configuredKey) {
        return res.status(401).json({
            success: false,
            error: 'Unauthorized',
            message: 'Missing or invalid API key',
            timestamp: new Date().toISOString()
        });
    }
    return next();
}

// System status endpoint
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();

        // Get comprehensive status
        const [ollamaHealth, models] = await Promise.all([
            ollamaService.healthCheck(),
            ollamaService.getModels().catch(() => [])
        ]);

        const responseTime = Date.now() - startTime;

        const systemStatus = {
            server: {
                name: 'UAS TypeScript Server',
                version: '1.0.0',
                status: 'running',
                uptime: process.uptime(),
                environment: process.env.NODE_ENV || 'development',
                timestamp: new Date().toISOString(),
                responseTime
            },
            models: models.map(model => ({
                name: model.name,
                size: model.size,
                modified: model.modified_at,
                digest: model.digest,
                status: 'available'
            })),
            agents: [
                {
                    id: 'ollama-agent',
                    name: 'Ollama Agent',
                    type: 'ai_model',
                    status: ollamaHealth.status === 'healthy' ? 'active' : 'inactive',
                    endpoint: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
                    model: ollamaHealth.defaultModel,
                    capabilities: ['text_generation', 'chat', 'streaming']
                },
                {
                    id: 'memory-agent',
                    name: 'Memory Agent',
                    type: 'memory',
                    status: process.env.MEMORY_AGENT_ENABLED === 'true' ? 'active' : 'inactive',
                    endpoint: 'http://localhost:8001',
                    capabilities: ['conversation_history', 'context_management']
                },
                {
                    id: 'cli-agent',
                    name: 'CLI Agent',
                    type: 'command',
                    status: process.env.CLI_AGENT_ENABLED === 'true' ? 'active' : 'inactive',
                    endpoint: 'http://localhost:8000/v1',
                    capabilities: ['command_execution', 'file_operations']
                }
            ],
            stats: {
                activeConnections: 1, // WebSocket connection
                totalRequests: 0, // This would be tracked in a real implementation
                memoryUsage: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
                },
                cpuUsage: process.cpuUsage(),
                uptime: process.uptime()
            },
            features: {
                ollama: {
                    available: ollamaHealth.status === 'healthy',
                    modelsCount: ollamaHealth.models,
                    defaultModel: ollamaHealth.defaultModel
                },
                memory: {
                    enabled: process.env.MEMORY_AGENT_ENABLED === 'true'
                },
                cli: {
                    enabled: process.env.CLI_AGENT_ENABLED === 'true'
                },
                loadBalancer: {
                    enabled: process.env.LOAD_BALANCER_ENABLED === 'true'
                },
                audioChat: {
                    enabled: process.env.AUDIO_CHAT_ENABLED === 'true'
                }
            }
        };

        res.json(systemStatus);
    } catch (error) {
        logger.error('Status check failed:', error);

        res.status(500).json({
            error: 'Failed to get system status',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/rag', async (req, res) => {
    try {
        const ragEnabled = String(process.env.RAG_ENABLED || '').trim().toLowerCase();
        const enabled = ragEnabled === '1' || ragEnabled === 'true' || ragEnabled === 'yes' || ragEnabled === 'on';

        const vectorBackend = String(process.env.RAG_VECTOR_BACKEND || 'pgvector').trim().toLowerCase();

        const pgEnabled = isPostgresEnabled();

        const allowIngest = String(process.env.RAG_ALLOW_STATUS_INGEST || '').trim().toLowerCase();
        const canIngest = allowIngest === '1' || allowIngest === 'true' || allowIngest === 'yes' || allowIngest === 'on';

        const shouldIngest = String(req.query.ingest || '').trim() === '1';

        let ingestResult: any = null;
        if (shouldIngest) {
            if (!canIngest) {
                return res.status(403).json({
                    error: 'Ingest from /status/rag is disabled. Set RAG_ALLOW_STATUS_INGEST=true to enable.',
                    timestamp: new Date().toISOString()
                });
            }
            ingestResult = await ragService.ingestMetadataMd();
        }

        const diagnostics: any = {
            enabled,
            vectorBackend,
            pgEnabled,
            timestamp: new Date().toISOString(),
            embedding: {
                model: String(process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2')
            },
            ingestResult,
            metrics: ragService.getMetricsSnapshot(),
            autoIndexer: ragAutoIndexer.getStatus(),
            chromaManager: chromaManager.getStatus(),
            qdrantManager: qdrantManager.getStatus(),
            publicGateway: publicGateway.getStatus()
        };

        if (vectorBackend === 'chroma') {
            const chromaUrl = String(process.env.CHROMA_URL || 'http://127.0.0.1:8001').trim() || 'http://127.0.0.1:8001';
            const collectionName = String(process.env.CHROMA_COLLECTION || process.env.PG_VECTOR_COLLECTION || 'zombiecoder_metadata');
            diagnostics.storage = {
                chromaUrl,
                collectionName
            };

            diagnostics.storage.count = await ragService.countDocuments();

            const q = typeof req.query.q === 'string' ? req.query.q : '';
            if (q && q.trim()) {
                try {
                    const ctx = await ragService.retrieveContext(q, parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10));
                    diagnostics.sample = {
                        query: q,
                        k: parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10),
                        documents: ctx.documents.slice(0, 3).map(d => ({
                            metadata: d.metadata,
                            preview: d.content.slice(0, 240)
                        }))
                    };
                } catch (e) {
                    diagnostics.sample = {
                        query: q,
                        error: e instanceof Error ? e.message : String(e)
                    };
                }
            }

            return res.json(diagnostics);
        }

        if (vectorBackend === 'qdrant') {
            const qdrantUrl = String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').trim() || 'http://127.0.0.1:6333';
            const collectionName = String(process.env.QDRANT_COLLECTION || process.env.PG_VECTOR_COLLECTION || 'zombiecoder_metadata');
            diagnostics.storage = {
                qdrantUrl,
                collectionName
            };

            const q = typeof req.query.q === 'string' ? req.query.q : '';
            if (q && q.trim()) {
                try {
                    const ctx = await ragService.retrieveContext(q, parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10));
                    diagnostics.sample = {
                        query: q,
                        k: parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10),
                        documents: ctx.documents.slice(0, 3).map(d => ({
                            metadata: d.metadata,
                            preview: d.content.slice(0, 240)
                        }))
                    };
                } catch (e) {
                    diagnostics.sample = {
                        query: q,
                        error: e instanceof Error ? e.message : String(e)
                    };
                }
            }

            return res.json(diagnostics);
        }

        if (!pgEnabled) {
            return res.json({
                ...diagnostics,
                note: 'Postgres is not enabled. Set PG_CONNECTION_STRING or PG_HOST env vars.'
            });
        }

        await initializePostgres();
        const pool = getPostgresPool();

        const tableName = String(process.env.PG_VECTOR_TABLE || 'rag_documents');
        const collectionName = String(process.env.PG_VECTOR_COLLECTION || 'zombiecoder_metadata');
        const schemaName = String(process.env.PG_VECTOR_SCHEMA || '').trim();
        const fullTable = schemaName ? `${schemaName}.${tableName}` : tableName;

        diagnostics.storage = {
            schemaName: schemaName || null,
            tableName,
            collectionName,
            fullTable
        };

        try {
            const countQuery = `SELECT COUNT(*)::int AS count FROM ${fullTable} WHERE collection = $1`;
            const countRes = await pool.query(countQuery, [collectionName]);
            diagnostics.storage.rowCount = countRes.rows?.[0]?.count ?? null;
        } catch (e) {
            diagnostics.storage.rowCount = null;
            diagnostics.storage.countError = e instanceof Error ? e.message : String(e);
        }

        const q = typeof req.query.q === 'string' ? req.query.q : '';
        if (q && q.trim()) {
            try {
                const ctx = await ragService.retrieveContext(q, parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10));
                diagnostics.sample = {
                    query: q,
                    k: parseInt(String(req.query.k || process.env.RAG_TOP_K || '6'), 10),
                    documents: ctx.documents.slice(0, 3).map(d => ({
                        metadata: d.metadata,
                        preview: d.content.slice(0, 240)
                    }))
                };
            } catch (e) {
                diagnostics.sample = {
                    query: q,
                    error: e instanceof Error ? e.message : String(e)
                };
            }
        }

        return res.json(diagnostics);
    } catch (error) {
        logger.error('RAG status check failed:', error);
        return res.status(500).json({
            error: 'Failed to get RAG status',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.get('/rag/auto-indexer', async (req, res) => {
    try {
        return res.json({
            success: true,
            autoIndexer: ragAutoIndexer.getStatus(),
            metrics: ragService.getMetricsSnapshot(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get auto-indexer status', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to get auto-indexer status',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.post('/rag/auto-indexer/start', requireApiKey, async (req, res) => {
    try {
        const watchPath = typeof req.body?.watchPath === 'string' ? req.body.watchPath : null;
        await ragAutoIndexer.startOverride({ watchPath });
        return res.json({
            success: true,
            message: 'Auto-indexer start attempted',
            autoIndexer: ragAutoIndexer.getStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to start auto-indexer', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to start auto-indexer',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.post('/rag/auto-indexer/stop', requireApiKey, async (req, res) => {
    try {
        await ragAutoIndexer.stopOverride();
        return res.json({
            success: true,
            message: 'Auto-indexer stopped',
            autoIndexer: ragAutoIndexer.getStatus(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to stop auto-indexer', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to stop auto-indexer',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.post('/rag/ingest/metadata', requireApiKey, async (req, res) => {
    try {
        const allowIngest = String(process.env.RAG_ALLOW_STATUS_INGEST || '').trim().toLowerCase();
        const canIngest = allowIngest === '1' || allowIngest === 'true' || allowIngest === 'yes' || allowIngest === 'on';
        if (!canIngest) {
            return res.status(403).json({
                success: false,
                error: 'Ingest is disabled',
                message: 'Set RAG_ALLOW_STATUS_INGEST=true to enable ingest endpoints',
                timestamp: new Date().toISOString()
            });
        }

        const ingestResult = await ragService.ingestMetadataMd();
        return res.json({
            success: true,
            ingestResult,
            metrics: ragService.getMetricsSnapshot(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to ingest metadata.md', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to ingest metadata.md',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

router.post('/rag/ingest/file', requireApiKey, async (req, res) => {
    try {
        const allowIngest = String(process.env.RAG_ALLOW_STATUS_INGEST || '').trim().toLowerCase();
        const canIngest = allowIngest === '1' || allowIngest === 'true' || allowIngest === 'yes' || allowIngest === 'on';
        if (!canIngest) {
            return res.status(403).json({
                success: false,
                error: 'Ingest is disabled',
                message: 'Set RAG_ALLOW_STATUS_INGEST=true to enable ingest endpoints',
                timestamp: new Date().toISOString()
            });
        }

        const filePath = typeof req.body?.filePath === 'string' ? req.body.filePath : '';
        if (!filePath || !filePath.trim()) {
            return res.status(400).json({
                success: false,
                error: 'filePath is required',
                timestamp: new Date().toISOString()
            });
        }

        const ingestResult = await ragService.ingestFile(filePath.trim(), { type: 'manual' });
        return res.json({
            success: true,
            ingestResult,
            metrics: ragService.getMetricsSnapshot(),
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to ingest file', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to ingest file',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// Agent-specific status
router.get('/agents', async (req, res) => {
    try {
        const ollamaHealth = await ollamaService.healthCheck();

        const agentsStatus = {
            agents: [
                {
                    id: 'ollama-agent',
                    name: 'Ollama Agent',
                    status: ollamaHealth.status === 'healthy' ? 'active' : 'inactive',
                    health: {
                        status: ollamaHealth.status,
                        models: ollamaHealth.models,
                        defaultModel: ollamaHealth.defaultModel,
                        responseTime: 0
                    },
                    metrics: {
                        requests: 0,
                        avgResponseTime: 0,
                        errorRate: 0
                    }
                }
            ],
            timestamp: new Date().toISOString()
        };

        res.json(agentsStatus);
    } catch (error) {
        logger.error('Agent status check failed:', error);
        res.status(500).json({
            error: 'Failed to get agent status',
            timestamp: new Date().toISOString()
        });
    }
});

// Models status
router.get('/models', async (req, res) => {
    try {
        const models = await ollamaService.getModels();

        const modelsStatus = {
            models: models.map(model => ({
                name: model.name,
                status: 'available',
                size: model.size,
                modified: model.modified_at,
                details: model.details
            })),
            total: models.length,
            timestamp: new Date().toISOString()
        };

        res.json(modelsStatus);
    } catch (error) {
        logger.error('Models status check failed:', error);
        res.status(500).json({
            error: 'Failed to get models status',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';

// Load environment variables
dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

// Import routes
import healthRoutes from './routes/health';
import statusRoutes from './routes/status';
import chatRoutes from './routes/chat';
import modelsRoutes from './routes/models';
import agentsRoutes from './routes/agents';
import memoryRoutes from './routes/memory-new';
import memoryDbRoutes from './routes/memory';
import cliRoutes from './routes/cli';
import editorRoutes from './routes/editor';
import providersRoutes from './routes/providers';
import serversRoutes from './routes/servers';
import settingsRoutes from './routes/settings';
import metricsRoutes from './routes/metrics';
import promptTemplatesRoutes from './routes/prompt-templates';
import mcpRoutes from './routes/mcp';
import plansRoutes from './routes/plans';
import { initializeMemoryRoutes } from './routes/memory-new';
import { initializeCLIRoutes } from './routes/cli-new';

import { apiAuditMiddleware } from './middleware/apiAudit';

// Import services
import { OllamaService } from './services/ollama';
import { WebSocketService } from './services/websocket';
import { Logger } from './utils/logger';
import { initializeDatabase } from './database/connection';
import { MemoryService } from './services/memory';
import { EmbeddingService } from './services/embedding';
import { ensureAdminUserSeeded } from './services/adminSeed';
import { LlamaCppManager } from './services/llamaCppManager';
import { ragService } from './services/ragService';
import { ragAutoIndexer } from './services/ragAutoIndexer';
import { chromaManager } from './services/chromaManager';
import { qdrantManager } from './services/qdrantManager';
import { publicGateway } from './services/publicGateway';

const app = express();
const server = createServer(app);
const port = process.env.PORT || 8000;

// Initialize services
const ollamaService = new OllamaService();
const logger = new Logger();
const memoryService = new MemoryService();
const embeddingService = new EmbeddingService(ollamaService, memoryService);
const llamaCppManager = new LlamaCppManager();

// WebSocket setup
const wss = new WebSocketServer({ server });
const wsService = new WebSocketService(wss);

process.on('uncaughtException', (err) => {
    logger.error('Uncaught exception', err);
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', reason as any);
});

server.on('error', (err: any) => {
    logger.error('HTTP server error', err);
});

// Middleware
app.use(helmet());
app.use((req, res, next) => {
    res.setHeader('X-Powered-By', 'ZombieCoder-by-SahonSrabon');
    next();
});
app.use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// API audit logging (DB)
app.use(apiAuditMiddleware);

// Request logging
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    next();
});

// Routes
app.use('/health', healthRoutes);
app.use('/status', statusRoutes);
app.use('/chat', chatRoutes);
app.use('/models', modelsRoutes);
app.use('/agents', agentsRoutes);
app.use('/memory', memoryDbRoutes);
app.use('/memory-new', memoryRoutes);
app.use('/cli-agent', cliRoutes);
app.use('/editor', editorRoutes);
app.use('/providers', providersRoutes);
app.use('/plans', plansRoutes);
app.use('/servers', serversRoutes);
app.use('/settings', settingsRoutes);
app.use('/metrics', metricsRoutes);
app.use('/prompt-templates', promptTemplatesRoutes);
app.use('/mcp', mcpRoutes);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        message: 'UAS TypeScript Server',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
            health: '/health',
            status: '/status',
            chat: '/chat',
            models: '/models',
            agents: '/agents',
            memory: '/memory',
            memoryNew: '/memory-new',
            cli: '/cli-agent',
            editor: '/editor',
            providers: '/providers',
            servers: '/servers'
        }
    });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({
        error: 'Internal Server Error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
    });
});

// Start server
server.listen(port, async () => {
    logger.info(`🚀 UAS TypeScript Server running on port ${port}`);
    logger.info(`📡 WebSocket server ready for real-time updates`);
    logger.info(`🔗 Ollama integration: ${ollamaService.isConnected ? 'Connected' : 'Disconnected'}`);

    // Start public gateway (Cloudflare/tunnel-facing proxy) in degraded mode if misconfigured
    try {
        await publicGateway.start();
    } catch (e) {
        logger.warn('⚠️ Failed to start public gateway (continuing without public routing)', e);
    }

    // Initialize database
    try {
        await initializeDatabase({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'uas_admin',
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        logger.info('✅ Database connected successfully');

        try {
            await ensureAdminUserSeeded();
            logger.info('✅ Admin seed check completed');
        } catch (seedError) {
            logger.warn('⚠️ Admin seed failed', seedError);
        }
    } catch (error) {
        logger.warn('⚠️ Database connection failed - running in offline mode', error);
    }

    // Initialize memory service
    try {
        await memoryService.initialize();
        initializeMemoryRoutes(memoryService, embeddingService, ollamaService);
        initializeCLIRoutes();
        logger.info('✅ Memory service initialized successfully');
    } catch (error) {
        logger.error('❌ Failed to initialize memory service:', error);
    }

    // Start managed ChromaDB if configured (non-fatal)
    try {
        await chromaManager.startIfNeeded();
    } catch (e) {
        logger.warn('⚠️ Chroma manager failed (continuing without managed chroma)', e);
    }

    // Start managed Qdrant if configured (non-fatal)
    try {
        await qdrantManager.startIfNeeded();
    } catch (e) {
        logger.warn('⚠️ Qdrant manager failed (continuing without managed qdrant)', e);
    }

    // Optional: ingest RAG knowledge base into pgvector
    try {
        const autoIngest = String(process.env.RAG_AUTO_INGEST || '').trim().toLowerCase();
        if (autoIngest === '1' || autoIngest === 'true' || autoIngest === 'yes' || autoIngest === 'on') {
            const { chunkCount } = await ragService.ingestMetadataMd();
            logger.info('✅ RAG auto-ingest completed', { chunkCount });
        }
    } catch (error) {
        logger.warn('⚠️ RAG auto-ingest failed (continuing without RAG ingest)', error);
    }

    // Test Ollama connection
    ollamaService.testConnection().then(connected => {
        if (connected) {
            logger.info('✅ Ollama service connected successfully');
        } else {
            logger.warn('⚠️ Ollama service not available - some features may not work');
        }
    });

    // Auto-start llama.cpp server (optional)
    if (llamaCppManager.isEnabled()) {
        llamaCppManager.start().catch(err => {
            logger.warn('⚠️ Failed to start llama.cpp server', err);
        });
    }

    // Auto-index workspace files into RAG (optional)
    try {
        await ragAutoIndexer.start();
    } catch (e) {
        logger.warn('⚠️ Failed to start RAG auto-indexer', e);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    void ragAutoIndexer.stop();
    chromaManager.stop();
    qdrantManager.stop();
    publicGateway.stop();
    llamaCppManager.stop();
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    void ragAutoIndexer.stop();
    chromaManager.stop();
    qdrantManager.stop();
    publicGateway.stop();
    llamaCppManager.stop();
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});

export { app, server, wsService, ollamaService, llamaCppManager };
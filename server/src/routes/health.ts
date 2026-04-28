import express from 'express';
import { OllamaService } from '../services/ollama';
import { Logger } from '../utils/logger';

const router = express.Router();
const ollamaService = new OllamaService();
const logger = new Logger();

// Health check endpoint
router.get('/', async (req, res) => {
    try {
        const startTime = Date.now();

        // Test Ollama connection
        const ollamaHealth = await ollamaService.healthCheck();

        const responseTime = Date.now() - startTime;

        const healthStatus = {
            status: ollamaHealth.status === 'healthy' ? 'healthy' : 'degraded',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            services: {
                ollama: {
                    status: ollamaHealth.status,
                    models: ollamaHealth.models,
                    defaultModel: ollamaHealth.defaultModel,
                    responseTime: responseTime
                },
                server: {
                    status: 'healthy',
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage()
                }
            },
            version: '1.0.0',
            environment: process.env.NODE_ENV || 'development'
        };

        // Set appropriate HTTP status code
        const httpStatus = healthStatus.status === 'healthy' ? 200 : 503;

        res.status(httpStatus).json(healthStatus);
    } catch (error) {
        logger.error('Health check failed:', error);

        res.status(503).json({
            status: 'unhealthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            error: 'Health check failed',
            services: {
                ollama: {
                    status: 'unhealthy',
                    error: 'Connection failed'
                },
                server: {
                    status: 'healthy',
                    memory: process.memoryUsage(),
                    cpu: process.cpuUsage()
                }
            }
        });
    }
});

// Detailed health check
router.get('/detailed', async (req, res) => {
    try {
        const startTime = Date.now();

        // Get detailed information
        const [ollamaHealth, models] = await Promise.all([
            ollamaService.healthCheck(),
            ollamaService.getModels().catch(() => [])
        ]);

        const responseTime = Date.now() - startTime;

        const detailedHealth = {
            status: ollamaHealth.status === 'healthy' ? 'healthy' : 'degraded',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            responseTime,
            services: {
                ollama: {
                    status: ollamaHealth.status,
                    models: ollamaHealth.models,
                    defaultModel: ollamaHealth.defaultModel,
                    availableModels: models.map(m => ({
                        name: m.name,
                        size: m.size,
                        modified: m.modified_at
                    }))
                },
                server: {
                    status: 'healthy',
                    memory: {
                        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                        external: Math.round(process.memoryUsage().external / 1024 / 1024)
                    },
                    cpu: process.cpuUsage(),
                    platform: process.platform,
                    nodeVersion: process.version
                }
            },
            features: {
                memoryAgent: process.env.MEMORY_AGENT_ENABLED === 'true',
                cliAgent: process.env.CLI_AGENT_ENABLED === 'true',
                loadBalancer: process.env.LOAD_BALANCER_ENABLED === 'true',
                audioChat: process.env.AUDIO_CHAT_ENABLED === 'true'
            }
        };

        const httpStatus = detailedHealth.status === 'healthy' ? 200 : 503;
        res.status(httpStatus).json(detailedHealth);
    } catch (error) {
        logger.error('Detailed health check failed:', error);
        res.status(503).json({
            status: 'unhealthy',
            error: 'Detailed health check failed',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;

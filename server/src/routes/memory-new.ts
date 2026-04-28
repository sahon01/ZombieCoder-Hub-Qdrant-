import { Router, Request, Response } from 'express';
import { MemoryService } from '../services/memory';
import { EmbeddingService } from '../services/embedding';
import { OllamaService } from '../services/ollama';
import { Logger } from '../utils/logger';

const router = Router();
const logger = new Logger();

// Initialize services (will be properly initialized in main server)
let memoryService: MemoryService;
let embeddingService: EmbeddingService;
let ollamaService: OllamaService;

// Initialize services function
export const initializeMemoryRoutes = (
    memService: MemoryService,
    embedService: EmbeddingService,
    ollamaSvc: OllamaService
) => {
    memoryService = memService;
    embeddingService = embedService;
    ollamaService = ollamaSvc;
};

// Agent memory endpoints
router.post('/agent', async (req: Request, res: Response) => {
    try {
        const { agentId, content, sessionId, metadata } = req.body;

        if (!agentId || !content) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'agentId and content are required'
            });
        }

        const memoryId = await embeddingService.indexAgentMemory(
            agentId,
            content,
            sessionId,
            metadata
        );

        return res.status(201).json({
            success: true,
            memoryId,
            message: 'Agent memory added successfully'
        });

    } catch (error) {
        logger.error('Failed to add agent memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to add agent memory'
        });
    }
});

router.get('/agent/:agentId', async (req: Request, res: Response) => {
    try {
        const { agentId } = req.params;
        const { sessionId, limit = 50 } = req.query;

        const memories = await memoryService.getAgentMemories(
            agentId,
            sessionId as string,
            parseInt(limit as string)
        );

        return res.json({
            success: true,
            memories,
            count: memories.length
        });

    } catch (error) {
        logger.error('Failed to get agent memories:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get agent memories'
        });
    }
});

// Individual memory endpoints
router.post('/individual', async (req: Request, res: Response) => {
    try {
        const { 
            userId, 
            content, 
            memoryType = 'general', 
            importanceScore = 1.0,
            sessionId, 
            metadata 
        } = req.body;

        if (!userId || !content) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'userId and content are required'
            });
        }

        const memoryId = await embeddingService.indexIndividualMemory(
            userId,
            content,
            memoryType,
            importanceScore,
            sessionId,
            metadata
        );

        return res.status(201).json({
            success: true,
            memoryId,
            message: 'Individual memory added successfully'
        });

    } catch (error) {
        logger.error('Failed to add individual memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to add individual memory'
        });
    }
});

router.get('/individual/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { memoryType, sessionId, limit = 50 } = req.query;

        const memories = await memoryService.getIndividualMemories(
            userId,
            memoryType as string,
            sessionId as string,
            parseInt(limit as string)
        );

        return res.json({
            success: true,
            memories,
            count: memories.length
        });

    } catch (error) {
        logger.error('Failed to get individual memories:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get individual memories'
        });
    }
});

// Search endpoints
router.post('/search/agent', async (req: Request, res: Response) => {
    try {
        const { query, agentId, limit = 10, threshold = 0.7 } = req.body;

        if (!query) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'query is required'
            });
        }

        const memories = await embeddingService.searchSimilarAgentMemories(
            query,
            agentId,
            limit,
            threshold
        );

        return res.json({
            success: true,
            memories,
            count: memories.length
        });

    } catch (error) {
        logger.error('Failed to search agent memories:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to search agent memories'
        });
    }
});

router.post('/search/individual', async (req: Request, res: Response) => {
    try {
        const { query, userId, memoryType, limit = 10, threshold = 0.7 } = req.body;

        if (!query) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'query is required'
            });
        }

        const memories = await embeddingService.searchSimilarIndividualMemories(
            query,
            userId,
            memoryType,
            limit,
            threshold
        );

        return res.json({
            success: true,
            memories,
            count: memories.length
        });

    } catch (error) {
        logger.error('Failed to search individual memories:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to search individual memories'
        });
    }
});

// Batch operations
router.post('/batch', async (req: Request, res: Response) => {
    try {
        const { memories } = req.body;

        if (!Array.isArray(memories) || memories.length === 0) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'memories array is required'
            });
        }

        const memoryIds = await embeddingService.batchIndexMemories(memories);

        return res.status(201).json({
            success: true,
            memoryIds,
            count: memoryIds.length,
            message: 'Batch memories added successfully'
        });

    } catch (error) {
        logger.error('Failed to batch index memories:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to batch index memories'
        });
    }
});

// Update endpoints
router.put('/agent/:memoryId', async (req: Request, res: Response) => {
    try {
        const { memoryId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'content is required'
            });
        }

        await embeddingService.updateMemoryEmbedding(
            parseInt(memoryId),
            'agent_memories',
            content
        );

        return res.json({
            success: true,
            message: 'Agent memory updated successfully'
        });

    } catch (error) {
        logger.error('Failed to update agent memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update agent memory'
        });
    }
});

router.put('/individual/:memoryId', async (req: Request, res: Response) => {
    try {
        const { memoryId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'content is required'
            });
        }

        await embeddingService.updateMemoryEmbedding(
            parseInt(memoryId),
            'individual_memories',
            content
        );

        return res.json({
            success: true,
            message: 'Individual memory updated successfully'
        });

    } catch (error) {
        logger.error('Failed to update individual memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update individual memory'
        });
    }
});

// Delete endpoints
router.delete('/agent/:memoryId', async (req: Request, res: Response) => {
    try {
        const { memoryId } = req.params;

        await memoryService.deleteAgentMemory(parseInt(memoryId));

        return res.json({
            success: true,
            message: 'Agent memory deleted successfully'
        });

    } catch (error) {
        logger.error('Failed to delete agent memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete agent memory'
        });
    }
});

router.delete('/individual/:memoryId', async (req: Request, res: Response) => {
    try {
        const { memoryId } = req.params;

        await memoryService.deleteIndividualMemory(parseInt(memoryId));

        return res.json({
            success: true,
            message: 'Individual memory deleted successfully'
        });

    } catch (error) {
        logger.error('Failed to delete individual memory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete individual memory'
        });
    }
});

// Stats endpoint
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const stats = await embeddingService.getEmbeddingStats();

        return res.json({
            success: true,
            stats
        });

    } catch (error) {
        logger.error('Failed to get memory stats:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get memory stats'
        });
    }
});

// Health check endpoint
router.get('/health', async (req: Request, res: Response) => {
    try {
        const stats = await memoryService.getMemoryStats();
        const embeddingModel = embeddingService.getEmbeddingModel();

        return res.json({
            status: 'healthy',
            services: {
                memory: 'active',
                embedding: 'active',
                ollama: ollamaService.isConnected ? 'connected' : 'disconnected'
            },
            stats,
            embeddingModel,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Memory service health check failed:', error);
        return res.status(500).json({
            status: 'unhealthy',
            error: 'Memory service not available'
        });
    }
});

export default router;

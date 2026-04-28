import { OllamaService } from './ollama';
import { MemoryService } from './memory';
import { Logger } from '../utils/logger';

export class EmbeddingService {
    private ollamaService: OllamaService;
    private memoryService: MemoryService;
    private logger: Logger;
    private embeddingModel: string = process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
    private embedderPromise: Promise<any> | null = null;

    constructor(ollamaService: OllamaService, memoryService: MemoryService) {
        this.ollamaService = ollamaService;
        this.memoryService = memoryService;
        this.logger = new Logger();
    }

    async generateEmbedding(text: string): Promise<Buffer> {
        try {
            const embedder = await this.getLocalEmbedder();

            const out = await embedder(text, { pooling: 'mean', normalize: true });

            const embeddingArray: number[] | Float32Array = out?.data;
            if (!embeddingArray || typeof (embeddingArray as any).length !== 'number') {
                throw new Error('Invalid embedding output received from local model');
            }

            const embeddingBuffer = Buffer.from(new Float32Array(embeddingArray as any).buffer);

            this.logger.info(`Embedding generated for text (${text.length} chars)`, {
                model: this.embeddingModel,
                dimensions: (embeddingArray as any).length
            });

            return embeddingBuffer;
        } catch (error) {
            this.logger.error('Failed to generate embedding:', error);
            throw error;
        }
    }

    private async getLocalEmbedder(): Promise<any> {
        if (!this.embedderPromise) {
            this.embedderPromise = (async () => {
                const mod: any = await import('@xenova/transformers');
                const pipeline = mod.pipeline;
                return pipeline('feature-extraction', this.embeddingModel);
            })();
        }
        return this.embedderPromise;
    }

    async indexAgentMemory(
        agentId: string,
        content: string,
        sessionId?: string,
        metadata?: any
    ): Promise<number> {
        try {
            // Generate embedding
            const embedding = await this.generateEmbedding(content);

            // Store memory with embedding
            const memoryId = await this.memoryService.addAgentMemory(
                agentId,
                content,
                sessionId,
                embedding,
                metadata
            );

            this.logger.info(`Agent memory indexed for agent ${agentId}`, {
                memoryId,
                contentLength: content.length
            });

            return memoryId;
        } catch (error) {
            this.logger.error('Failed to index agent memory:', error);
            throw error;
        }
    }

    async indexIndividualMemory(
        userId: string,
        content: string,
        memoryType: string = 'general',
        importanceScore: number = 1.0,
        sessionId?: string,
        metadata?: any
    ): Promise<number> {
        try {
            // Generate embedding
            const embedding = await this.generateEmbedding(content);

            // Store memory with embedding
            const memoryId = await this.memoryService.addIndividualMemory(
                userId,
                content,
                memoryType,
                embedding,
                importanceScore,
                sessionId,
                metadata
            );

            this.logger.info(`Individual memory indexed for user ${userId}`, {
                memoryId,
                memoryType,
                contentLength: content.length
            });

            return memoryId;
        } catch (error) {
            this.logger.error('Failed to index individual memory:', error);
            throw error;
        }
    }

    async searchSimilarAgentMemories(
        query: string,
        agentId?: string,
        limit: number = 10,
        threshold: number = 0.7
    ): Promise<any[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search for similar memories
            const similarMemories = await this.memoryService.searchSimilarMemories(
                queryEmbedding,
                'agent_memories',
                limit,
                threshold
            );

            // Filter by agent ID if provided
            const filteredMemories = agentId
                ? similarMemories.filter(memory => memory.agent_id === agentId)
                : similarMemories;

            this.logger.info(`Found ${filteredMemories.length} similar agent memories`, {
                query: query.substring(0, 50) + '...',
                agentId
            });

            return filteredMemories;
        } catch (error) {
            this.logger.error('Failed to search similar agent memories:', error);
            throw error;
        }
    }

    async searchSimilarIndividualMemories(
        query: string,
        userId?: string,
        memoryType?: string,
        limit: number = 10,
        threshold: number = 0.7
    ): Promise<any[]> {
        try {
            // Generate embedding for query
            const queryEmbedding = await this.generateEmbedding(query);

            // Search for similar memories
            const similarMemories = await this.memoryService.searchSimilarMemories(
                queryEmbedding,
                'individual_memories',
                limit,
                threshold
            );

            // Filter by user ID and memory type if provided
            let filteredMemories = similarMemories;

            if (userId) {
                filteredMemories = filteredMemories.filter(memory => memory.user_id === userId);
            }

            if (memoryType) {
                filteredMemories = filteredMemories.filter(memory => memory.memory_type === memoryType);
            }

            this.logger.info(`Found ${filteredMemories.length} similar individual memories`, {
                query: query.substring(0, 50) + '...',
                userId,
                memoryType
            });

            return filteredMemories;
        } catch (error) {
            this.logger.error('Failed to search similar individual memories:', error);
            throw error;
        }
    }

    async batchIndexMemories(
        memories: Array<{
            agentId?: string;
            userId?: string;
            content: string;
            memoryType?: string;
            importanceScore?: number;
            sessionId?: string;
            metadata?: any;
        }>
    ): Promise<number[]> {
        const memoryIds: number[] = [];

        for (const memory of memories) {
            try {
                let memoryId: number;

                if (memory.agentId) {
                    memoryId = await this.indexAgentMemory(
                        memory.agentId,
                        memory.content,
                        memory.sessionId,
                        memory.metadata
                    );
                } else if (memory.userId) {
                    memoryId = await this.indexIndividualMemory(
                        memory.userId,
                        memory.content,
                        memory.memoryType,
                        memory.importanceScore,
                        memory.sessionId,
                        memory.metadata
                    );
                } else {
                    this.logger.warn('Memory missing both agentId and userId, skipping');
                    continue;
                }

                memoryIds.push(memoryId);
            } catch (error) {
                this.logger.error('Failed to index memory in batch:', error);
            }
        }

        this.logger.info(`Batch indexed ${memoryIds.length} memories`);
        return memoryIds;
    }

    async updateMemoryEmbedding(
        memoryId: number,
        memoryTable: 'agent_memories' | 'individual_memories',
        newContent: string
    ): Promise<void> {
        try {
            // Generate new embedding
            const embedding = await this.generateEmbedding(newContent);

            // Update memory content and embedding
            if (memoryTable === 'agent_memories') {
                await this.memoryService.updateAgentMemory(memoryId, newContent, embedding);
            } else {
                await this.memoryService.updateIndividualMemory(memoryId, newContent, embedding);
            }

            this.logger.info(`Memory embedding updated`, { memoryId, memoryTable });
        } catch (error) {
            this.logger.error('Failed to update memory embedding:', error);
            throw error;
        }
    }

    async getEmbeddingStats(): Promise<any> {
        try {
            const stats = await this.memoryService.getMemoryStats();

            // Test embedding generation
            const testEmbedding = await this.generateEmbedding('test query');

            return {
                ...stats,
                embeddingModel: this.embeddingModel,
                embeddingDimensions: testEmbedding.length / 4, // Float32 bytes to dimensions
                lastTested: new Date().toISOString()
            };
        } catch (error) {
            this.logger.error('Failed to get embedding stats:', error);
            throw error;
        }
    }

    setEmbeddingModel(model: string): void {
        this.embeddingModel = model;
        this.embedderPromise = null;
        this.logger.info(`Embedding model changed to: ${model}`);
    }

    getEmbeddingModel(): string {
        return this.embeddingModel;
    }
}

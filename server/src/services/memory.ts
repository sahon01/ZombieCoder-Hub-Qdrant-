import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { Logger } from '../utils/logger';

export interface MemoryRow {
    id: number;
    agent_id?: string;
    user_id?: string;
    session_id?: string;
    content: string;
    embedding?: Buffer;
    memory_type?: string;
    importance_score?: number;
    metadata?: string;
    created_at: string;
    updated_at: string;
}

export interface MemoryIndexRow {
    id: number;
    memory_id: number;
    memory_table: string;
    embedding: Buffer;
    created_at: string;
}

export interface FileInfo {
    name: any;
    path: any;
    relativePath: any;
    type: string;
    size: any;
    modified: any;
    created: any;
    children?: any[];
}

export class MemoryService {
    private db: sqlite3.Database | null = null;
    private logger: Logger;
    private dbPath: string;

    constructor() {
        this.logger = new Logger();
        this.dbPath = path.join(process.cwd(), 'data', 'memory.db');
        this.ensureDataDirectory();
    }

    private ensureDataDirectory(): void {
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
    }

    initialize(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    this.logger.error('Failed to open database:', err);
                    reject(err);
                } else {
                    this.createTables()
                        .then(() => {
                            this.logger.info('Memory service initialized successfully');
                            resolve();
                        })
                        .catch(reject);
                }
            });
        });
    }

    private createTables(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            // Agent memories table
            this.db.run(`
                CREATE TABLE IF NOT EXISTS agent_memories (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    agent_id TEXT NOT NULL,
                    session_id TEXT,
                    content TEXT NOT NULL,
                    embedding BLOB,
                    metadata TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
                if (err) {
                    reject(err);
                    return;
                }

                // Individual memories table
                this.db!.run(`
                    CREATE TABLE IF NOT EXISTS individual_memories (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT,
                        session_id TEXT,
                        content TEXT NOT NULL,
                        embedding BLOB,
                        memory_type TEXT DEFAULT 'general',
                        importance_score REAL DEFAULT 1.0,
                        metadata TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Memory index for similarity search
                    this.db!.run(`
                        CREATE TABLE IF NOT EXISTS memory_index (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            memory_id INTEGER,
                            memory_table TEXT NOT NULL,
                            embedding BLOB NOT NULL,
                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                    `, (err) => {
                        if (err) {
                            reject(err);
                            return;
                        }

                        // Create indexes
                        this.createIndexes()
                            .then(resolve)
                            .catch(reject);
                    });
                });
            });
        });
    }

    private createIndexes(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const indexes = [
                'CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_id ON agent_memories(agent_id)',
                'CREATE INDEX IF NOT EXISTS idx_agent_memories_session_id ON agent_memories(session_id)',
                'CREATE INDEX IF NOT EXISTS idx_individual_memories_user_id ON individual_memories(user_id)',
                'CREATE INDEX IF NOT EXISTS idx_individual_memories_session_id ON individual_memories(session_id)',
                'CREATE INDEX IF NOT EXISTS idx_individual_memories_type ON individual_memories(memory_type)'
            ];

            let completed = 0;
            const total = indexes.length;

            indexes.forEach((sql, index) => {
                this.db!.run(sql, (err) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    completed++;
                    if (completed === total) {
                        resolve();
                    }
                });
            });
        });
    }

    async addAgentMemory(
        agentId: string,
        content: string,
        sessionId?: string,
        embedding?: Buffer,
        metadata?: any
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const stmt = this.db.prepare(`
                INSERT INTO agent_memories (agent_id, session_id, content, embedding, metadata)
                VALUES (?, ?, ?, ?, ?)
            `);

            stmt.run([
                agentId,
                sessionId || null,
                content,
                embedding || null,
                JSON.stringify(metadata || {})
            ], function (this: sqlite3.RunResult, err: any) {
                if (err) {
                    reject(err);
                } else {
                    const memoryId = this.lastID;

                    // Add to index if embedding provided
                    if (embedding) {
                        MemoryService.prototype.addToIndex.call(MemoryService.prototype, memoryId, 'agent_memories', embedding)
                            .then(() => resolve(memoryId))
                            .catch(reject);
                    } else {
                        resolve(memoryId);
                    }
                }
            });

            stmt.finalize();
        });
    }

    async addIndividualMemory(
        userId: string,
        content: string,
        memoryType: string = 'general',
        embedding?: Buffer,
        importanceScore: number = 1.0,
        sessionId?: string,
        metadata?: any
    ): Promise<number> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const stmt = this.db.prepare(`
                INSERT INTO individual_memories (user_id, session_id, content, embedding, memory_type, importance_score, metadata)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);

            stmt.run([
                userId,
                sessionId || null,
                content,
                embedding || null,
                memoryType,
                importanceScore,
                JSON.stringify(metadata || {})
            ], function (this: sqlite3.RunResult, err: any) {
                if (err) {
                    reject(err);
                } else {
                    const memoryId = this.lastID;

                    // Add to index if embedding provided
                    if (embedding) {
                        MemoryService.prototype.addToIndex.call(MemoryService.prototype, memoryId, 'individual_memories', embedding)
                            .then(() => resolve(memoryId))
                            .catch(reject);
                    } else {
                        resolve(memoryId);
                    }
                }
            });

            stmt.finalize();
        });
    }

    private async addToIndex(memoryId: number, memoryTable: string, embedding: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const stmt = this.db.prepare(`
                INSERT INTO memory_index (memory_id, memory_table, embedding)
                VALUES (?, ?, ?)
            `);

            stmt.run([memoryId, memoryTable, embedding], function (this: sqlite3.RunResult, err: any) {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });

            stmt.finalize();
        });
    }

    async getAgentMemories(
        agentId: string,
        sessionId?: string,
        limit: number = 50
    ): Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            let sql = 'SELECT * FROM agent_memories WHERE agent_id = ?';
            const params: any[] = [agentId];

            if (sessionId) {
                sql += ' AND session_id = ?';
                params.push(sessionId);
            }

            sql += ' ORDER BY created_at DESC LIMIT ?';
            params.push(limit);

            this.db.all(sql, params, (err, rows: MemoryRow[]) => {
                if (err) {
                    reject(err);
                } else {
                    const memories = rows.map((memory: MemoryRow) => ({
                        ...memory,
                        metadata: memory.metadata ? JSON.parse(memory.metadata) : {}
                    }));
                    resolve(memories);
                }
            });
        });
    }

    async getIndividualMemories(
        userId: string,
        memoryType?: string,
        sessionId?: string,
        limit: number = 50
    ): Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            let sql = 'SELECT * FROM individual_memories WHERE user_id = ?';
            const params: any[] = [userId];

            if (memoryType) {
                sql += ' AND memory_type = ?';
                params.push(memoryType);
            }

            if (sessionId) {
                sql += ' AND session_id = ?';
                params.push(sessionId);
            }

            sql += ' ORDER BY importance_score DESC, created_at DESC LIMIT ?';
            params.push(limit);

            this.db.all(sql, params, (err, rows: MemoryRow[]) => {
                if (err) {
                    reject(err);
                } else {
                    const memories = rows.map((memory: MemoryRow) => ({
                        ...memory,
                        metadata: memory.metadata ? JSON.parse(memory.metadata) : {}
                    }));
                    resolve(memories);
                }
            });
        });
    }

    async searchSimilarMemories(
        queryEmbedding: Buffer,
        memoryTable: 'agent_memories' | 'individual_memories',
        limit: number = 10,
        threshold: number = 0.7
    ): Promise<any[]> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const sql = `
                SELECT mi.*, m.content, m.metadata, m.created_at
                FROM memory_index mi
                JOIN ${memoryTable} m ON mi.memory_id = m.id
                WHERE mi.memory_table = ?
                ORDER BY mi.created_at DESC
                LIMIT ?
            `;

            this.db.all(sql, [memoryTable, limit * 2], (err, rows: any[]) => {
                if (err) {
                    reject(err);
                } else {
                    // Calculate similarity scores
                    const similarMemories = rows
                        .map((memory: any) => {
                            const similarity = this.calculateCosineSimilarity(
                                queryEmbedding,
                                memory.embedding
                            );
                            return {
                                ...memory,
                                similarity,
                                metadata: memory.metadata ? JSON.parse(memory.metadata) : {}
                            };
                        })
                        .filter((memory: any) => memory.similarity >= threshold)
                        .sort((a: any, b: any) => b.similarity - a.similarity)
                        .slice(0, limit);

                    resolve(similarMemories);
                }
            });
        });
    }

    private calculateCosineSimilarity(embedding1: Buffer, embedding2: Buffer): number {
        // Simplified cosine similarity calculation
        const vec1 = Array.from(embedding1);
        const vec2 = Array.from(embedding2);

        if (vec1.length !== vec2.length) return 0;

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        if (norm1 === 0 || norm2 === 0) return 0;

        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    async updateAgentMemory(memoryId: number, content: string, embedding?: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const stmt = this.db.prepare(`
                UPDATE agent_memories SET content = ?, embedding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `);

            stmt.run([content, embedding || null, memoryId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    // Update index if embedding provided
                    if (embedding) {
                        const updateStmt = this.db!.prepare(`
                            UPDATE memory_index SET embedding = ? WHERE memory_id = ? AND memory_table = ?
                        `);
                        updateStmt.run([embedding, memoryId, 'agent_memories'], (updateErr) => {
                            if (updateErr) {
                                reject(updateErr);
                            } else {
                                resolve();
                            }
                        });
                        updateStmt.finalize();
                    } else {
                        resolve();
                    }
                }
            });

            stmt.finalize();
        });
    }

    async updateIndividualMemory(memoryId: number, content: string, embedding?: Buffer): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const stmt = this.db.prepare(`
                UPDATE individual_memories SET content = ?, embedding = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `);

            stmt.run([content, embedding || null, memoryId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    // Update index if embedding provided
                    if (embedding) {
                        const updateStmt = this.db!.prepare(`
                            UPDATE memory_index SET embedding = ? WHERE memory_id = ? AND memory_table = ?
                        `);
                        updateStmt.run([embedding, memoryId, 'individual_memories'], (updateErr) => {
                            if (updateErr) {
                                reject(updateErr);
                            } else {
                                resolve();
                            }
                        });
                        updateStmt.finalize();
                    } else {
                        resolve();
                    }
                }
            });

            stmt.finalize();
        });
    }

    async deleteAgentMemory(memoryId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            this.db.run('DELETE FROM agent_memories WHERE id = ?', [memoryId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.db!.run('DELETE FROM memory_index WHERE memory_id = ? AND memory_table = ?',
                        [memoryId, 'agent_memories'], (indexErr) => {
                            if (indexErr) {
                                reject(indexErr);
                            } else {
                                this.logger.info(`Agent memory deleted`, { memoryId });
                                resolve();
                            }
                        });
                }
            });
        });
    }

    async deleteIndividualMemory(memoryId: number): Promise<void> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            this.db.run('DELETE FROM individual_memories WHERE id = ?', [memoryId], (err) => {
                if (err) {
                    reject(err);
                } else {
                    this.db!.run('DELETE FROM memory_index WHERE memory_id = ? AND memory_table = ?',
                        [memoryId, 'individual_memories'], (indexErr) => {
                            if (indexErr) {
                                reject(indexErr);
                            } else {
                                this.logger.info(`Individual memory deleted`, { memoryId });
                                resolve();
                            }
                        });
                }
            });
        });
    }

    async getMemoryStats(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }

            const queries = [
                'SELECT COUNT(*) as count FROM agent_memories',
                'SELECT COUNT(*) as count FROM individual_memories',
                'SELECT COUNT(*) as count FROM memory_index'
            ];

            let completed = 0;
            const results: any = {};

            queries.forEach((sql, index) => {
                this.db!.get(sql, (err, row: any) => {
                    if (err) {
                        reject(err);
                        return;
                    }

                    const key = index === 0 ? 'agentMemories' :
                        index === 1 ? 'individualMemories' : 'indexedMemories';
                    results[key] = row.count;

                    completed++;
                    if (completed === queries.length) {
                        results.databaseSize = fs.existsSync(this.dbPath) ? fs.statSync(this.dbPath).size : 0;
                        resolve(results);
                    }
                });
            });
        });
    }

    async close(): Promise<void> {
        return new Promise((resolve) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) {
                        this.logger.error('Error closing database:', err);
                    } else {
                        this.logger.info('Memory service closed');
                    }
                    this.db = null;
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

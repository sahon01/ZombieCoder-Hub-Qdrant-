import express from 'express';
import { Logger } from '../utils/logger';
import { executeQuery } from '../database/connection';

const router = express.Router();
const logger = new Logger();

// Get conversations
router.get('/conversations', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Memory conversations require a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const rows: any[] = await executeQuery(
            `SELECT
                c.id,
                COALESCE(c.title, CONCAT('Conversation ', c.id)) as name,
                (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) as messageCount,
                c.updated_at as lastUpdated
             FROM conversations c
             ORDER BY c.updated_at DESC
             LIMIT 100`
        );

        res.json({
            success: true,
            conversations: rows,
            total: rows.length,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to get conversations:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversations',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Store data in memory
router.post('/store', async (req, res) => {
    try {
        const { agentId, key, value, ttl } = req.body;

        if (!agentId || !key || value === undefined) {
            return res.status(400).json({
                success: false,
                error: 'agentId, key and value are required'
            });
        }

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Memory store requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const expiresAt = ttl ? new Date(Date.now() + Number(ttl) * 1000).toISOString() : null;
        const metadata = { expiresAt };

        await executeQuery(
            `INSERT INTO agent_memory (agent_id, content_type, content, metadata, is_cached, cache_key)
             VALUES (?, 'context', ?, ?, TRUE, ?)
             ON DUPLICATE KEY UPDATE
               content = VALUES(content),
               metadata = VALUES(metadata),
               is_cached = VALUES(is_cached),
               updated_at = CURRENT_TIMESTAMP`,
            [Number(agentId), JSON.stringify(value), JSON.stringify(metadata), key]
        );

        res.json({
            success: true,
            key,
            expiresAt,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to store data in memory:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to store data',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Retrieve data from memory
router.get('/retrieve/:key', async (req, res) => {
    try {
        const { key } = req.params;

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Memory retrieve requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const rows: any[] = await executeQuery(
            `SELECT id, content, metadata, created_at as createdAt
             FROM agent_memory
             WHERE cache_key = ?
               AND is_cached = TRUE
             ORDER BY updated_at DESC
             LIMIT 1`,
            [key]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Data not found',
                key
            });
        }

        const row = rows[0];
        const metadata = row.metadata || null;
        const expiresAt = metadata?.expiresAt || null;

        if (expiresAt && new Date(expiresAt) < new Date()) {
            await executeQuery('DELETE FROM agent_memory WHERE id = ?', [row.id]);
            return res.status(404).json({
                success: false,
                error: 'Data has expired',
                key
            });
        }

        let parsedValue: any = row.content;
        try {
            parsedValue = JSON.parse(row.content);
        } catch {
            parsedValue = row.content;
        }

        res.json({
            success: true,
            key,
            value: parsedValue,
            createdAt: row.createdAt,
            expiresAt,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error(`Failed to retrieve data for key ${req.params.key}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve data',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Search memory
router.post('/search', async (req, res) => {
    try {
        const { query, limit = 10 } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Memory search requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const q = `%${query}%`;
        const rows: any[] = await executeQuery(
            `SELECT cache_key as \`key\`, content, metadata, created_at as createdAt
             FROM agent_memory
             WHERE is_cached = TRUE
               AND cache_key IS NOT NULL
               AND (cache_key LIKE ? OR content LIKE ?)
             ORDER BY updated_at DESC
             LIMIT ?`,
            [q, q, Number(limit)]
        );

        const results = rows.map(r => {
            let val: any = r.content;
            try {
                val = JSON.parse(r.content);
            } catch {
                val = r.content;
            }

            return {
                key: r.key,
                value: val,
                createdAt: r.createdAt
            };
        });

        res.json({
            success: true,
            results,
            total: results.length,
            query,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Failed to search memory:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to search memory',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Get conversation messages
router.get('/conversations/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Conversation messages require a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const totalRows: any[] = await executeQuery(
            'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
            [conversationId]
        );
        const total = Array.isArray(totalRows) && totalRows.length > 0 ? Number(totalRows[0].total) : 0;

        const rows: any[] = await executeQuery(
            `SELECT
                sender_type as role,
                content,
                created_at as timestamp
             FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?`,
            [conversationId, Number(limit), Number(offset)]
        );

        res.json({
            success: true,
            conversationId,
            messages: rows,
            total,
            limit: Number(limit),
            offset: Number(offset),
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error(`Failed to get messages for conversation ${req.params.conversationId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation messages',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Backwards-compatible alias (kept last to avoid route shadowing)
router.get('/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;
        const { limit = 100, offset = 0 } = req.query;

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Conversation messages require a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const totalRows: any[] = await executeQuery(
            'SELECT COUNT(*) as total FROM messages WHERE conversation_id = ?',
            [conversationId]
        );
        const total = Array.isArray(totalRows) && totalRows.length > 0 ? Number(totalRows[0].total) : 0;

        const rows: any[] = await executeQuery(
            `SELECT
                sender_type as role,
                content,
                created_at as timestamp
             FROM messages
             WHERE conversation_id = ?
             ORDER BY created_at ASC
             LIMIT ? OFFSET ?`,
            [conversationId, Number(limit), Number(offset)]
        );

        res.json({
            success: true,
            conversationId,
            messages: rows,
            total,
            limit: Number(limit),
            offset: Number(offset),
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error(`Failed to get messages for conversation ${req.params.conversationId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to fetch conversation messages',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Delete conversation
router.delete('/conversations/:conversationId', async (req, res) => {
    try {
        const { conversationId } = req.params;

        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available',
                message: 'Conversation delete requires a database connection',
                timestamp: new Date().toISOString()
            });
        }

        const result: any = await executeQuery('DELETE FROM conversations WHERE id = ?', [conversationId]);
        if ((result as any).affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: 'Conversation not found',
                conversationId,
                timestamp: new Date().toISOString()
            });
        }

        res.json({
            success: true,
            message: 'Conversation deleted successfully',
            conversationId,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error(`Failed to delete conversation ${req.params.conversationId}:`, error);

        res.status(500).json({
            success: false,
            error: 'Failed to delete conversation',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

export default router;

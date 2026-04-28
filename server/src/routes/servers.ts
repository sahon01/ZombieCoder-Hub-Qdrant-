import express from 'express';
import { Logger } from '../utils/logger';
import { executeQuery } from '../database/connection';

const router = express.Router();
const logger = new Logger();

// Helper to work with strict TS mode
const asHandler = <T extends express.RequestHandler>(handler: T) => handler;

type PromiseHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => void;

// GET /servers - List all servers with optional filters
router.get('/', async (req, res) => {
    try {
        const { status, location, provider_id, page = 1, limit = 20 } = req.query;
        
        let sql = `
            SELECT 
                s.id,
                s.name,
                s.hostname,
                s.ip_address,
                s.location,
                s.status,
                s.cpu_load,
                s.memory_usage,
                s.disk_usage,
                s.uptime_seconds,
                s.last_heartbeat,
                s.provider_id,
                s.metadata,
                s.created_at,
                s.updated_at,
                p.name as provider_name,
                p.type as provider_type
            FROM servers s
            LEFT JOIN ai_providers p ON s.provider_id = p.id
        `;
        
        const conditions: string[] = [];
        const params: any[] = [];
        
        if (status) {
            conditions.push('s.status = ?');
            params.push(status);
        }
        
        if (location) {
            conditions.push('s.location LIKE ?');
            params.push(`%${location}%`);
        }
        
        if (provider_id) {
            conditions.push('s.provider_id = ?');
            params.push(provider_id);
        }
        
        if (conditions.length > 0) {
            sql += ' WHERE ' + conditions.join(' AND ');
        }
        
        sql += ' ORDER BY s.name ASC';
        
        // Add pagination
        const parsedLimit = parseInt(req.query.limit as string) || 10;
        const offset = parseInt(req.query.offset as string) || 0;
        const servers = await executeQuery(sql, params);
        
        // Get total count for pagination
        let countSql = 'SELECT COUNT(*) as total FROM servers s';
        if (conditions.length > 0) {
            countSql += ' WHERE ' + conditions.join(' AND ');
        }
        const countResult = await executeQuery(countSql, params.slice(0, -2)); // Remove limit/offset params
        const total = countResult[0]?.total || 0;
        
        res.json({
            success: true,
            data: servers,
            pagination: {
                page: Number(page),
                limit: Number(parsedLimit),
                total,
                totalPages: Math.ceil(total / Number(parsedLimit))
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to fetch servers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch servers',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /servers/:id - Get specific server details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const servers = await executeQuery(`
            SELECT 
                s.*,
                p.name as provider_name,
                p.type as provider_type,
                p.api_endpoint as provider_endpoint
            FROM servers s
            LEFT JOIN ai_providers p ON s.provider_id = p.id
            WHERE s.id = ?
        `, [id]);
        
        if (servers.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Server not found',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        res.json({
            success: true,
            data: servers[0],
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to fetch server ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch server',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /servers - Create new server entry
router.post('/', async (req, res) => {
    try {
        const { 
            name, 
            hostname, 
            ip_address, 
            location, 
            status = 'offline',
            cpu_load = 0.00,
            memory_usage = 0.00,
            disk_usage = 0.00,
            uptime_seconds = 0,
            provider_id,
            metadata = {}
        } = req.body;
        
        // Validation
        if (!name || !hostname) {
            res.status(400).json({
                success: false,
                error: 'name and hostname are required fields'
            });
            return;
        }
        
        const result = await executeQuery(`
            INSERT INTO servers 
            (name, hostname, ip_address, location, status, cpu_load, memory_usage, 
             disk_usage, uptime_seconds, provider_id, metadata, last_heartbeat)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
        `, [
            name,
            hostname,
            ip_address,
            location,
            status,
            cpu_load,
            memory_usage,
            disk_usage,
            uptime_seconds,
            provider_id,
            JSON.stringify(metadata)
        ]);
        
        res.status(201).json({
            success: true,
            message: 'Server created successfully',
            data: { id: (result as any).insertId },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to create server:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create server',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// PUT /servers/:id - Update server information
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            name,
            hostname,
            ip_address,
            location,
            status,
            cpu_load,
            memory_usage,
            disk_usage,
            uptime_seconds,
            provider_id,
            metadata
        } = req.body;
        
        // Check if server exists
        const existingServers = await executeQuery('SELECT id FROM servers WHERE id = ?', [id]);
        if (existingServers.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Server not found'
            });
            return;
        }
        
        const updates: string[] = [];
        const params: any[] = [];
        
        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (hostname !== undefined) {
            updates.push('hostname = ?');
            params.push(hostname);
        }
        if (ip_address !== undefined) {
            updates.push('ip_address = ?');
            params.push(ip_address);
        }
        if (location !== undefined) {
            updates.push('location = ?');
            params.push(location);
        }
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        if (cpu_load !== undefined) {
            updates.push('cpu_load = ?');
            params.push(cpu_load);
        }
        if (memory_usage !== undefined) {
            updates.push('memory_usage = ?');
            params.push(memory_usage);
        }
        if (disk_usage !== undefined) {
            updates.push('disk_usage = ?');
            params.push(disk_usage);
        }
        if (uptime_seconds !== undefined) {
            updates.push('uptime_seconds = ?');
            params.push(uptime_seconds);
        }
        if (provider_id !== undefined) {
            updates.push('provider_id = ?');
            params.push(provider_id);
        }
        if (metadata !== undefined) {
            updates.push('metadata = ?');
            params.push(JSON.stringify(metadata));
        }
        
        // Always update the heartbeat timestamp
        updates.push('last_heartbeat = NOW()');
        updates.push('updated_at = CURRENT_TIMESTAMP');
        
        if (updates.length === 2) { // Only heartbeat and updated_at
            res.status(400).json({
                success: false,
                error: 'No fields to update'
            });
            return;
        }
        
        params.push(id);
        
        await executeQuery(`
            UPDATE servers 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, params);
        
        res.json({
            success: true,
            message: 'Server updated successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to update server ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to update server',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// DELETE /servers/:id - Remove server entry
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await executeQuery('DELETE FROM servers WHERE id = ?', [id]);
        
        const resultRow = result as { affectedRows?: number };
        if (resultRow.affectedRows === 0) {
            res.status(404).json({
                success: false,
                error: 'Server not found',
                timestamp: new Date().toISOString()
            });
            return;
        }
        
        res.json({
            success: true,
            message: 'Server deleted successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to delete server ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete server',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// GET /servers/stats - Get aggregate statistics
router.get('/stats/summary', async (req, res) => {
    try {
        // Overall statistics
        const stats = await executeQuery(`
            SELECT 
                COUNT(*) as total_servers,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_servers,
                SUM(CASE WHEN status = 'offline' THEN 1 ELSE 0 END) as offline_servers,
                SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) as maintenance_servers,
                SUM(CASE WHEN status = 'degraded' THEN 1 ELSE 0 END) as degraded_servers,
                AVG(cpu_load) as avg_cpu_load,
                AVG(memory_usage) as avg_memory_usage,
                AVG(disk_usage) as avg_disk_usage
            FROM servers
        `);
        
        // Statistics by location
        const locationStats = await executeQuery(`
            SELECT 
                location,
                COUNT(*) as server_count,
                SUM(CASE WHEN status = 'online' THEN 1 ELSE 0 END) as online_count,
                AVG(cpu_load) as avg_cpu,
                AVG(memory_usage) as avg_memory
            FROM servers
            WHERE location IS NOT NULL
            GROUP BY location
            ORDER BY server_count DESC
        `);
        
        // Statistics by provider
        const providerStats = await executeQuery(`
            SELECT 
                p.name as provider_name,
                p.type as provider_type,
                COUNT(s.id) as server_count,
                SUM(CASE WHEN s.status = 'online' THEN 1 ELSE 0 END) as online_count
            FROM ai_providers p
            LEFT JOIN servers s ON p.id = s.provider_id
            GROUP BY p.id, p.name, p.type
            HAVING server_count > 0
            ORDER BY server_count DESC
        `);
        
        res.json({
            success: true,
            data: {
                overall: stats[0],
                byLocation: locationStats,
                byProvider: providerStats
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to fetch server statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch server statistics',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// POST /servers/:id/heartbeat - Update server heartbeat
router.post('/:id/heartbeat', async (req, res) => {
    try {
        const { id } = req.params;
        const { status, cpu_load, memory_usage, disk_usage, uptime_seconds } = req.body;
        
        // Check if server exists
        const existingServers = await executeQuery('SELECT id FROM servers WHERE id = ?', [id]);
        if (existingServers.length === 0) {
            res.status(404).json({
                success: false,
                error: 'Server not found'
            });
            return;
        }
        
        const updates: string[] = ['last_heartbeat = NOW()'];
        const params: any[] = [];
        
        if (status !== undefined) {
            updates.push('status = ?');
            params.push(status);
        }
        if (cpu_load !== undefined) {
            updates.push('cpu_load = ?');
            params.push(cpu_load);
        }
        if (memory_usage !== undefined) {
            updates.push('memory_usage = ?');
            params.push(memory_usage);
        }
        if (disk_usage !== undefined) {
            updates.push('disk_usage = ?');
            params.push(disk_usage);
        }
        if (uptime_seconds !== undefined) {
            updates.push('uptime_seconds = ?');
            params.push(uptime_seconds);
        }
        
        params.push(id);
        
        await executeQuery(`
            UPDATE servers 
            SET ${updates.join(', ')}
            WHERE id = ?
        `, params);
        
        res.json({
            success: true,
            message: 'Server heartbeat updated successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error(`Failed to update server heartbeat ${req.params.id}:`, error);
        res.status(500).json({
            success: false,
            error: 'Failed to update server heartbeat',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;
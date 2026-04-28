import express from 'express';
import { exec } from 'child_process';
import { spawn } from 'child_process';
import { promisify } from 'util';
import { Logger } from '../utils/logger';
import { executeQuery } from '../database/connection';

const router = express.Router();
const logger = new Logger();
const execAsync = promisify(exec);

async function ensureCliCommandsTable(): Promise<void> {
    if (!(global as any).connection) return;
    await executeQuery(
        `
            CREATE TABLE IF NOT EXISTS cli_commands (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT NULL,
                command VARCHAR(1024) NOT NULL,
                args_json TEXT NULL,
                working_directory VARCHAR(1024) NULL,
                timeout_ms INT NULL,
                is_active TINYINT(1) NOT NULL DEFAULT 1,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `
    );
}

function safeJsonParse<T>(value: any, fallback: T): T {
    if (!value) return fallback;
    if (typeof value === 'object') return value as T;
    if (typeof value !== 'string') return fallback;
    try {
        return JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

function spawnAndCollect(
    command: string,
    args: string[],
    opts: { cwd?: string; timeoutMs?: number; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: opts.cwd || process.cwd(),
            env: { ...process.env, ...(opts.env || {}) },
            shell: false,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0 ? opts.timeoutMs : 30000;
        const timeoutId = setTimeout(() => {
            try {
                child.kill('SIGTERM');
            } catch {
            }
        }, timeoutMs);

        child.stdout?.on('data', (d) => {
            stdout += d.toString();
        });
        child.stderr?.on('data', (d) => {
            stderr += d.toString();
        });

        child.on('close', (code) => {
            clearTimeout(timeoutId);
            resolve({ stdout, stderr, exitCode: code });
        });
    });
}

// Execute command
router.post('/execute', async (req, res) => {
    try {
        const { cmd } = req.body;

        if (!cmd || typeof cmd !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Command is required and must be a string'
            });
        }

        // Security check - only allow safe commands
        const allowedCommands = [
            'ls', 'dir', 'pwd', 'cd', 'mkdir', 'rmdir', 'touch', 'echo',
            'cat', 'type', 'head', 'tail', 'grep', 'find', 'which',
            'ps', 'top', 'df', 'du', 'free', 'uname', 'whoami',
            'git', 'npm', 'node', 'python', 'pip'
        ];

        const commandParts = cmd.trim().split(' ');
        const baseCommand = commandParts[0].toLowerCase();

        if (!allowedCommands.includes(baseCommand)) {
            return res.status(403).json({
                success: false,
                error: 'Command not allowed for security reasons',
                allowedCommands: allowedCommands.slice(0, 10) // Show first 10 for reference
            });
        }

        logger.info('Executing CLI command:', { command: cmd });

        const startTime = Date.now();

        try {
            const { stdout, stderr } = await execAsync(cmd, {
                timeout: 30000, // 30 seconds timeout
                cwd: process.cwd(),
                encoding: 'utf8'
            });

            const executionTime = Date.now() - startTime;

            res.json({
                success: true,
                command: cmd,
                output: stdout,
                error: stderr || null,
                executionTime,
                timestamp: new Date().toISOString()
            });

            logger.info('CLI command executed successfully', {
                command: cmd,
                executionTime: `${executionTime}ms`
            });
            return;
        } catch (execError: any) {
            const executionTime = Date.now() - startTime;

            res.json({
                success: false,
                command: cmd,
                output: execError.stdout || '',
                error: execError.stderr || execError.message,
                executionTime,
                timestamp: new Date().toISOString()
            });

            logger.warn('CLI command execution failed', {
                command: cmd,
                error: execError.message,
                executionTime: `${executionTime}ms`
            });
            return;
        }
    } catch (error) {
        logger.error('CLI execution error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to execute command',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// List registered commands
router.get('/commands', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available'
            });
        }

        await ensureCliCommandsTable();

        const includeInactive = String(req.query.includeInactive || '').toLowerCase() === 'true';
        const rows = await executeQuery(
            `
                SELECT id, name, description, command, args_json as argsJson, working_directory as workingDirectory, timeout_ms as timeoutMs, is_active as isActive,
                       created_at as createdAt, updated_at as updatedAt
                FROM cli_commands
                ${includeInactive ? '' : 'WHERE is_active = 1'}
                ORDER BY name ASC
            `
        );

        return res.json({
            success: true,
            data: rows,
            count: Array.isArray(rows) ? rows.length : 0,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to list CLI commands:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to list CLI commands',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Create registered command
router.post('/commands', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available'
            });
        }

        await ensureCliCommandsTable();

        const { name, description = null, command, args = [], workingDirectory = null, timeoutMs = null, isActive = true } = req.body || {};

        if (!name || !command) {
            return res.status(400).json({
                success: false,
                error: 'name and command are required'
            });
        }

        const argsJson = JSON.stringify(Array.isArray(args) ? args : []);

        const result: any = await executeQuery(
            `
                INSERT INTO cli_commands (name, description, command, args_json, working_directory, timeout_ms, is_active)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `,
            [String(name).trim(), description, String(command).trim(), argsJson, workingDirectory, timeoutMs, isActive ? 1 : 0]
        );

        return res.status(201).json({
            success: true,
            message: 'Command registered',
            data: { id: result.insertId }
        });
    } catch (error) {
        logger.error('Failed to create CLI command:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create CLI command',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Update registered command
router.put('/commands/:id', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available'
            });
        }

        await ensureCliCommandsTable();

        const { id } = req.params;
        const { name, description, command, args, workingDirectory, timeoutMs, isActive } = req.body || {};

        const updates: string[] = [];
        const values: any[] = [];

        if (name !== undefined) {
            updates.push('name = ?');
            values.push(String(name).trim());
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (command !== undefined) {
            updates.push('command = ?');
            values.push(String(command).trim());
        }
        if (args !== undefined) {
            updates.push('args_json = ?');
            values.push(JSON.stringify(Array.isArray(args) ? args : []));
        }
        if (workingDirectory !== undefined) {
            updates.push('working_directory = ?');
            values.push(workingDirectory);
        }
        if (timeoutMs !== undefined) {
            updates.push('timeout_ms = ?');
            values.push(timeoutMs);
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            values.push(isActive ? 1 : 0);
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No updates provided'
            });
        }

        values.push(id);
        await executeQuery(`UPDATE cli_commands SET ${updates.join(', ')} WHERE id = ?`, values);

        return res.json({ success: true, message: 'Command updated' });
    } catch (error) {
        logger.error('Failed to update CLI command:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update CLI command',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Delete (deactivate) registered command
router.delete('/commands/:id', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available'
            });
        }

        await ensureCliCommandsTable();

        const { id } = req.params;
        await executeQuery('UPDATE cli_commands SET is_active = 0 WHERE id = ?', [id]);
        return res.json({ success: true, message: 'Command deactivated' });
    } catch (error) {
        logger.error('Failed to delete CLI command:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to delete CLI command',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// Execute registered command by id (safe allowlist from DB)
router.post('/execute-registered', async (req, res) => {
    try {
        if (!(global as any).connection) {
            return res.status(503).json({
                success: false,
                error: 'Database not available'
            });
        }

        await ensureCliCommandsTable();

        const { id, argsOverride, env = {} } = req.body || {};
        if (!id) {
            return res.status(400).json({
                success: false,
                error: 'id is required'
            });
        }

        const rows: any[] = await executeQuery(
            'SELECT id, name, command, args_json as argsJson, working_directory as workingDirectory, timeout_ms as timeoutMs, is_active as isActive FROM cli_commands WHERE id = ? LIMIT 1',
            [id]
        );

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Command not found' });
        }

        const row = rows[0] as any;
        if (!row.isActive) {
            return res.status(400).json({ success: false, error: 'Command is inactive' });
        }

        const storedArgs = safeJsonParse<string[]>(row.argsJson, []);
        const args = Array.isArray(argsOverride) ? argsOverride.map(String) : storedArgs.map(String);

        logger.info('Executing registered CLI command', { id: row.id, name: row.name, command: row.command });

        const start = Date.now();
        const result = await spawnAndCollect(String(row.command), args, {
            cwd: row.workingDirectory || process.cwd(),
            timeoutMs: typeof row.timeoutMs === 'number' ? row.timeoutMs : 30000,
            env: typeof env === 'object' && env ? env : {}
        });
        const executionTime = Date.now() - start;

        return res.json({
            success: result.exitCode === 0,
            commandId: row.id,
            name: row.name,
            command: row.command,
            args,
            output: result.stdout,
            error: result.stderr || null,
            exitCode: result.exitCode,
            executionTime,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('CLI registered execution error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to execute registered command',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// Get system information
router.get('/system-info', async (req, res) => {
    try {
        const systemInfo = {
            platform: process.platform,
            arch: process.arch,
            nodeVersion: process.version,
            uptime: process.uptime(),
            memory: {
                used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                external: Math.round(process.memoryUsage().external / 1024 / 1024)
            },
            cpu: process.cpuUsage(),
            workingDirectory: process.cwd(),
            environment: process.env.NODE_ENV || 'development'
        };

        res.json({
            success: true,
            systemInfo,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get system info:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to get system information',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// Get allowed commands
router.get('/allowed-commands', async (req, res) => {
    try {
        const allowedCommands = [
            { name: 'ls', description: 'List directory contents', platform: 'unix' },
            { name: 'dir', description: 'List directory contents', platform: 'windows' },
            { name: 'pwd', description: 'Print working directory', platform: 'unix' },
            { name: 'cd', description: 'Change directory', platform: 'both' },
            { name: 'mkdir', description: 'Create directory', platform: 'both' },
            { name: 'touch', description: 'Create empty file', platform: 'unix' },
            { name: 'echo', description: 'Print text', platform: 'both' },
            { name: 'cat', description: 'Display file contents', platform: 'unix' },
            { name: 'type', description: 'Display file contents', platform: 'windows' },
            { name: 'grep', description: 'Search text in files', platform: 'unix' },
            { name: 'find', description: 'Search for files', platform: 'unix' },
            { name: 'ps', description: 'List running processes', platform: 'unix' },
            { name: 'top', description: 'Display running processes', platform: 'unix' },
            { name: 'git', description: 'Git version control', platform: 'both' },
            { name: 'npm', description: 'Node package manager', platform: 'both' },
            { name: 'node', description: 'Node.js runtime', platform: 'both' }
        ];

        res.json({
            success: true,
            allowedCommands,
            total: allowedCommands.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get allowed commands:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to get allowed commands',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

// Test command execution
router.post('/test', async (req, res) => {
    try {
        const testCommand = process.platform === 'win32' ? 'echo Hello from CLI Agent' : 'echo "Hello from CLI Agent"';

        const startTime = Date.now();
        const { stdout, stderr } = await execAsync(testCommand);
        const executionTime = Date.now() - startTime;

        res.json({
            success: true,
            message: 'CLI Agent is working correctly',
            testCommand,
            output: stdout.trim(),
            error: stderr || null,
            executionTime,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('CLI test failed:', error);

        res.status(500).json({
            success: false,
            error: 'CLI test failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;

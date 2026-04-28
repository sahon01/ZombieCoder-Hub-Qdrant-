import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { Logger } from '../utils/logger';

interface FileInfo {
    name: any;
    path: any;
    relativePath: any;
    type: string;
    size: any;
    modified: any;
    created: any;
    children?: FileInfo[];
}

const router = Router();
const logger = new Logger();

// Active processes storage
const activeProcesses = new Map<string, any>();

// Execute command
router.post('/execute', async (req: Request, res: Response): Promise<Response> => {
    try {
        const {
            command,
            args = [],
            workingDirectory = process.cwd(),
            timeout = 30000,
            env = {},
            sessionId
        } = req.body;

        if (!command) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'command is required'
            });
        }

        const processId = `cli_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Create child process
        const childProcess = spawn(command, args, {
            cwd: workingDirectory,
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: true
        });

        let stdout = '';
        let stderr = '';

        // Collect output
        childProcess.stdout?.on('data', (data) => {
            stdout += data.toString();
            // Send real-time output via WebSocket if available
            // This would be integrated with WebSocket service
        });

        childProcess.stderr?.on('data', (data) => {
            stderr += data.toString();
        });

        // Set timeout
        const timeoutId = setTimeout(() => {
            childProcess.kill('SIGTERM');
        }, timeout);

        // Handle process completion
        childProcess.on('close', (code, signal) => {
            clearTimeout(timeoutId);
            activeProcesses.delete(processId);

            const result = {
                processId,
                command,
                args,
                exitCode: code,
                signal,
                stdout,
                stderr,
                completed: true,
                timestamp: new Date().toISOString()
            };

            logger.info(`CLI command completed`, {
                processId,
                command,
                exitCode: code,
                signal
            });

            // Store result for retrieval
            // This would be stored in database in production
        });

        // Store active process
        activeProcesses.set(processId, {
            process: childProcess,
            command,
            args,
            startTime: new Date(),
            status: 'running'
        });

        return res.status(202).json({
            success: true,
            processId,
            status: 'started',
            message: 'Command execution started'
        });

    } catch (error) {
        logger.error('Failed to execute CLI command:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to execute command'
        });
    }
});

// Get process status
router.get('/status/:processId', async (req: Request, res: Response): Promise<Response> => {
    try {
        const { processId } = req.params;
        const processInfo = activeProcesses.get(processId);

        if (!processInfo) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Process not found'
            });
        }

        return res.json({
            success: true,
            processId,
            status: processInfo.status,
            command: processInfo.command,
            startTime: processInfo.startTime,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to get process status:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get process status'
        });
    }
});

// Kill process
router.delete('/kill/:processId', async (req: Request, res: Response): Promise<Response> => {
    try {
        const { processId } = req.params;
        const processInfo = activeProcesses.get(processId);

        if (!processInfo) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Process not found'
            });
        }

        processInfo.process.kill('SIGTERM');
        activeProcesses.delete(processId);

        return res.json({
            success: true,
            processId,
            message: 'Process terminated'
        });

    } catch (error) {
        logger.error('Failed to kill process:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to kill process'
        });
    }
});

// List active processes
router.get('/processes', async (req: Request, res: Response): Promise<Response> => {
    try {
        const processes = Array.from(activeProcesses.entries()).map(([id, info]) => ({
            processId: id,
            command: info.command,
            status: info.status,
            startTime: info.startTime
        }));

        return res.json({
            success: true,
            processes,
            count: processes.length
        });

    } catch (error) {
        logger.error('Failed to list processes:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to list processes'
        });
    }
});

// File operations
router.post('/file/read', async (req: Request, res: Response): Promise<Response> => {
    try {
        const { filePath, encoding = 'utf8' } = req.body;

        if (!filePath) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'filePath is required'
            });
        }

        const fs = require('fs').promises;

        try {
            const content = await fs.readFile(filePath, encoding);
            const stats = await fs.stat(filePath);

            return res.json({
                success: true,
                filePath,
                content,
                size: stats.size,
                modified: stats.mtime,
                timestamp: new Date().toISOString()
            });

        } catch (fileError) {
            return res.status(404).json({
                error: 'File Not Found',
                message: `File not found: ${filePath}`,
                filePath
            });
        }

    } catch (error) {
        logger.error('Failed to read file:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to read file'
        });
    }
});

router.post('/file/write', async (req: Request, res: Response): Promise<Response> => {
    try {
        const { filePath, content, encoding = 'utf8', createDirectories = true } = req.body;

        if (!filePath || content === undefined) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'filePath and content are required'
            });
        }

        const fs = require('fs').promises;
        const path = require('path');

        // Create directories if needed
        if (createDirectories) {
            const dir = path.dirname(filePath);
            await fs.mkdir(dir, { recursive: true });
        }

        await fs.writeFile(filePath, content, encoding);

        return res.json({
            success: true,
            filePath,
            bytesWritten: Buffer.byteLength(content, encoding),
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to write file:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to write file'
        });
    }
});

router.post('/file/list', async (req: Request, res: Response): Promise<Response> => {
    try {
        const { directoryPath, recursive = false, showHidden = false } = req.body;

        if (!directoryPath) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'directoryPath is required'
            });
        }

        const fs = require('fs').promises;
        const path = require('path');

        const listDirectory = async (dir: string, baseDir: string = dir): Promise<FileInfo[]> => {
            try {
                const items = await fs.readdir(dir, { withFileTypes: true });
                const result: FileInfo[] = [];

                for (const item of items) {
                    if (!showHidden && item.name.startsWith('.')) {
                        continue;
                    }

                    const fullPath = path.join(dir, item.name);
                    const relativePath = path.relative(baseDir, fullPath);
                    const stats = await fs.stat(fullPath);

                    const fileInfo: FileInfo = {
                        name: item.name,
                        path: fullPath,
                        relativePath,
                        type: item.isDirectory() ? 'directory' : 'file',
                        size: stats.size,
                        modified: stats.mtime,
                        created: stats.birthtime
                    };

                    if (item.isDirectory() && recursive) {
                        (fileInfo as any).children = await listDirectory(fullPath, baseDir);
                    }

                    result.push(fileInfo);
                }

                return result;
            } catch (error) {
                throw new Error(`Failed to list directory: ${dir}`);
            }
        };

        const files = await listDirectory(directoryPath);

        return res.json({
            success: true,
            directoryPath,
            files,
            count: files.length,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to list directory:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to list directory'
        });
    }
});

// System information
router.get('/system', async (req: Request, res: Response): Promise<Response> => {
    try {
        const os = require('os');
        const process = require('process');

        const systemInfo = {
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpus: os.cpus().length,
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            uptime: os.uptime(),
            loadAverage: os.loadavg(),
            cwd: process.cwd(),
            env: Object.keys(process.env).filter(key =>
                !key.toLowerCase().includes('password') &&
                !key.toLowerCase().includes('secret') &&
                !key.toLowerCase().includes('key')
            ).reduce((obj, key) => {
                obj[key] = process.env[key];
                return obj;
            }, {} as Record<string, string>)
        };

        return res.json({
            success: true,
            system: systemInfo,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Failed to get system info:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get system information'
        });
    }
});

// Health check
router.get('/health', async (req: Request, res: Response): Promise<Response> => {
    try {
        const healthInfo = {
            status: 'healthy',
            services: {
                cli: 'active',
                processes: activeProcesses.size
            },
            activeProcesses: activeProcesses.size,
            timestamp: new Date().toISOString()
        };

        return res.json(healthInfo);

    } catch (error) {
        logger.error('CLI agent health check failed:', error);
        return res.status(500).json({
            status: 'unhealthy',
            error: 'CLI agent not available'
        });
    }
});

export const initializeCLIRoutes = () => {
    // CLI routes are self-contained, no initialization needed
    logger.info('CLI routes initialized');
};

export default router;

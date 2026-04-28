import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { Logger } from '../utils/logger';

const router = express.Router();
const logger = new Logger();

// Send content to editor
router.post('/send', async (req, res) => {
    try {
        const { path: filePath, content, action } = req.body;

        if (!filePath || typeof filePath !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'File path is required'
            });
        }

        if (!action || !['open', 'save', 'insert'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Action must be one of: open, save, insert'
            });
        }

        // Security check - prevent path traversal
        const safePath = path.resolve(filePath);
        const workingDir = process.cwd();

        if (!safePath.startsWith(workingDir)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied - path outside working directory'
            });
        }

        let result;

        switch (action) {
            case 'open':
                try {
                    const fileContent = await fs.readFile(safePath, 'utf8');
                    result = {
                        message: 'File opened successfully',
                        content: fileContent,
                        path: filePath
                    };
                } catch (error) {
                    return res.status(404).json({
                        success: false,
                        error: 'File not found',
                        path: filePath
                    });
                }
                break;

            case 'save':
                if (!content) {
                    return res.status(400).json({
                        success: false,
                        error: 'Content is required for save action'
                    });
                }

                try {
                    await fs.writeFile(safePath, content, 'utf8');
                    result = {
                        message: 'File saved successfully',
                        path: filePath,
                        size: content.length
                    };
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to save file',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                break;

            case 'insert':
                if (!content) {
                    return res.status(400).json({
                        success: false,
                        error: 'Content is required for insert action'
                    });
                }

                try {
                    const existingContent = await fs.readFile(safePath, 'utf8').catch(() => '');
                    const newContent = existingContent + content;
                    await fs.writeFile(safePath, newContent, 'utf8');
                    result = {
                        message: 'Content inserted successfully',
                        path: filePath,
                        insertedLength: content.length,
                        totalLength: newContent.length
                    };
                } catch (error) {
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to insert content',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
                break;
        }

        logger.info('Editor action completed', {
            action,
            path: filePath,
            success: true
        });

        res.json({
            success: true,
            ...result,
            timestamp: new Date().toISOString()
        });
        return;
    } catch (error) {
        logger.error('Editor send error:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to process editor request',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Get file information
router.get('/file-info', async (req, res) => {
    try {
        const { path: filePath } = req.query;

        if (!filePath || typeof filePath !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'File path is required'
            });
        }

        // Security check
        const safePath = path.resolve(filePath);
        const workingDir = process.cwd();

        if (!safePath.startsWith(workingDir)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied - path outside working directory'
            });
        }

        try {
            const stats = await fs.stat(safePath);

            const fileInfo = {
                path: filePath,
                name: path.basename(safePath),
                size: stats.size,
                isFile: stats.isFile(),
                isDirectory: stats.isDirectory(),
                createdAt: stats.birthtime.toISOString(),
                modifiedAt: stats.mtime.toISOString(),
                permissions: stats.mode.toString(8)
            };

            res.json({
                success: true,
                fileInfo,
                timestamp: new Date().toISOString()
            });
            return;
        } catch (error) {
            res.status(404).json({
                success: false,
                error: 'File not found',
                path: filePath
            });
            return;
        }
    } catch (error) {
        logger.error('Failed to get file info:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to get file information',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// List directory contents
router.get('/list-directory', async (req, res) => {
    try {
        const { path: dirPath } = req.query;
        const directory = (dirPath as string) || process.cwd();

        // Security check
        const safePath = path.resolve(directory);
        const workingDir = process.cwd();

        if (!safePath.startsWith(workingDir)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied - path outside working directory'
            });
        }

        try {
            const entries = await fs.readdir(safePath, { withFileTypes: true });

            const directoryContents = await Promise.all(
                entries.map(async (entry) => {
                    const fullPath = path.join(safePath, entry.name);
                    const stats = await fs.stat(fullPath).catch(() => null);

                    return {
                        name: entry.name,
                        type: entry.isDirectory() ? 'directory' : 'file',
                        size: stats?.size || 0,
                        modified: stats?.mtime.toISOString() || null
                    };
                })
            );

            res.json({
                success: true,
                path: directory,
                contents: directoryContents,
                total: directoryContents.length,
                timestamp: new Date().toISOString()
            });
            return;
        } catch (error) {
            res.status(404).json({
                success: false,
                error: 'Directory not found',
                path: directory
            });
            return;
        }
    } catch (error) {
        logger.error('Failed to list directory:', error);

        res.status(500).json({
            success: false,
            error: 'Failed to list directory contents',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
        return;
    }
});

// Test editor integration
router.get('/test', async (req, res) => {
    try {
        const testFile = path.join(process.cwd(), 'test-editor-integration.txt');
        const testContent = `Test file created at: ${new Date().toISOString()}\nThis is a test for editor integration.`;

        try {
            await fs.writeFile(testFile, testContent, 'utf8');

            res.json({
                success: true,
                message: 'Editor integration test successful',
                testFile: 'test-editor-integration.txt',
                contentLength: testContent.length,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Failed to create test file',
                message: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    } catch (error) {
        logger.error('Editor test failed:', error);

        res.status(500).json({
            success: false,
            error: 'Editor test failed',
            message: error instanceof Error ? error.message : 'Unknown error',
            timestamp: new Date().toISOString()
        });
    }
});

export default router;

import express from 'express';
import { Logger } from '../utils/logger';
import ToolRegistry, { LangChainToolFactory } from '../services/toolRegistry';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();
const logger = new Logger();

function requireApiKey(req: express.Request, res: express.Response, next: express.NextFunction) {
  const configuredKey = process.env.UAS_API_KEY || process.env.API_KEY;
  if (!configuredKey) {
    logger.warn('UAS_API_KEY/API_KEY is not set; rejecting protected request');
    res.status(500).json({
      success: false,
      error: 'Server misconfiguration',
      message: 'UAS_API_KEY/API_KEY is not set',
      timestamp: new Date().toISOString()
    });
    return;
  }

  const providedKey = req.header('X-API-Key') || '';
  if (!providedKey || providedKey !== configuredKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Missing or invalid API key',
      timestamp: new Date().toISOString()
    });
    return;
  }

  next();
}

router.get('/tools', async (req, res) => {
  try {
    const agentIdRaw = req.query.agentId;
    const numericAgentId = typeof agentIdRaw === 'string' ? parseInt(agentIdRaw, 10) : NaN;

    if (!Number.isNaN(numericAgentId)) {
      const tools = await ToolRegistry.getToolCatalogForAgent(numericAgentId);
      res.json({
        success: true,
        agentId: numericAgentId,
        tools,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const tools = ToolRegistry.getAllTools().map(t => ({
      name: t.name,
      category: t.category,
      description: t.description,
      isActive: false,
      config: t.config,
      source: 'built_in'
    }));

    res.json({
      success: true,
      tools,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to list MCP tools:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list tools',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/execute', requireApiKey, async (req, res) => {
  try {
    const { agentId, toolName, input, configOverride } = req.body || {};

    const numericAgentId = typeof agentId === 'number' ? agentId : parseInt(String(agentId || ''), 10);
    if (Number.isNaN(numericAgentId)) {
      res.status(400).json({
        success: false,
        error: 'agentId is required and must be a numeric ID',
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!toolName || typeof toolName !== 'string') {
      res.status(400).json({
        success: false,
        error: 'toolName is required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    const toolConfig = ToolRegistry.getTool(toolName);
    const agentTool = await ToolRegistry.getAgentToolEffectiveConfig(numericAgentId, toolName);
    if (!agentTool || !agentTool.isActive) {
      res.status(404).json({
        success: false,
        error: 'Tool not found or inactive',
        toolName,
        agentId: numericAgentId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    if (!toolConfig) {
      res.status(400).json({
        success: false,
        error: 'Tool is not a built-in executable tool',
        toolName,
        agentId: numericAgentId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const sensitiveTools = new Set(['shell_exec', 'file_read', 'file_write']);
    if (sensitiveTools.has(toolName) && configOverride) {
      res.status(400).json({
        success: false,
        error: 'configOverride is not allowed for this tool',
        toolName,
        agentId: numericAgentId,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const mergedConfig = {
      ...(toolConfig.config || {}),
      ...(agentTool.config || {}),
      ...(configOverride && typeof configOverride === 'object' ? configOverride : {})
    };

    const tool = LangChainToolFactory.createTool(toolName, mergedConfig);
    if (!tool) {
      res.status(400).json({
        success: false,
        error: 'Tool is not executable',
        toolName,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const dyn: any = tool as any;
    if (typeof dyn.func !== 'function') {
      res.status(400).json({
        success: false,
        error: 'Tool is missing executable handler',
        toolName,
        timestamp: new Date().toISOString()
      });
      return;
    }

    const startedAt = Date.now();
    const output = await dyn.func(typeof input === 'string' ? input : JSON.stringify(input ?? ''));

    res.json({
      success: true,
      toolName,
      agentId: numericAgentId,
      output,
      latency_ms: Date.now() - startedAt,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to execute MCP tool:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to execute tool',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

// Universal configuration endpoint for portable agent setup
router.get('/config/universal', async (req, res) => {
  try {
    const universalConfig = {
      core_engine: {
        server: "@modelcontextprotocol/server-filesystem",
        args: ["."],
        env: {
          CROSS_FOLDER_RECOGNITION: "true",
          PERSONA_DRIVEN: "true",
          ZOMBIECODER_PERSONA: "enabled",
          WORKSPACE_ROOT: ".",
          AGENT_IDENTITY_PATH: "./identity.json",
          AGENT_MEMORY_PATH: "./.agent-memory",
          AGENT_ETHICS_PATH: "./Agent Intent & Ethical.md"
        }
      },
      mcp_playwright: {
        server: "@playwright/mcp@latest",
        env: {
          BROWSER_AUTOMATION: "true",
          ZOMBIECODER_PERSONA: "enabled"
        }
      },
      zombiecoder_runtime: {
        server: "local",
        command: "npm",
        args: ["run", "-s", "mcp-stdio"],
        env: {
          AGENT_MAX_HISTORY: "12",
          AGENT_SYSTEM_PROMPT_MAX_CHARS: "1200",
          OLLAMA_NUM_CTX: "2048",
          OLLAMA_NUM_PREDICT: "512",
          MCP_BASE_URL: "http://localhost:8000",
          AGENT_TOOLS_ENDPOINT: "http://localhost:8000/mcp/tools",
          MCP_TOOLS_ENDPOINT: "http://localhost:8000/mcp/tools",
          REMOTE_REPO_URL: "https://github.com/zombiecoderbd/Zombie-Coder-Agentic-Hub",
          AUTO_SYNC_ENABLED: "true"
        }
      }
    };

    res.json({
      success: true,
      config: universalConfig,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to get universal config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get universal config',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Sync configuration from remote repository
router.post('/sync/from-repo', async (req, res) => {
  try {
    const { repoUrl, branch = 'main' } = req.body || {};
    
    if (!repoUrl) {
      res.status(400).json({
        success: false,
        error: 'repoUrl is required',
        timestamp: new Date().toISOString()
      });
      return;
    }

    // This would typically involve git operations
    // For now, return success with sync info
    res.json({
      success: true,
      message: 'Sync initiated from repository',
      repoUrl,
      branch,
      timestamp: new Date().toISOString(),
      nextSteps: [
        'Configuration files will be updated',
        'Agent identity and ethics will be reloaded',
        'Server endpoints will be reconfigured'
      ]
    });
  } catch (error) {
    logger.error('Failed to sync from repo:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to sync from repository',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;

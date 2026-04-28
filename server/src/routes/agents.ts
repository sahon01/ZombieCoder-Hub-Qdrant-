import express from 'express';
import { OllamaService, AgentConfig } from '../services/ollama';
import { ProviderGateway } from '../services/providerGateway';
import { Logger } from '../utils/logger';
import { executeQuery } from '../database/connection';
import { ragService } from '../services/ragService';
import { sanitizeModelResponse } from '../utils/ethics';
import { langChainAgentService } from '../services/langChainAgent';
import fs from 'fs';
import path from 'path';

const router = express.Router();
const ollamaService = new OllamaService();
const providerGateway = new ProviderGateway();
const logger = new Logger();

async function getDefaultModelFromSettings(): Promise<string> {
  try {
    const rows: any[] = await executeQuery(
      'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
      ['default_model']
    );
    const v = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any)?.setting_value : null;
    if (typeof v === 'string' && v.trim()) return v.trim();
  } catch {
    // ignore; fall back to env
  }

  const env = process.env.OLLAMA_DEFAULT_MODEL;
  if (typeof env === 'string' && env.trim()) return env.trim();
  return 'llama3.1:latest';
}

type SystemIdentitySummary = {
  name?: string;
  version?: string;
  tagline?: string;
  branding?: {
    owner?: string;
    organization?: string;
    location?: string;
    license?: string;
    contact?: {
      email?: string;
      website?: string;
    };
  };
};

let systemIdentitySummary: SystemIdentitySummary | null = null;
try {
  const identityPath = path.join(process.cwd(), '..', 'identity.json');
  const identityFile = fs.readFileSync(identityPath, 'utf-8');
  const parsed = JSON.parse(identityFile);
  if (parsed && typeof parsed === 'object' && parsed.system_identity && typeof parsed.system_identity === 'object') {
    const si = parsed.system_identity as any;
    systemIdentitySummary = {
      name: typeof si.name === 'string' ? si.name : undefined,
      version: typeof si.version === 'string' ? si.version : undefined,
      tagline: typeof si.tagline === 'string' ? si.tagline : undefined,
      branding: si.branding && typeof si.branding === 'object'
        ? {
          owner: typeof si.branding.owner === 'string' ? si.branding.owner : undefined,
          organization: typeof si.branding.organization === 'string' ? si.branding.organization : undefined,
          location: typeof si.branding.location === 'string' ? si.branding.location : undefined,
          license: typeof si.branding.license === 'string' ? si.branding.license : undefined,
          contact: si.branding.contact && typeof si.branding.contact === 'object'
            ? {
              email: typeof si.branding.contact.email === 'string' ? si.branding.contact.email : undefined,
              website: typeof si.branding.contact.website === 'string' ? si.branding.contact.website : undefined
            }
            : undefined
        }
        : undefined
    };
  }
} catch {
  systemIdentitySummary = null;
}

// Get all agents
router.get('/', async (req, res) => {
  try {
    // Fetch from database
    const agents = await executeQuery(`
      SELECT 
        id,
        name,
        type,
        persona_name,
        description,
        status,
        config AS configuration,
        request_count,
        active_sessions,
        metadata,
        created_at,
        updated_at
      FROM agents
      ORDER BY name
    `);

    if (Array.isArray(agents)) {
      res.json({
        success: true,
        agents: agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          type: agent.type,
          status: agent.status,
          persona_name: agent.persona_name ?? null,
          description: agent.description ?? null,
          config: agent.configuration || {},
          system_prompt: (() => {
            try {
              const meta = agent.metadata
                ? (typeof agent.metadata === 'string' ? JSON.parse(agent.metadata) : agent.metadata)
                : null;
              return typeof meta?.system_prompt === 'string' ? meta.system_prompt : null;
            } catch {
              return null;
            }
          })(),
          requestCount: agent.request_count || 0,
          activeSessions: agent.active_sessions || 0,
          createdAt: agent.created_at,
          updatedAt: agent.updated_at
        })),
        total: agents.length,
        source: 'database',
        timestamp: new Date().toISOString()
      });
      return;
    }
  } catch (dbError) {
    logger.warn('Failed to fetch agents from database:', dbError instanceof Error ? dbError.message : String(dbError));
    res.status(503).json({
      success: false,
      error: 'Database not available',
      message: 'Cannot fetch agents when running without database',
      timestamp: new Date().toISOString()
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: 'Failed to fetch agents',
    message: 'Unknown error',
    timestamp: new Date().toISOString()
  });
  return;
});

// Get specific agent status
router.get('/:agentId/status', async (req, res) => {
  try {
    const { agentId } = req.params;

    const numericId = parseInt(agentId, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({
        success: false,
        error: 'agentId must be a numeric ID',
        timestamp: new Date().toISOString()
      });
    }

    const rows: any[] = await executeQuery(
      'SELECT id, name, type, status, request_count, active_sessions, updated_at FROM agents WHERE id = ? LIMIT 1',
      [numericId]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
        agentId: numericId,
        timestamp: new Date().toISOString()
      });
    }

    const agentRow = rows[0];

    res.json({
      success: true,
      agent: {
        id: agentRow.id,
        name: agentRow.name,
        type: agentRow.type,
        status: agentRow.status,
        requestCount: agentRow.request_count || 0,
        activeSessions: agentRow.active_sessions || 0,
        updatedAt: agentRow.updated_at
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error(`Failed to get agent status for ${req.params.agentId}:`, error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to get agent status',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

// Start agent
router.post('/:agentId/start', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Agent lifecycle operations are not implemented',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to start agent ${req.params.agentId}:`, error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to start agent',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Stop agent
router.post('/:agentId/stop', async (req, res) => {
  try {
    res.status(501).json({
      success: false,
      error: 'Not implemented',
      message: 'Agent lifecycle operations are not implemented',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error(`Failed to stop agent ${req.params.agentId}:`, error instanceof Error ? error.message : String(error));

    res.status(500).json({
      success: false,
      error: 'Failed to stop agent',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
});

// Call agent
router.post('/:agentId/call', async (req, res) => {
  try {
    const startedAt = Date.now();
    (req as any)._startedAt = startedAt;
    const { agentId } = req.params;
    const { action, payload, model: requestedModelTopLevel, stream } = req.body;

    let result;
    let dbAgent = null;
    let modelName = await getDefaultModelFromSettings(); // Default model
    let agentConfig: AgentConfig | undefined = undefined;

    const numericId = parseInt(agentId, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({
        success: false,
        error: 'agentId must be a numeric ID',
        timestamp: new Date().toISOString()
      });
    }

    const agentData = await executeQuery(
      'SELECT id, name, type, status, persona_name, description, config, metadata FROM agents WHERE id = ?',
      [numericId]
    );

    if (!Array.isArray(agentData) || agentData.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found in database',
        agentId: numericId,
        timestamp: new Date().toISOString()
      });
    }

    dbAgent = agentData[0];

    const requestedSessionId =
      (typeof (req.body as any)?.sessionId === 'string' ? (req.body as any).sessionId : null) ||
      (typeof payload?.sessionId === 'string' ? payload.sessionId : null);

    const sessionId = (requestedSessionId && requestedSessionId.trim())
      ? requestedSessionId.trim()
      : `agent-${numericId}-${Date.now()}`;

    const identityPayload = {
      system_identity: systemIdentitySummary,
      agent: {
        id: dbAgent.id,
        name: dbAgent.name,
        type: dbAgent.type,
        persona_name: dbAgent.persona_name ?? null,
        description: dbAgent.description ?? null
      },
      metadata: (() => {
        try {
          const meta = typeof dbAgent.metadata === 'string' ? JSON.parse(dbAgent.metadata) : (dbAgent.metadata ?? null);
          return meta;
        } catch {
          return null;
        }
      })()
    };

    try {
      const config = typeof dbAgent.config === 'string'
        ? JSON.parse(dbAgent.config)
        : dbAgent.config;

      const metadata = typeof dbAgent.metadata === 'string'
        ? JSON.parse(dbAgent.metadata)
        : dbAgent.metadata;

      agentConfig = {
        id: dbAgent.id,
        name: dbAgent.name,
        type: dbAgent.type,
        status: dbAgent.status,
        persona_name: dbAgent.persona_name,
        system_prompt: typeof metadata?.system_prompt === 'string' ? metadata.system_prompt : undefined,
        config: config || {},
        metadata: metadata || {}
      };

      if (typeof config?.model === 'string' && config.model.trim()) {
        modelName = config.model;
      }
    } catch (parseError) {
      logger.warn('Failed to parse agent config; continuing with defaults', parseError instanceof Error ? parseError.message : String(parseError));
    }

    const validActions = ['generate_code', 'chat', 'generate', 'agent'];
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Valid actions: ${validActions.join(', ')}`,
        action,
        agentId: numericId,
        timestamp: new Date().toISOString()
      });
    }

    const wantsStream = Boolean(stream) || Boolean((payload as any)?.stream);
    if (wantsStream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control'
      });

      res.write(`data: ${JSON.stringify({
        type: 'start',
        agentId: numericId,
        action,
        sessionId,
        model: requestedModelTopLevel || payload?.model || modelName,
        timestamp: new Date().toISOString()
      })}\n\n`);

      let fullResponse = '';
      const onChunk = (chunk: string) => {
        fullResponse += chunk;
        res.write(`data: ${JSON.stringify({
          type: 'chunk',
          content: chunk,
          timestamp: new Date().toISOString()
        })}\n\n`);
      };

      try {
        if (action === 'agent') {
          const q = typeof payload?.prompt === 'string'
            ? payload.prompt
            : (typeof payload?.query === 'string' ? payload.query : '');
          if (!q || !q.trim()) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              error: 'Payload with prompt/query is required for agent action',
              timestamp: new Date().toISOString()
            })}\n\n`);
            res.end();
            return;
          }

          const agentStreamResult = await langChainAgentService.executeAgentStream({
            agentId: numericId,
            sessionId,
            query: q,
            model: requestedModelTopLevel || payload?.model || modelName,
            onChunk
          });

          if (!agentStreamResult?.success) {
            const responseTimeMs = Date.now() - startedAt;
            res.write(`data: ${JSON.stringify({
              type: 'error',
              error: 'Agent runner failed',
              message: agentStreamResult?.error || 'Unknown error',
              response_time_ms: responseTimeMs,
              agentId: numericId,
              action,
              sessionId,
              timestamp: new Date().toISOString()
            })}\n\n`);
            res.end();
            return;
          }

          const responseTimeMs = Date.now() - startedAt;
          res.write(`data: ${JSON.stringify({
            type: 'complete',
            fullResponse: sanitizeModelResponse(fullResponse),
            response_time_ms: responseTimeMs,
            agentId: numericId,
            action,
            sessionId,
            timestamp: new Date().toISOString()
          })}\n\n`);
          res.end();
          return;
        }

        if (action === 'generate_code' || action === 'generate') {
          if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              error: 'Payload with prompt is required for generate action',
              timestamp: new Date().toISOString()
            })}\n\n`);
            res.end();
            return;
          }

          const resolvedModel = requestedModelTopLevel || payload.model || modelName;

          let finalPrompt = payload.prompt;
          try {
            if (process.env.RAG_ENABLED === '1' || String(process.env.RAG_ENABLED || '').toLowerCase() === 'true') {
              const { contextText } = await ragService.retrieveContext(finalPrompt, parseInt(String(process.env.RAG_TOP_K || '6'), 10));
              if (contextText && contextText.trim()) {
                finalPrompt = `${finalPrompt}\n\n[RAG_CONTEXT]\n${contextText}`;
              }
            }
          } catch (ragErr) {
            logger.warn('RAG retrieve failed; continuing without RAG context', ragErr instanceof Error ? ragErr.message : String(ragErr));
          }

          await providerGateway.generateStream(finalPrompt, resolvedModel, agentConfig, onChunk);
        } else if (action === 'chat') {
          if (!Array.isArray(payload?.messages)) {
            res.write(`data: ${JSON.stringify({
              type: 'error',
              error: 'Messages array is required for chat action',
              timestamp: new Date().toISOString()
            })}\n\n`);
            res.end();
            return;
          }

          const resolvedModel = requestedModelTopLevel || payload.model || modelName;

          let finalMessages = payload.messages;
          try {
            if (process.env.RAG_ENABLED === '1' || String(process.env.RAG_ENABLED || '').toLowerCase() === 'true') {
              const lastUser = [...payload.messages].reverse().find((m: any) => m && m.role === 'user' && typeof m.content === 'string');
              const q = typeof lastUser?.content === 'string' ? lastUser.content : '';
              if (q && q.trim()) {
                const { contextText } = await ragService.retrieveContext(q, parseInt(String(process.env.RAG_TOP_K || '6'), 10));
                if (contextText && contextText.trim()) {
                  finalMessages = [
                    ...payload.messages,
                    {
                      role: 'system',
                      content: `[RAG_CONTEXT]\n${contextText}`
                    }
                  ];
                }
              }
            }
          } catch (ragErr) {
            logger.warn('RAG retrieve failed; continuing without RAG context', ragErr instanceof Error ? ragErr.message : String(ragErr));
          }

          await providerGateway.chatStream(finalMessages, resolvedModel, agentConfig, onChunk);
        }

        const responseTimeMs = Date.now() - startedAt;
        const safeFullResponse = sanitizeModelResponse(fullResponse);
        res.write(`data: ${JSON.stringify({
          type: 'complete',
          fullResponse: safeFullResponse,
          response_time_ms: responseTimeMs,
          agentId: numericId,
          action,
          sessionId,
          timestamp: new Date().toISOString()
        })}\n\n`);
        res.end();
        return;
      } catch (e) {
        const responseTimeMs = Date.now() - startedAt;
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Failed to call agent',
          message: e instanceof Error ? e.message : String(e),
          response_time_ms: responseTimeMs,
          agentId: numericId,
          action,
          sessionId,
          timestamp: new Date().toISOString()
        })}\n\n`);
        res.end();
        return;
      }
    }

    try {
      if (action === 'agent') {
        const q = typeof payload?.prompt === 'string'
          ? payload.prompt
          : (typeof payload?.query === 'string' ? payload.query : '');
        if (!q || !q.trim()) {
          const responseTimeMs = Date.now() - startedAt;
          return res.status(400).json({
            success: false,
            error: 'Payload with prompt/query is required for agent action',
            response_time_ms: responseTimeMs,
            agentId,
            action,
            sessionId,
            identity: identityPayload,
            timestamp: new Date().toISOString()
          });
        }

        const agentResult = await langChainAgentService.executeAgent({
          agentId: numericId,
          sessionId,
          query: q,
          model: requestedModelTopLevel || payload?.model || modelName
        });

        if (!agentResult?.success) {
          const responseTimeMs = Date.now() - startedAt;
          return res.status(500).json({
            success: false,
            error: 'Agent runner failed',
            message: agentResult?.error || 'Unknown error',
            response_time_ms: responseTimeMs,
            agentId,
            action,
            sessionId,
            identity: identityPayload,
            timestamp: new Date().toISOString()
          });
        }

        result = {
          response: agentResult.output,
          explanation: `Agent runner executed successfully using agent: ${dbAgent.name}`,
          model: agentResult.model,
          agent: {
            id: dbAgent.id,
            name: dbAgent.name,
            type: dbAgent.type
          },
          toolsUsed: agentResult.toolsUsed,
          latency: agentResult.latency,
          sessionId: agentResult.sessionId
        };
      } else if (action === 'generate_code' || action === 'generate') {
        if (!payload || typeof payload.prompt !== 'string' || !payload.prompt.trim()) {
          const responseTimeMs = Date.now() - startedAt;
          return res.status(400).json({
            success: false,
            error: 'Payload with prompt is required for generate action',
            response_time_ms: responseTimeMs,
            agentId,
            action,
            sessionId,
            identity: identityPayload,
            timestamp: new Date().toISOString()
          });
        }

        const resolvedModel = requestedModelTopLevel || payload.model || modelName;

        let finalPrompt = payload.prompt;
        try {
          const shouldUseRag = (process.env.RAG_ENABLED === '1' || String(process.env.RAG_ENABLED || '').toLowerCase() === 'true')
            && payload.prompt.trim().length > 20;

          if (shouldUseRag) {
            const { contextText } = await ragService.retrieveContext(finalPrompt, parseInt(String(process.env.RAG_TOP_K || '6'), 10));
            if (contextText && contextText.trim()) {
              finalPrompt = `${finalPrompt}\n\n[RAG_CONTEXT]\n${contextText}`;
            }
          }
        } catch (ragErr) {
          logger.warn('RAG retrieve failed; continuing without RAG context', ragErr instanceof Error ? ragErr.message : String(ragErr));
        }

        const dbResponse = await providerGateway.generate(finalPrompt, resolvedModel, agentConfig);
        result = {
          response: dbResponse,
          explanation: `Code/text generated successfully using agent: ${dbAgent.name}`,
          model: resolvedModel,
          agent: {
            id: dbAgent.id,
            name: dbAgent.name,
            type: dbAgent.type
          }
        };
      } else if (action === 'chat') {
        if (!Array.isArray(payload?.messages)) {
          const responseTimeMs = Date.now() - startedAt;
          return res.status(400).json({
            success: false,
            error: 'Messages array is required for chat action',
            response_time_ms: responseTimeMs,
            agentId,
            action,
            sessionId,
            identity: identityPayload,
            timestamp: new Date().toISOString()
          });
        }

        const resolvedModel = requestedModelTopLevel || payload.model || modelName;

        let finalMessages = payload.messages;
        try {
          const shouldUseRag = (process.env.RAG_ENABLED === '1' || String(process.env.RAG_ENABLED || '').toLowerCase() === 'true');

          if (shouldUseRag) {
            const lastUser = [...payload.messages].reverse().find((m: any) => m && m.role === 'user' && typeof m.content === 'string');
            const q = typeof lastUser?.content === 'string' ? lastUser.content : '';
            if (q && q.trim().length > 20) {
              const { contextText } = await ragService.retrieveContext(q, parseInt(String(process.env.RAG_TOP_K || '6'), 10));
              if (contextText && contextText.trim()) {
                finalMessages = [
                  ...payload.messages,
                  {
                    role: 'system',
                    content: `[RAG_CONTEXT]\n${contextText}`
                  }
                ];
              }
            }
          }
        } catch (ragErr) {
          logger.warn('RAG retrieve failed; continuing without RAG context', ragErr instanceof Error ? ragErr.message : String(ragErr));
        }

        const dbChatResponse = await providerGateway.chat(finalMessages, resolvedModel, agentConfig);
        result = {
          response: dbChatResponse,
          explanation: `Chat response generated successfully using agent: ${dbAgent.name}`,
          model: resolvedModel,
          agent: {
            id: dbAgent.id,
            name: dbAgent.name,
            type: dbAgent.type
          }
        };
      }
    } catch (generationError) {
      const responseTimeMs = Date.now() - startedAt;
      return res.status(500).json({
        success: false,
        error: 'Failed to call agent',
        message: generationError instanceof Error ? generationError.message : 'Unknown error',
        response_time_ms: responseTimeMs,
        agentId,
        action,
        sessionId,
        identity: identityPayload,
        timestamp: new Date().toISOString()
      });
    }

    const responseTimeMs = Date.now() - startedAt;

    res.json({
      success: true,
      result,
      response_time_ms: responseTimeMs,
      agentId,
      action,
      sessionId,
      identity: {
        ...identityPayload
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error(`Failed to call agent ${req.params.agentId}:`, error instanceof Error ? error.message : String(error));

    const responseTimeMs = typeof (req as any)?._startedAt === 'number'
      ? Date.now() - (req as any)._startedAt
      : undefined;

    const safeAgentIdRaw = typeof req.params?.agentId === 'string' ? req.params.agentId : null;
    const safeAgentId = safeAgentIdRaw && safeAgentIdRaw.trim() ? safeAgentIdRaw.trim() : null;

    const body: any = (req as any).body || {};
    const safeAction = typeof body.action === 'string' ? body.action : null;
    const safePayload = body.payload && typeof body.payload === 'object' ? body.payload : null;

    const requestedSessionId =
      (typeof body.sessionId === 'string' ? body.sessionId : null) ||
      (typeof safePayload?.sessionId === 'string' ? safePayload.sessionId : null);
    const safeSessionId = requestedSessionId && requestedSessionId.trim() ? requestedSessionId.trim() : null;

    res.status(500).json({
      success: false,
      error: 'Failed to call agent',
      message: error instanceof Error ? error.message : 'Unknown error',
      response_time_ms: responseTimeMs,
      agentId: safeAgentId,
      action: safeAction,
      sessionId: safeSessionId,
      identity: {
        system_identity: systemIdentitySummary,
        agent: {
          id: safeAgentId ? Number(safeAgentId) : null
        }
      },
      timestamp: new Date().toISOString()
    });
    return;
  }
});

export default router;

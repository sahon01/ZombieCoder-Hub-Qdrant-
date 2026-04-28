import express from 'express';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';
import { applyGuardrailsToSystemPrompt, ZOMBIECODER_GUARDRAILS_VERSION } from '../utils/ethics';
import { chromaManager } from '../services/chromaManager';
import { qdrantManager } from '../services/qdrantManager';
import { publicGateway } from '../services/publicGateway';

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

router.get('/services', requireApiKey, async (req, res) => {
  try {
    res.json({
      success: true,
      services: {
        chroma: chromaManager.getStatus(),
        qdrant: qdrantManager.getStatus(),
        publicGateway: publicGateway.getStatus()
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to get services status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get services status',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/qdrant/start', requireApiKey, async (req, res) => {
  try {
    await qdrantManager.startIfNeeded();
    res.json({
      success: true,
      message: 'Qdrant start attempted',
      qdrant: qdrantManager.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to start qdrant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start qdrant',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/qdrant/stop', requireApiKey, async (req, res) => {
  try {
    qdrantManager.stop();
    res.json({
      success: true,
      message: 'Qdrant stop requested',
      qdrant: qdrantManager.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to stop qdrant:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop qdrant',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/chroma/start', requireApiKey, async (req, res) => {
  try {
    await chromaManager.startIfNeeded();
    res.json({
      success: true,
      message: 'Chroma start attempted',
      chroma: chromaManager.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to start chroma:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to start chroma',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/chroma/stop', requireApiKey, async (req, res) => {
  try {
    chromaManager.stop();
    res.json({
      success: true,
      message: 'Chroma stop requested',
      chroma: chromaManager.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to stop chroma:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to stop chroma',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/chroma/reload', requireApiKey, async (req, res) => {
  try {
    chromaManager.reloadFromEnv();
    res.json({
      success: true,
      message: 'Chroma manager config reloaded from env',
      chroma: chromaManager.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to reload chroma config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reload chroma config',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/services/public-gateway/reload', requireApiKey, async (req, res) => {
  try {
    publicGateway.reloadFromEnv();
    res.json({
      success: true,
      message: 'Public gateway config reloaded from env',
      publicGateway: publicGateway.getStatus(),
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to reload public gateway config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reload public gateway config',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

async function getSystemSetting(key: string): Promise<string | null> {
  const rows = await executeQuery(
    'SELECT setting_value FROM system_settings WHERE setting_key = ? LIMIT 1',
    [key]
  );
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return (rows[0] as any).setting_value ?? null;
}

async function upsertSystemSetting(key: string, value: string, type: 'string' | 'integer' | 'boolean' | 'json' = 'string') {
  await executeQuery(
    `INSERT INTO system_settings (setting_key, setting_value, setting_type)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), setting_type = VALUES(setting_type), updated_at = CURRENT_TIMESTAMP`,
    [key, value, type]
  );
}

async function getSystemSettingInt(key: string): Promise<number | null> {
  const raw = await getSystemSetting(key);
  if (raw == null) return null;
  const v = parseInt(String(raw), 10);
  return Number.isFinite(v) ? v : null;
}

async function getSystemSettingBool(key: string): Promise<boolean | null> {
  const raw = await getSystemSetting(key);
  if (raw == null) return null;
  const normalized = String(raw).trim().toLowerCase();
  if (!normalized) return null;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return null;
}

// Get default model
router.get('/default-model', async (req, res) => {
  try {
    const dbValue = await getSystemSetting('default_model');
    const envValue = process.env.OLLAMA_DEFAULT_MODEL || null;

    res.json({
      success: true,
      defaultModel: dbValue || envValue || null,
      sources: {
        database: dbValue,
        env: envValue
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to get default model setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get default model setting',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

// Update default model
router.put('/default-model', requireApiKey, async (req, res) => {
  try {
    const { model } = req.body;

    if (!model || typeof model !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'model is required and must be a string',
        timestamp: new Date().toISOString()
      });
    }

    await upsertSystemSetting('default_model', model, 'string');

    res.json({
      success: true,
      message: 'Default model updated successfully',
      defaultModel: model,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to update default model setting:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update default model setting',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

// Update agent persona/system prompt (stored in agents.metadata.system_prompt)
router.put('/agents/:agentId/persona', requireApiKey, async (req, res) => {
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

    const { persona_name, system_prompt } = req.body;

    const agentRows = await executeQuery('SELECT id, metadata FROM agents WHERE id = ? LIMIT 1', [numericId]);
    if (!Array.isArray(agentRows) || agentRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Agent not found',
        agentId: numericId,
        timestamp: new Date().toISOString()
      });
    }

    let metadata: Record<string, any> = {};
    const existingMetadata = (agentRows[0] as any).metadata;
    if (existingMetadata) {
      metadata = typeof existingMetadata === 'string' ? JSON.parse(existingMetadata) : existingMetadata;
    }

    if (typeof system_prompt === 'string') {
      metadata.system_prompt = applyGuardrailsToSystemPrompt(system_prompt);
      metadata.guardrails_version = ZOMBIECODER_GUARDRAILS_VERSION;
    }

    await executeQuery(
      `UPDATE agents
       SET persona_name = COALESCE(?, persona_name),
           metadata = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [typeof persona_name === 'string' ? persona_name : null, JSON.stringify(metadata), numericId]
    );

    res.json({
      success: true,
      message: 'Agent persona updated successfully',
      agentId: numericId,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to update agent persona:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update agent persona',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.get('/runtime', async (req, res) => {
  try {
    const [activeProviderId, preferStreaming, timeoutMs] = await Promise.all([
      getSystemSettingInt('active_provider_id'),
      getSystemSettingBool('prefer_streaming'),
      getSystemSettingInt('model_request_timeout_ms')
    ]);

    res.json({
      success: true,
      runtime: {
        active_provider_id: activeProviderId,
        prefer_streaming: preferStreaming,
        model_request_timeout_ms: timeoutMs
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to get runtime settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get runtime settings',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.put('/runtime', requireApiKey, async (req, res) => {
  try {
    const { active_provider_id, prefer_streaming, model_request_timeout_ms } = req.body || {};

    if (active_provider_id !== undefined) {
      const numeric = typeof active_provider_id === 'number'
        ? active_provider_id
        : parseInt(String(active_provider_id), 10);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        return res.status(400).json({
          success: false,
          error: 'active_provider_id must be a positive integer',
          timestamp: new Date().toISOString()
        });
      }
      await upsertSystemSetting('active_provider_id', String(numeric), 'integer');
    }

    if (prefer_streaming !== undefined) {
      if (typeof prefer_streaming !== 'boolean') {
        return res.status(400).json({
          success: false,
          error: 'prefer_streaming must be a boolean',
          timestamp: new Date().toISOString()
        });
      }
      await upsertSystemSetting('prefer_streaming', prefer_streaming ? 'true' : 'false', 'boolean');
    }

    if (model_request_timeout_ms !== undefined) {
      const numeric = typeof model_request_timeout_ms === 'number'
        ? model_request_timeout_ms
        : parseInt(String(model_request_timeout_ms), 10);
      if (!Number.isFinite(numeric) || numeric < 1000) {
        return res.status(400).json({
          success: false,
          error: 'model_request_timeout_ms must be an integer >= 1000',
          timestamp: new Date().toISOString()
        });
      }
      await upsertSystemSetting('model_request_timeout_ms', String(numeric), 'integer');
    }

    const [activeProviderId, preferStreaming, timeoutMs] = await Promise.all([
      getSystemSettingInt('active_provider_id'),
      getSystemSettingBool('prefer_streaming'),
      getSystemSettingInt('model_request_timeout_ms')
    ]);

    res.json({
      success: true,
      message: 'Runtime settings updated successfully',
      runtime: {
        active_provider_id: activeProviderId,
        prefer_streaming: preferStreaming,
        model_request_timeout_ms: timeoutMs
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to update runtime settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update runtime settings',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

export default router;

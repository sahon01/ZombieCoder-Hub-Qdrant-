import express from 'express';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';
import { applyGuardrailsToPromptTemplate, ZOMBIECODER_GUARDRAILS_VERSION } from '../utils/ethics';

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

router.get('/', async (req, res) => {
  try {
    const rows = await executeQuery(
      `SELECT id, name, description, template_content, variables, created_at, updated_at
       FROM prompt_templates
       WHERE is_active = TRUE
       ORDER BY updated_at DESC, id DESC`
    );

    const templates = Array.isArray(rows)
      ? (rows as any[]).map(r => ({
        id: String(r.id),
        name: r.name,
        description: r.description,
        template: r.template_content,
        variables: r.variables ? (typeof r.variables === 'string' ? JSON.parse(r.variables) : r.variables) : [],
        createdAt: r.created_at,
        updatedAt: r.updated_at
      }))
      : [];

    res.json(templates);
    return;
  } catch (error) {
    logger.error('Failed to list prompt templates:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list prompt templates',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.post('/', requireApiKey, async (req, res) => {
  try {
    const { name, description, template, variables, agent_id } = req.body;

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ success: false, error: 'name is required', timestamp: new Date().toISOString() });
    }
    if (!template || typeof template !== 'string') {
      return res.status(400).json({ success: false, error: 'template is required', timestamp: new Date().toISOString() });
    }

    const varsJson = Array.isArray(variables) ? JSON.stringify(variables) : null;
    const templateWithGuardrails = applyGuardrailsToPromptTemplate(template);
    const metadataJson = JSON.stringify({ guardrails_version: ZOMBIECODER_GUARDRAILS_VERSION });

    const result = await executeQuery(
      `INSERT INTO prompt_templates (name, description, template_content, variables, agent_id, is_active, metadata)
       VALUES (?, ?, ?, ?, ?, TRUE, ?)`,
      [
        name,
        typeof description === 'string' ? description : null,
        templateWithGuardrails,
        varsJson,
        typeof agent_id === 'number' ? agent_id : null,
        metadataJson
      ]
    );

    res.status(201).json({
      success: true,
      id: (result as any)?.insertId,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to create prompt template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create prompt template',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.put('/:id', requireApiKey, async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ success: false, error: 'id must be numeric', timestamp: new Date().toISOString() });
    }

    const { name, description, template, variables, is_active } = req.body;

    const varsJson = Array.isArray(variables) ? JSON.stringify(variables) : null;

    const templateWithGuardrails = typeof template === 'string' ? applyGuardrailsToPromptTemplate(template) : null;
    const metadataJson = JSON.stringify({ guardrails_version: ZOMBIECODER_GUARDRAILS_VERSION });

    await executeQuery(
      `UPDATE prompt_templates
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           template_content = COALESCE(?, template_content),
           variables = COALESCE(?, variables),
           is_active = COALESCE(?, is_active),
           metadata = COALESCE(?, metadata),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        typeof name === 'string' ? name : null,
        typeof description === 'string' ? description : null,
        templateWithGuardrails,
        varsJson,
        typeof is_active === 'boolean' ? is_active : null,
        metadataJson,
        numericId
      ]
    );

    res.json({ success: true, id: numericId, timestamp: new Date().toISOString() });
    return;
  } catch (error) {
    logger.error('Failed to update prompt template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update prompt template',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.delete('/:id', requireApiKey, async (req, res) => {
  try {
    const numericId = parseInt(req.params.id, 10);
    if (Number.isNaN(numericId)) {
      return res.status(400).json({ success: false, error: 'id must be numeric', timestamp: new Date().toISOString() });
    }

    await executeQuery(
      `UPDATE prompt_templates
       SET is_active = FALSE,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [numericId]
    );

    res.json({ success: true, id: numericId, timestamp: new Date().toISOString() });
    return;
  } catch (error) {
    logger.error('Failed to delete prompt template:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete prompt template',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

export default router;

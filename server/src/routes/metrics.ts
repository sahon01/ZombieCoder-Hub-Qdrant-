import express from 'express';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';

const router = express.Router();
const logger = new Logger();

type Range = 'today' | '7d' | '30d';

function parseRange(value: unknown): Range {
  if (value === 'today' || value === '7d' || value === '30d') return value;
  return 'today';
}

function rangeToSql(range: Range): { whereSql: string; params: any[] } {
  switch (range) {
    case '7d':
      return { whereSql: 'created_at >= (NOW() - INTERVAL 7 DAY)', params: [] };
    case '30d':
      return { whereSql: 'created_at >= (NOW() - INTERVAL 30 DAY)', params: [] };
    case 'today':
    default:
      return { whereSql: 'created_at >= CURDATE()', params: [] };
  }
}

router.get('/summary', async (req, res) => {
  try {
    const range = parseRange(req.query.range);
    const { whereSql, params } = rangeToSql(range);

    const rows = await executeQuery(
      `SELECT
        COUNT(*) AS total_requests,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS total_errors,
        ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms
       FROM api_audit_logs
       WHERE ${whereSql}`,
      params
    );

    const first = Array.isArray(rows) && rows.length > 0 ? (rows[0] as any) : {};

    res.json({
      success: true,
      range,
      summary: {
        total_requests: Number(first.total_requests || 0),
        total_errors: Number(first.total_errors || 0),
        avg_response_time_ms: Number(first.avg_response_time_ms || 0)
      },
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to load metrics summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load metrics summary',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

router.get('/agents', async (req, res) => {
  try {
    const range = parseRange(req.query.range);
    const { whereSql, params } = rangeToSql(range);

    // Extract agentId from endpoints like:
    // - /agents/123/call (preferred)
    // - /123/call (legacy rows from earlier audit capture)
    const rows = await executeQuery(
      `SELECT
        CAST(
          CASE
            WHEN endpoint REGEXP '^/agents/[0-9]+/call$' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '/', 3), '/', -1)
            WHEN endpoint REGEXP '^/[0-9]+/call$' THEN SUBSTRING_INDEX(SUBSTRING_INDEX(endpoint, '/', 2), '/', -1)
            ELSE NULL
          END AS UNSIGNED
        ) AS agent_id,
        COUNT(*) AS call_count,
        SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END) AS error_count,
        ROUND(AVG(response_time_ms), 2) AS avg_response_time_ms
       FROM api_audit_logs
       WHERE ${whereSql}
         AND (
           endpoint REGEXP '^/agents/[0-9]+/call$'
           OR endpoint REGEXP '^/[0-9]+/call$'
         )
       GROUP BY agent_id
       ORDER BY call_count DESC`,
      params
    );

    const agentIds = Array.isArray(rows) ? rows.map((r: any) => Number(r.agent_id)).filter((n: number) => Number.isFinite(n)) : [];

    let namesById: Record<number, string> = {};
    if (agentIds.length > 0) {
      const placeholders = agentIds.map(() => '?').join(',');
      const nameRows = await executeQuery(
        `SELECT id, name FROM agents WHERE id IN (${placeholders})`,
        agentIds
      );
      if (Array.isArray(nameRows)) {
        for (const r of nameRows as any[]) {
          namesById[Number(r.id)] = String(r.name);
        }
      }
    }

    const agents = Array.isArray(rows)
      ? (rows as any[]).map(r => ({
        agent_id: Number(r.agent_id),
        agent_name: namesById[Number(r.agent_id)] || null,
        call_count: Number(r.call_count || 0),
        error_count: Number(r.error_count || 0),
        avg_response_time_ms: Number(r.avg_response_time_ms || 0)
      }))
      : [];

    res.json({
      success: true,
      range,
      agents,
      timestamp: new Date().toISOString()
    });
    return;
  } catch (error) {
    logger.error('Failed to load agent metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load agent metrics',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
    return;
  }
});

export default router;

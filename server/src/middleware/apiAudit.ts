import { type NextFunction, type Request, type Response } from 'express';
import { executeQuery } from '../database/connection';
import { Logger } from '../utils/logger';

const logger = new Logger();

function safeString(value: unknown, maxLen: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
}

export function apiAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', async () => {
    const responseTimeMs = Date.now() - start;

    const endpoint = safeString(String(req.originalUrl || req.path).split('?')[0], 255);
    const method = safeString(req.method, 10);
    const userIp = safeString(req.ip, 45);

    const userAgent = safeString(req.get('User-Agent'), 500);
    const apiKeyPresent = Boolean(req.get('X-API-Key'));

    const metadata = {
      userAgent,
      apiKeyPresent
    };

    try {
      await executeQuery(
        `INSERT INTO api_audit_logs (endpoint, method, status_code, response_time_ms, user_ip, metadata)
         VALUES (?, ?, ?, ?, ?, ?)` ,
        [endpoint, method, res.statusCode, responseTimeMs, userIp, JSON.stringify(metadata)]
      );
    } catch (error) {
      // Never block requests because auditing failed
      logger.warn('Failed to write api_audit_logs row', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  next();
}

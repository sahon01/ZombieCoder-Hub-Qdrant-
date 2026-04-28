import express from 'express';
import http, { IncomingMessage } from 'http';
import https from 'https';
import { URL } from 'url';
import { Logger } from '../utils/logger';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

export type PublicGatewayRoute = {
  host: string;
  target: string;
};

export type PublicGatewayStatus = {
  enabled: boolean;
  tunnelId: string | null;
  port: number;
  isListening: boolean;
  publicActive: boolean;
  configError: string | null;
  routes: Array<{ host: string; target: string }>;
};

type PublicGatewayConfig = {
  enabled: boolean;
  port: number;
  routes: PublicGatewayRoute[];
  requireEnv: string[];
  tunnelId: string | null;
};

export class PublicGateway {
  private logger = new Logger();
  private app = express();
  private server: http.Server | null = null;

  private cfg: PublicGatewayConfig;
  private configError: string | null = null;

  constructor() {
    this.cfg = this.loadMergedConfig();
    this.setupRoutes();
  }

  private envBool(key: string, fallback = false): boolean {
    const raw = String(process.env[key] ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  private envNumber(key: string, fallback: number): number {
    const raw = String(process.env[key] ?? '').trim();
    if (!raw) return fallback;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : fallback;
  }

  private loadFromEnv(): PublicGatewayConfig {
    const enabled = this.envBool('PUBLIC_GATEWAY_ENABLED', false);
    const port = this.envNumber('PUBLIC_GATEWAY_PORT', 9000);

    const tunnelId = String(process.env.CLOUDFLARE_TUNNEL_ID || '').trim() || null;

    const requireEnvRaw = String(process.env.PUBLIC_GATEWAY_REQUIRE_ENV || '').trim();
    const requireEnv = requireEnvRaw
      ? requireEnvRaw.split(',').map(s => s.trim()).filter(Boolean)
      : [];

    const routesJson = String(process.env.PUBLIC_GATEWAY_ROUTES || '').trim();
    let routes: PublicGatewayRoute[] = [];

    if (routesJson) {
      try {
        const parsed = JSON.parse(routesJson);
        if (Array.isArray(parsed)) {
          routes = parsed
            .filter(Boolean)
            .map((r: any) => ({
              host: String(r.host || '').trim().toLowerCase(),
              target: String(r.target || '').trim()
            }))
            .filter(r => r.host && r.target);
        }
      } catch {
        routes = [];
      }
    }

    return { enabled, port, routes, requireEnv, tunnelId };
  }

  private getConfigFilePath(): string {
    const p = String(process.env.PUBLIC_GATEWAY_CONFIG_PATH || '').trim();
    if (p) return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    return path.resolve(process.cwd(), 'config', 'cloudflared.yml');
  }

  private loadFromConfigFile(): { tunnelId: string | null; routes: PublicGatewayRoute[] } {
    const filePath = this.getConfigFilePath();
    try {
      if (!fs.existsSync(filePath)) return { tunnelId: null, routes: [] };
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed: any = yaml.load(raw);

      const tunnelId = parsed && typeof parsed.tunnel === 'string' ? String(parsed.tunnel).trim() : null;

      const routes: PublicGatewayRoute[] = [];
      const ingress = parsed?.ingress;
      if (Array.isArray(ingress)) {
        for (const r of ingress) {
          const host = String(r?.hostname || '').trim().toLowerCase();
          const target = String(r?.service || '').trim();
          if (!host || !target) continue;

          // cloudflared supports 'http_status:404' catch-all ingress; ignore it
          if (target.toLowerCase().startsWith('http_status:')) continue;

          routes.push({ host, target });
        }
      }

      const byHost = new Map<string, PublicGatewayRoute>();
      for (const r of routes) byHost.set(r.host, r);
      return { tunnelId, routes: [...byHost.values()] };
    } catch {
      return { tunnelId: null, routes: [] };
    }
  }

  private loadMergedConfig(): PublicGatewayConfig {
    const envCfg = this.loadFromEnv();
    const fileCfg = this.loadFromConfigFile();

    // Env overrides file config when provided (so ops can hotfix via env).
    const mergedRoutes = envCfg.routes.length > 0 ? envCfg.routes : fileCfg.routes;
    const mergedTunnelId = envCfg.tunnelId || fileCfg.tunnelId;

    return {
      ...envCfg,
      tunnelId: mergedTunnelId,
      routes: mergedRoutes
    };
  }

  private isPublicActive(): { ok: boolean; error: string | null } {
    if (!this.cfg.enabled) return { ok: false, error: 'PUBLIC_GATEWAY_ENABLED is false' };
    if (!this.cfg.tunnelId) return { ok: false, error: 'CLOUDFLARE_TUNNEL_ID is missing' };
    if (!Array.isArray(this.cfg.routes) || this.cfg.routes.length === 0) {
      return { ok: false, error: 'PUBLIC_GATEWAY_ROUTES is missing/empty' };
    }

    for (const key of this.cfg.requireEnv) {
      if (key === 'CLOUDFLARE_TUNNEL_ID' && this.cfg.tunnelId) continue;
      const v = String(process.env[key] ?? '').trim();
      if (!v) {
        return { ok: false, error: `Missing required env: ${key}` };
      }
    }

    return { ok: true, error: null };
  }

  private getRouteForHost(hostHeader: string | undefined): PublicGatewayRoute | null {
    const raw = String(hostHeader || '').trim().toLowerCase();
    const host = raw.includes(':') ? raw.split(':')[0] : raw;
    if (!host) return null;

    return this.cfg.routes.find(r => r.host === host) || null;
  }

  private async proxyRequest(req: express.Request, res: express.Response, route: PublicGatewayRoute): Promise<void> {
    const targetUrl = new URL(route.target);
    const isHttps = targetUrl.protocol === 'https:';

    const outgoingHeaders: Record<string, any> = { ...req.headers };
    // Ensure upstream Host header is correct
    outgoingHeaders.host = targetUrl.host;

    const options: http.RequestOptions = {
      protocol: targetUrl.protocol,
      hostname: targetUrl.hostname,
      port: targetUrl.port ? parseInt(targetUrl.port, 10) : (isHttps ? 443 : 80),
      method: req.method,
      path: `${targetUrl.pathname.replace(/\/+$/, '')}${req.originalUrl}`,
      headers: outgoingHeaders
    };

    const client = isHttps ? https : http;

    await new Promise<void>((resolve) => {
      const upstream = client.request(options, (upRes: IncomingMessage) => {
        res.status(upRes.statusCode || 502);

        for (const [k, v] of Object.entries(upRes.headers)) {
          if (v === undefined) continue;
          try {
            res.setHeader(k, v as any);
          } catch {
          }
        }

        upRes.pipe(res);
        upRes.on('end', () => resolve());
      });

      upstream.on('error', (err) => {
        this.logger.warn('Public gateway upstream error', { host: route.host, target: route.target, error: err?.message || String(err) });
        if (!res.headersSent) {
          res.status(502).json({
            success: false,
            error: 'Bad Gateway',
            message: 'Upstream is not reachable',
            target: route.target,
            timestamp: new Date().toISOString()
          });
        } else {
          try { res.end(); } catch { }
        }
        resolve();
      });

      if (req.readable) {
        req.pipe(upstream);
      } else {
        upstream.end();
      }
    });
  }

  private setupRoutes(): void {
    this.app.get('/health', (req, res) => {
      const s = this.getStatus();
      res.status(200).json({
        status: 'ok',
        gateway: s,
        timestamp: new Date().toISOString()
      });
    });

    this.app.get('/status', (req, res) => {
      res.json({ success: true, gateway: this.getStatus(), timestamp: new Date().toISOString() });
    });

    this.app.use(async (req, res) => {
      const active = this.isPublicActive();
      if (!active.ok) {
        res.status(503).json({
          success: false,
          error: 'Public gateway disabled',
          message: active.error,
          timestamp: new Date().toISOString()
        });
        return;
      }

      const route = this.getRouteForHost(req.headers.host);
      if (!route) {
        res.status(404).json({
          success: false,
          error: 'No route configured for host',
          host: req.headers.host || null,
          timestamp: new Date().toISOString()
        });
        return;
      }

      await this.proxyRequest(req, res, route);
    });
  }

  async start(): Promise<void> {
    if (this.server) return;

    this.server = http.createServer(this.app);
    await new Promise<void>((resolve) => {
      this.server!.listen(this.cfg.port, () => resolve());
    });

    const active = this.isPublicActive();
    this.configError = active.ok ? null : active.error;

    this.logger.info('Public gateway server listening', {
      port: this.cfg.port,
      enabled: this.cfg.enabled,
      publicActive: active.ok,
      configError: active.error,
      routes: this.cfg.routes
    });
  }

  stop(): void {
    if (!this.server) return;
    try {
      this.server.close();
    } catch {
    } finally {
      this.server = null;
    }
  }

  reloadFromEnv(): void {
    this.cfg = this.loadMergedConfig();
    const active = this.isPublicActive();
    this.configError = active.ok ? null : active.error;
  }

  getStatus(): PublicGatewayStatus {
    const active = this.isPublicActive();
    return {
      enabled: this.cfg.enabled,
      tunnelId: this.cfg.tunnelId,
      port: this.cfg.port,
      isListening: Boolean(this.server),
      publicActive: active.ok,
      configError: active.ok ? null : active.error,
      routes: this.cfg.routes.map(r => ({ host: r.host, target: r.target }))
    };
  }
}

export const publicGateway = new PublicGateway();

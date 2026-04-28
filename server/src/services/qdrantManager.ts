import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { Logger } from '../utils/logger';

export type QdrantManagerStatus = {
  enabled: boolean;
  managed: boolean;
  url: string;
  isRunning: boolean;
  pid: number | null;
  lastHealthAt: string | null;
  lastError: string | null;
  lastStartAttemptAt: string | null;
  command: string | null;
};

type QdrantManagerConfig = {
  enabled: boolean;
  managed: boolean;
  url: string;
  host: string;
  port: number;
  command: string[];
  healthPath: string;
};

export class QdrantManager {
  private logger = new Logger();
  private proc: ChildProcessWithoutNullStreams | null = null;
  private cfg: QdrantManagerConfig;

  private lastHealthAt: string | null = null;
  private lastError: string | null = null;
  private lastStartAttemptAt: string | null = null;

  constructor() {
    this.cfg = this.loadFromEnv();
  }

  private resolveFromRepoRoot(rel: string): string {
    // Works whether server is started from repo root or from ./server
    const rootCandidate = process.cwd();
    const a = path.resolve(rootCandidate, rel);
    if (fs.existsSync(a)) return a;
    const b = path.resolve(rootCandidate, '..', rel);
    return b;
  }

  private detectBundledBinary(): string | null {
    const candidates = [
      this.resolveFromRepoRoot('server/bin/qdrant/qdrant'),
      this.resolveFromRepoRoot('server/bin/qdrant/qdrant.exe')
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) return c;
    }
    return null;
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

  private loadFromEnv(): QdrantManagerConfig {
    const enabled = this.envBool('RAG_ENABLED', false);
    const vectorBackend = String(process.env.RAG_VECTOR_BACKEND || 'pgvector').trim().toLowerCase();

    const host = String(process.env.QDRANT_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const port = this.envNumber('QDRANT_PORT', 6333);
    const url = String(process.env.QDRANT_URL || `http://${host}:${port}`).trim() || `http://${host}:${port}`;

    const managedDefault = enabled && vectorBackend === 'qdrant';
    const managed = this.envBool('QDRANT_MANAGED', managedDefault);

    // If user doesn't specify a runner command, we try to run the bundled binary (if present),
    // otherwise fall back to `qdrant` from PATH.
    const cmdRaw = String(process.env.QDRANT_RUNNER_CMD || '').trim();
    let command: string[];
    if (cmdRaw) {
      command = cmdRaw.split(' ').map(s => s.trim()).filter(Boolean);
    } else {
      const bundled = this.detectBundledBinary();
      const configPath = this.resolveFromRepoRoot('server/config/qdrant.yaml');
      command = bundled
        ? [bundled, '--config-path', configPath]
        : ['qdrant', '--config-path', configPath];
    }

    const healthPath = String(process.env.QDRANT_HEALTH_PATH || '/healthz').trim() || '/healthz';

    return {
      enabled: enabled && vectorBackend === 'qdrant',
      managed,
      url,
      host,
      port,
      command,
      healthPath
    };
  }

  reloadFromEnv(): void {
    this.cfg = this.loadFromEnv();
  }

  getStatus(): QdrantManagerStatus {
    return {
      enabled: this.cfg.enabled,
      managed: this.cfg.managed,
      url: this.cfg.url,
      isRunning: Boolean(this.proc) || Boolean(this.lastHealthAt),
      pid: this.proc?.pid ?? null,
      lastHealthAt: this.lastHealthAt,
      lastError: this.lastError,
      lastStartAttemptAt: this.lastStartAttemptAt,
      command: this.cfg.command.length ? this.cfg.command.join(' ') : null
    };
  }

  private async isHealthy(timeoutMs = 900): Promise<boolean> {
    try {
      const base = this.cfg.url.replace(/\/+$/, '');
      const path = this.cfg.healthPath.startsWith('/') ? this.cfg.healthPath : `/${this.cfg.healthPath}`;
      const resp = await axios.get(`${base}${path}`, {
        timeout: timeoutMs,
        validateStatus: () => true,
        headers: { Accept: 'application/json' }
      });
      const ok = resp.status >= 200 && resp.status < 300;
      if (ok) this.lastHealthAt = new Date().toISOString();
      return ok;
    } catch {
      return false;
    }
  }

  async startIfNeeded(): Promise<void> {
    if (!this.cfg.enabled) return;

    if (await this.isHealthy(900)) {
      this.lastError = null;
      return;
    }

    if (!this.cfg.managed) {
      this.lastError = `Qdrant is not reachable at ${this.cfg.url}. Set QDRANT_MANAGED=true to auto-start it, or start Qdrant separately.`;
      this.logger.warn(this.lastError);
      return;
    }

    if (this.proc) return;

    this.lastStartAttemptAt = new Date().toISOString();
    this.logger.info('Starting managed Qdrant process', {
      url: this.cfg.url,
      command: this.cfg.command.join(' ')
    });

    const [bin, ...args] = this.cfg.command;
    this.proc = spawn(bin, args, {
      stdio: 'pipe',
      env: process.env,
      cwd: process.cwd()
    });

    this.proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString('utf8').trim();
      if (line) this.logger.info(`[qdrant] ${line}`);
    });

    this.proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString('utf8').trim();
      if (line) this.logger.warn(`[qdrant] ${line}`);
    });

    this.proc.on('exit', (code) => {
      this.logger.warn('Qdrant process exited', { code });
      this.proc = null;
    });

    const maxWaitMs = 25000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.isHealthy(1100)) {
        this.lastError = null;
        this.logger.info('Qdrant is healthy');
        return;
      }
      await new Promise(r => setTimeout(r, 800));
    }

    this.lastError = `Qdrant did not become healthy within ${maxWaitMs}ms (${this.cfg.url})`;
    this.logger.warn(this.lastError);
  }

  stop(): void {
    if (!this.proc) return;
    try {
      this.proc.kill();
    } catch {
    } finally {
      this.proc = null;
    }
  }
}

export const qdrantManager = new QdrantManager();

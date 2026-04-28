import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import axios from 'axios';
import { Logger } from '../utils/logger';
import path from 'path';
import fs from 'fs';

export type ChromaManagerStatus = {
  enabled: boolean;
  managed: boolean;
  url: string;
  isRunning: boolean;
  pid: number | null;
  lastHealthAt: string | null;
  lastError: string | null;
  lastStartAttemptAt: string | null;
  command: string | null;
  bootstrapEnabled: boolean;
  bootstrapVenvPath: string | null;
  lastBootstrapAt: string | null;
  lastBootstrapError: string | null;
};

type ChromaManagerConfig = {
  enabled: boolean;
  managed: boolean;
  url: string;
  host: string;
  port: number;
  persistPath: string | null;
  command: string[];
  healthPath: string;
  bootstrapEnabled: boolean;
  bootstrapVenvPath: string;
};

export class ChromaManager {
  private logger = new Logger();
  private proc: ChildProcessWithoutNullStreams | null = null;
  private cfg: ChromaManagerConfig;

  private lastHealthAt: string | null = null;
  private lastError: string | null = null;
  private lastStartAttemptAt: string | null = null;
  private lastBootstrapAt: string | null = null;
  private lastBootstrapError: string | null = null;
  private bootstrapped = false;

  constructor() {
    this.cfg = this.loadFromEnv();
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

  private loadFromEnv(): ChromaManagerConfig {
    const enabled = this.envBool('RAG_ENABLED', false);
    const vectorBackend = String(process.env.RAG_VECTOR_BACKEND || 'pgvector').trim().toLowerCase();

    const url = String(process.env.CHROMA_URL || 'http://127.0.0.1:8001').trim() || 'http://127.0.0.1:8001';
    const host = String(process.env.CHROMA_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const port = this.envNumber('CHROMA_PORT', 8001);

    const managedDefault = enabled && vectorBackend === 'chroma';
    const managed = this.envBool('CHROMA_MANAGED', managedDefault);
    const persistPath = String(process.env.CHROMA_PERSIST_PATH || '').trim() || null;

    const healthPath = String(process.env.CHROMA_HEALTH_PATH || '/api/v1/heartbeat').trim() || '/api/v1/heartbeat';

    const cmdRaw = String(process.env.CHROMA_RUNNER_CMD || '').trim();

    // Default runner strategy:
    // - Windows x64: use Python chromadb server (Node chromadb CLI currently rejects win32 x64).
    // - Others: use Node chromadb CLI (bundled in node_modules) to avoid requiring Python.
    const isWindowsX64 = process.platform === 'win32' && process.arch === 'x64';

    const defaultCmd = (() => {
      if (isWindowsX64) {
        return ['python', '-m', 'uvicorn', 'chromadb.app:app', '--host', host, '--port', String(port)];
      }

      // Equivalent to: npx chroma run --host ... --port ...
      const cliPath = path.resolve(process.cwd(), 'node_modules', 'chromadb', 'dist', 'cli.mjs');
      return [process.execPath, cliPath, 'run', '--host', host, '--port', String(port)];
    })();

    const command = cmdRaw
      ? cmdRaw.split(' ').map(s => s.trim()).filter(Boolean)
      : defaultCmd;

    const withPersist = persistPath
      ? [...command, '--path', persistPath]
      : command;

    const bootstrapEnabled = this.envBool('CHROMA_BOOTSTRAP', false);
    const bootstrapVenvPathRaw = String(process.env.CHROMA_BOOTSTRAP_VENV || '.chroma_venv').trim() || '.chroma_venv';
    const bootstrapVenvPath = path.isAbsolute(bootstrapVenvPathRaw)
      ? bootstrapVenvPathRaw
      : path.resolve(process.cwd(), bootstrapVenvPathRaw);

    return {
      enabled: enabled && vectorBackend === 'chroma',
      managed,
      url,
      host,
      port,
      persistPath,
      command: withPersist,
      healthPath,
      bootstrapEnabled,
      bootstrapVenvPath
    };
  }

  getStatus(): ChromaManagerStatus {
    return {
      enabled: this.cfg.enabled,
      managed: this.cfg.managed,
      url: this.cfg.url,
      isRunning: Boolean(this.proc),
      pid: this.proc?.pid ?? null,
      lastHealthAt: this.lastHealthAt,
      lastError: this.lastError,
      lastStartAttemptAt: this.lastStartAttemptAt,
      command: this.cfg.command.length ? this.cfg.command.join(' ') : null,
      bootstrapEnabled: this.cfg.bootstrapEnabled,
      bootstrapVenvPath: this.cfg.bootstrapEnabled ? this.cfg.bootstrapVenvPath : null,
      lastBootstrapAt: this.lastBootstrapAt,
      lastBootstrapError: this.lastBootstrapError
    };
  }

  reloadFromEnv(): void {
    this.cfg = this.loadFromEnv();
  }

  private async runAndWait(
    command: string,
    args: string[],
    timeoutMs: number,
    envOverride?: Record<string, string>
  ): Promise<{ code: number | null; stderr: string }> {
    return await new Promise((resolve) => {
      let stderr = '';
      const env = envOverride ? { ...process.env, ...envOverride } : process.env;
      const p = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'], env });
      const timer = setTimeout(() => {
        try { p.kill(); } catch { }
        resolve({ code: null, stderr: stderr || 'timeout' });
      }, timeoutMs);

      p.stderr.on('data', (d: Buffer) => {
        const s = d.toString('utf8');
        if (s) stderr += s;
      });

      p.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, stderr: stderr.trim() });
      });
    });
  }

  private getVenvPythonPath(venvPath: string): string {
    const isWin = process.platform === 'win32';
    return isWin
      ? path.join(venvPath, 'Scripts', 'python.exe')
      : path.join(venvPath, 'bin', 'python');
  }

  private getVenvSitePackagesPath(venvPath: string): string {
    const isWin = process.platform === 'win32';
    return isWin
      ? path.join(venvPath, 'Lib', 'site-packages')
      : path.join(venvPath, 'lib', 'python3', 'site-packages');
  }

  private getSystemPythonCommand(): string {
    return process.platform === 'win32' ? 'python' : 'python3';
  }

  private looksLikeBrokenPip(stderr: string): boolean {
    const s = String(stderr || '');
    return s.includes('pip._vendor.packaging.version.InvalidVersion') || s.includes('InvalidVersion:') || s.includes("Invalid version: '3.12.0'");
  }

  private async ensureBootstrap(): Promise<boolean> {
    if (!this.cfg.bootstrapEnabled) return true;
    if (this.bootstrapped) return true;

    // Only bootstrap when we are going to manage chroma
    if (!this.cfg.enabled || !this.cfg.managed) return true;

    const venvPath = this.cfg.bootstrapVenvPath;
    const venvPython = this.getVenvPythonPath(venvPath);
    const systemPython = this.getSystemPythonCommand();

    const pipSafeEnv: Record<string, string> = {
      PYTHONNOUSERSITE: '1',
      PIP_DISABLE_PIP_VERSION_CHECK: '1',
      PIP_NO_PYTHON_VERSION_WARNING: '1'
    };

    this.lastBootstrapAt = new Date().toISOString();
    this.lastBootstrapError = null;

    // Create venv if missing
    const venvExists = fs.existsSync(venvPython);
    if (!venvExists) {
      this.logger.info('Creating Chroma bootstrap venv', { venvPath });
      const create = await this.runAndWait(systemPython, ['-m', 'venv', venvPath], 10 * 60_000);
      if (create.code !== 0) {
        this.lastBootstrapError = `Failed to create venv: ${create.stderr || 'unknown error'}`;
        this.logger.warn(this.lastBootstrapError);
        return false;
      }
    }

    // Ensure pip is present and not broken in the venv
    // Some Windows Python distributions can create venvs with outdated/broken pip metadata.
    const ensure = await this.runAndWait(venvPython, ['-m', 'ensurepip', '--upgrade'], 5 * 60_000, pipSafeEnv);
    if (ensure.code !== null && ensure.code !== 0) {
      // ignore non-zero; pip may still work, but we log it
      this.logger.warn('ensurepip returned non-zero (continuing)', { stderr: ensure.stderr || null });
    }

    // Upgrade packaging toolchain first (pip's resolver depends on these)
    const toolchain = await this.runAndWait(
      venvPython,
      ['-m', 'pip', 'install', '--upgrade', 'pip==24.2', 'setuptools', 'wheel', 'packaging'],
      10 * 60_000,
      pipSafeEnv
    );
    if (toolchain.code !== 0) {
      if (this.looksLikeBrokenPip(toolchain.stderr)) {
        // Fallback: install chromadb into the venv site-packages using system python's pip.
        const site = this.getVenvSitePackagesPath(venvPath);
        try { fs.mkdirSync(site, { recursive: true }); } catch { }

        this.logger.warn('Venv pip appears broken; falling back to system pip --target install', { venvPath, site });
        const targetInstall = await this.runAndWait(
          systemPython,
          ['-m', 'pip', 'install', '--upgrade', '--target', site, 'chromadb'],
          25 * 60_000,
          pipSafeEnv
        );
        if (targetInstall.code !== 0) {
          this.lastBootstrapError = `system pip --target chromadb install failed: ${targetInstall.stderr || 'unknown error'}`;
          this.logger.warn(this.lastBootstrapError);
          return false;
        }

        const postCheck = await this.runAndWait(venvPython, ['-c', 'import chromadb'], 60_000, pipSafeEnv);
        if (postCheck.code === 0) {
          this.bootstrapped = true;
          const cmdRaw = String(process.env.CHROMA_RUNNER_CMD || '').trim();
          if (!cmdRaw) {
            const host = this.cfg.host;
            const port = this.cfg.port;
            const baseCmd = [venvPython, '-m', 'uvicorn', 'chromadb.app:app', '--host', host, '--port', String(port)];
            this.cfg.command = this.cfg.persistPath ? [...baseCmd, '--path', this.cfg.persistPath] : baseCmd;
          }
          return true;
        }

        this.lastBootstrapError = 'system pip --target install succeeded but chromadb import still failed in venv';
        this.logger.warn(this.lastBootstrapError);
        return false;
      }

      this.lastBootstrapError = `pip toolchain upgrade failed: ${toolchain.stderr || 'unknown error'}`;
      this.logger.warn(this.lastBootstrapError);
      return false;
    }

    // Check import chromadb
    const check = await this.runAndWait(venvPython, ['-c', 'import chromadb'], 60_000, pipSafeEnv);
    if (check.code === 0) {
      this.bootstrapped = true;

      // Ensure runner uses venv python
      const cmdRaw = String(process.env.CHROMA_RUNNER_CMD || '').trim();
      if (!cmdRaw) {
        const host = this.cfg.host;
        const port = this.cfg.port;
        const baseCmd = [venvPython, '-m', 'uvicorn', 'chromadb.app:app', '--host', host, '--port', String(port)];
        this.cfg.command = this.cfg.persistPath ? [...baseCmd, '--path', this.cfg.persistPath] : baseCmd;
      }

      // Ensure uvicorn import works (chroma server runner)
      const uvCheck = await this.runAndWait(venvPython, ['-c', 'import uvicorn'], 60_000, pipSafeEnv);
      if (uvCheck.code !== 0) {
        const uvInstall = await this.runAndWait(venvPython, ['-m', 'pip', 'install', 'uvicorn'], 10 * 60_000, pipSafeEnv);
        if (uvInstall.code !== 0) {
          this.lastBootstrapError = `uvicorn install failed: ${uvInstall.stderr || 'unknown error'}`;
          this.logger.warn(this.lastBootstrapError);
          return false;
        }
      }

      return true;
    }

    // Install chromadb
    this.logger.info('Installing chromadb into venv', { venvPath });
    const chromaInstall1 = await this.runAndWait(venvPython, ['-m', 'pip', 'install', 'chromadb'], 20 * 60_000, pipSafeEnv);
    if (chromaInstall1.code !== 0) {
      // Retry once without using pip cache
      const chromaInstall2 = await this.runAndWait(venvPython, ['-m', 'pip', 'install', '--no-cache-dir', 'chromadb'], 25 * 60_000, pipSafeEnv);
      if (chromaInstall2.code !== 0) {
        this.lastBootstrapError = `chromadb install failed: ${chromaInstall2.stderr || chromaInstall1.stderr || 'unknown error'}`;
        this.logger.warn(this.lastBootstrapError);
        return false;
      }
    }

    this.bootstrapped = true;

    // If we are using the default python runner, switch it to venv python.
    // If CHROMA_RUNNER_CMD is set, we respect it.
    const cmdRaw = String(process.env.CHROMA_RUNNER_CMD || '').trim();
    if (!cmdRaw) {
      const host = this.cfg.host;
      const port = this.cfg.port;
      const baseCmd = [venvPython, '-m', 'uvicorn', 'chromadb.app:app', '--host', host, '--port', String(port)];
      this.cfg.command = this.cfg.persistPath ? [...baseCmd, '--path', this.cfg.persistPath] : baseCmd;
    }

    return true;
  }

  private async isHealthy(timeoutMs = 1200): Promise<boolean> {
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
    } catch (e) {
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
      this.lastError = `Chroma is not reachable at ${this.cfg.url}. Set CHROMA_MANAGED=true to auto-start it, or start ChromaDB separately.`;
      this.logger.warn(this.lastError);
      return;
    }

    if (this.proc) return;

    const bootOk = await this.ensureBootstrap();
    if (!bootOk) {
      this.lastError = this.lastBootstrapError || 'Chroma bootstrap failed';
      this.logger.warn('Chroma bootstrap failed; not starting managed Chroma process', {
        error: this.lastError,
        venvPath: this.cfg.bootstrapVenvPath
      });
      return;
    }

    this.lastStartAttemptAt = new Date().toISOString();
    this.logger.info('Starting managed ChromaDB process', {
      url: this.cfg.url,
      command: this.cfg.command.join(' ')
    });

    const [bin, ...args] = this.cfg.command;
    this.proc = spawn(bin, args, {
      stdio: 'pipe',
      env: process.env
    });

    this.proc.stdout.on('data', (d: Buffer) => {
      const line = d.toString('utf8').trim();
      if (line) this.logger.info(`[chroma] ${line}`);
    });

    this.proc.stderr.on('data', (d: Buffer) => {
      const line = d.toString('utf8').trim();
      if (line) this.logger.warn(`[chroma] ${line}`);
    });

    this.proc.on('exit', (code) => {
      this.logger.warn('ChromaDB process exited', { code });
      this.proc = null;
    });

    const maxWaitMs = 25000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.isHealthy(1000)) {
        this.lastError = null;
        this.logger.info('ChromaDB is healthy');
        return;
      }
      await new Promise(r => setTimeout(r, 800));
    }

    this.lastError = `ChromaDB did not become healthy within ${maxWaitMs}ms (${this.cfg.url})`;
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

export const chromaManager = new ChromaManager();

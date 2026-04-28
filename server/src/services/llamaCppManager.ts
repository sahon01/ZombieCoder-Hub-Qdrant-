import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import path from 'path';
import axios from 'axios';
import { Logger } from '../utils/logger';

type LlamaCppConfig = {
  enabled: boolean;
  autoStart: boolean;
  binPath: string;
  modelPath: string;
  host: string;
  port: number;
  context: number;
  threads: number;
  extraArgs: string[];
};

export class LlamaCppManager {
  private logger = new Logger();
  private proc: ChildProcessWithoutNullStreams | null = null;
  private cfg: LlamaCppConfig;
  private stdoutBuf = '';
  private stderrBuf = '';

  constructor() {
    this.cfg = this.loadConfigFromEnv();
  }

  get endpoint(): string {
    return `http://${this.cfg.host}:${this.cfg.port}`;
  }

  isEnabled(): boolean {
    return this.cfg.enabled;
  }

  private loadConfigFromEnv(): LlamaCppConfig {
    const enabled = ['1', 'true', 'yes', 'on'].includes(String(process.env.LLAMA_CPP_FALLBACK_ENABLED || '').toLowerCase());
    const autoStart = ['1', 'true', 'yes', 'on'].includes(String(process.env.LLAMA_CPP_AUTO_START || '').toLowerCase());

    const binPathRaw = String(process.env.LLAMA_CPP_BIN_PATH || '').trim();
    const modelPathRaw = String(process.env.LLAMA_CPP_MODEL_PATH || '').trim();

    const host = String(process.env.LLAMA_CPP_HOST || '127.0.0.1').trim() || '127.0.0.1';
    const port = parseInt(String(process.env.LLAMA_CPP_PORT || '15000'), 10);

    const context = parseInt(String(process.env.LLAMA_CPP_CONTEXT || '4096'), 10);
    const threads = parseInt(String(process.env.LLAMA_CPP_THREADS || '4'), 10);

    const extra = String(process.env.LLAMA_CPP_EXTRA_ARGS || '').trim();
    const extraArgs = extra ? extra.split(' ').map(s => s.trim()).filter(Boolean) : [];

    const projectRoot = path.resolve(process.cwd(), '..');

    const binPath = binPathRaw
      ? path.resolve(projectRoot, binPathRaw)
      : path.resolve(projectRoot, 'llama_cpp', 'bin', process.platform === 'win32' ? 'llama-server.exe' : 'llama-server');

    const modelPath = modelPathRaw
      ? path.resolve(projectRoot, modelPathRaw)
      : path.resolve(projectRoot, 'llama_cpp', 'models', 'model.gguf');

    return {
      enabled,
      autoStart,
      binPath,
      modelPath,
      host,
      port: Number.isFinite(port) ? port : 15000,
      context: Number.isFinite(context) && context > 0 ? context : 4096,
      threads: Number.isFinite(threads) && threads > 0 ? threads : 4,
      extraArgs
    };
  }

  async healthCheck(timeoutMs = 3000): Promise<boolean> {
    try {
      const response = await axios.get(`${this.endpoint}/v1/models`, {
        timeout: timeoutMs,
        validateStatus: () => true,
        headers: { Accept: 'application/json' }
      });
      return response.status >= 200 && response.status < 300;
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    if (!this.cfg.enabled || !this.cfg.autoStart) return;
    if (this.proc) return;

    const args: string[] = [
      '--host',
      this.cfg.host,
      '--port',
      String(this.cfg.port),
      '-m',
      this.cfg.modelPath,
      '-c',
      String(this.cfg.context),
      '-t',
      String(this.cfg.threads),
      ...this.cfg.extraArgs
    ];

    this.logger.info('Starting llama.cpp server', {
      binPath: this.cfg.binPath,
      host: this.cfg.host,
      port: this.cfg.port,
      modelPath: this.cfg.modelPath
    });

    this.proc = spawn(this.cfg.binPath, args, {
      stdio: 'pipe',
      env: process.env
    });

    this.proc.on('error', (err) => {
      this.logger.warn('llama.cpp server failed to start', {
        message: err instanceof Error ? err.message : String(err),
        binPath: this.cfg.binPath
      });
      this.proc = null;
      this.stdoutBuf = '';
      this.stderrBuf = '';
    });

    const flushLines = (kind: 'stdout' | 'stderr') => {
      const buf = kind === 'stdout' ? this.stdoutBuf : this.stderrBuf;
      const parts = buf.split(/\r?\n/);
      const remaining = parts.pop() ?? '';
      if (kind === 'stdout') this.stdoutBuf = remaining;
      else this.stderrBuf = remaining;

      for (const raw of parts) {
        const line = raw.trim();
        if (!line) continue;
        if (line === '.') continue;

        const lower = line.toLowerCase();
        const isProbablyError =
          lower.includes('error') ||
          lower.includes('failed') ||
          lower.includes('fatal') ||
          lower.includes('panic') ||
          lower.includes('no such file') ||
          lower.includes('exiting due to');

        if (kind === 'stderr') {
          if (isProbablyError) this.logger.warn(`[llama.cpp] ${line}`);
          else this.logger.info(`[llama.cpp] ${line}`);
        } else {
          this.logger.info(`[llama.cpp] ${line}`);
        }
      }
    };

    this.proc.stdout.on('data', (d: Buffer) => {
      this.stdoutBuf += d.toString('utf8');
      flushLines('stdout');
    });

    this.proc.stderr.on('data', (d: Buffer) => {
      this.stderrBuf += d.toString('utf8');
      flushLines('stderr');
    });

    this.proc.on('exit', (code) => {
      this.logger.warn('llama.cpp server exited', { code });
      this.proc = null;
      this.stdoutBuf = '';
      this.stderrBuf = '';
    });

    const maxWaitMs = 20000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (await this.healthCheck(1500)) {
        this.logger.info('llama.cpp server is healthy');
        return;
      }
      await new Promise(r => setTimeout(r, 700));
    }

    this.logger.warn('llama.cpp server did not become healthy within timeout', {
      endpoint: this.endpoint
    });
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

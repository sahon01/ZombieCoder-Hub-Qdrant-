import path from 'path';
import chokidar, { FSWatcher } from 'chokidar';
import { Logger } from '../utils/logger';
import { ragService } from './ragService';

export type RagAutoIndexerStatus = {
  enabled: boolean;
  watchPath: string | null;
  isWatching: boolean;
  indexedEvents: number;
  lastIndexedAt: string | null;
  lastError: string | null;
};

export class RagAutoIndexer {
  private logger = new Logger();
  private watcher: FSWatcher | null = null;

  private indexedEvents = 0;
  private lastIndexedAt: string | null = null;
  private lastError: string | null = null;

  private isEnabled(): boolean {
    const raw = String(process.env.RAG_AUTO_INDEX_ENABLED || '').trim().toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
  }

  private resolveWatchPath(): string | null {
    const raw = String(process.env.RAG_WATCH_PATH || '').trim();
    if (!raw) return null;
    return path.resolve(process.cwd(), raw);
  }

  private allowedExtensions(): Set<string> {
    const raw = String(process.env.RAG_WATCH_EXTENSIONS || '.md,.txt,.ts,.tsx,.js,.jsx,.json,.py,.go,.java,.cs').trim();
    const exts = raw
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .map(s => (s.startsWith('.') ? s.toLowerCase() : `.${s.toLowerCase()}`));
    return new Set(exts);
  }

  private shouldIgnore(filePath: string): boolean {
    const normalized = filePath.replace(/\\/g, '/').toLowerCase();
    if (normalized.includes('/node_modules/')) return true;
    if (normalized.includes('/.npm-cache/')) return true;
    if (normalized.includes('/npm-cache/')) return true;
    if (normalized.includes('/dist/')) return true;
    if (normalized.includes('/build/')) return true;
    if (normalized.includes('/out/')) return true;
    if (normalized.includes('/.git/')) return true;
    if (normalized.includes('/.hg/')) return true;
    if (normalized.includes('/.svn/')) return true;
    if (normalized.includes('/.idea/')) return true;
    if (normalized.includes('/.vscode/')) return true;

    // Python caches/virtualenvs
    if (normalized.includes('/__pycache__/')) return true;
    if (normalized.includes('/.pytest_cache/')) return true;
    if (normalized.includes('/.mypy_cache/')) return true;
    if (normalized.includes('/.ruff_cache/')) return true;
    if (normalized.includes('/.venv/')) return true;
    if (normalized.includes('/venv/')) return true;

    // Web/JS build caches
    if (normalized.includes('/.next/')) return true;
    if (normalized.includes('/.nuxt/')) return true;
    if (normalized.includes('/.svelte-kit/')) return true;
    if (normalized.includes('/.astro/')) return true;
    if (normalized.includes('/.turbo/')) return true;
    if (normalized.includes('/.cache/')) return true;

    if (normalized.includes('/chroma/')) return true;
    return false;
  }

  private async onFileEvent(event: 'add' | 'change', filePath: string): Promise<void> {
    if (this.shouldIgnore(filePath)) return;

    const allowed = this.allowedExtensions();
    const ext = path.extname(filePath).toLowerCase();
    if (!allowed.has(ext)) return;

    try {
      const res = await ragService.ingestFile(filePath, { type: 'workspace_file' });
      this.indexedEvents += 1;
      this.lastIndexedAt = new Date().toISOString();
      this.lastError = null;
      this.logger.info('Auto-indexed file into RAG', { event, filePath, chunks: res.chunkCount });
    } catch (e) {
      this.lastError = e instanceof Error ? e.message : String(e);
      this.logger.warn('Auto-index failed for file', { event, filePath, error: this.lastError });
    }
  }

  async start(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.info('RAG auto-indexing disabled');
      return;
    }

    const watchPath = this.resolveWatchPath();
    if (!watchPath) {
      this.logger.warn('RAG auto-index enabled but RAG_WATCH_PATH is not set');
      return;
    }

    if (this.watcher) return;

    this.logger.info('Starting RAG auto-indexer', { watchPath });

    this.watcher = chokidar.watch(watchPath, {
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 400,
        pollInterval: 100
      },
      ignored: (p: string) => this.shouldIgnore(p)
    });

    this.watcher.on('add', (p: string) => {
      void this.onFileEvent('add', p);
    });

    this.watcher.on('change', (p: string) => {
      void this.onFileEvent('change', p);
    });

    this.watcher.on('error', (err: any) => {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.logger.error('RAG auto-indexer watcher error', err);
    });
  }

  async stop(): Promise<void> {
    if (!this.watcher) return;
    await this.watcher.close();
    this.watcher = null;
  }

  getStatus(): RagAutoIndexerStatus {
    const enabled = this.isEnabled();
    const watchPath = this.resolveWatchPath();

    return {
      enabled,
      watchPath,
      isWatching: Boolean(this.watcher),
      indexedEvents: this.indexedEvents,
      lastIndexedAt: this.lastIndexedAt,
      lastError: this.lastError
    };
  }
}

export const ragAutoIndexer = new RagAutoIndexer();

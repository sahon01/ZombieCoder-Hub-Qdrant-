import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Logger } from '../utils/logger';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { Chroma } from '@langchain/community/vectorstores/chroma';
import { QdrantClient } from '@qdrant/js-client-rest';
import { Document } from '@langchain/core/documents';
import { initializePostgres, ensurePgVectorExtension, getPostgresPool, isPostgresEnabled } from '../database/postgres';
import { LocalXenovaEmbeddings } from './localEmbeddings';

export type RagRetrievedContext = {
  documents: Array<{ content: string; metadata: Record<string, any> }>;
  contextText: string;
};

export type RagMetricsSnapshot = {
  vectorBackend: 'pgvector' | 'chroma' | 'qdrant';
  totalIngestOperations: number;
  totalIngestedChunks: number;
  totalRetrieveQueries: number;
  lastIngestAt: string | null;
  lastRetrieveAt: string | null;
  recentIndexedFiles: Array<{ path: string; at: string; chunks: number }>;
};

export class RagService {
  private logger = new Logger();
  private vectorStorePromise: Promise<PGVectorStore> | null = null;
  private chromaStorePromise: Promise<Chroma> | null = null;
  private qdrantClientPromise: Promise<QdrantClient> | null = null;

  private totalIngestOperations = 0;
  private totalIngestedChunks = 0;
  private totalRetrieveQueries = 0;
  private lastIngestAt: string | null = null;
  private lastRetrieveAt: string | null = null;
  private recentIndexedFiles: Array<{ path: string; at: string; chunks: number }> = [];

  private getVectorBackend(): 'pgvector' | 'chroma' | 'qdrant' {
    const raw = String(process.env.RAG_VECTOR_BACKEND || '').trim().toLowerCase();
    if (raw === 'chroma') return 'chroma';
    if (raw === 'qdrant') return 'qdrant';
    return 'pgvector';
  }

  private getMetadataPath(): string {
    return process.env.RAG_METADATA_PATH
      ? path.resolve(process.cwd(), process.env.RAG_METADATA_PATH)
      : path.resolve(process.cwd(), '..', 'work', 'metadata.md');
  }

  private getSchemaName(): string | null {
    const raw = String(process.env.PG_VECTOR_SCHEMA || '').trim();
    return raw ? raw : null;
  }

  private getTableName(): string {
    return String(process.env.PG_VECTOR_TABLE || 'rag_documents');
  }

  private getCollectionName(): string {
    return String(process.env.PG_VECTOR_COLLECTION || 'zombiecoder_metadata');
  }

  private getChromaUrl(): string {
    return String(process.env.CHROMA_URL || 'http://127.0.0.1:8001').trim() || 'http://127.0.0.1:8001';
  }

  private getChromaCollectionName(): string {
    return String(process.env.CHROMA_COLLECTION || this.getCollectionName() || 'zombiecoder_metadata');
  }

  private getQdrantUrl(): string {
    return String(process.env.QDRANT_URL || 'http://127.0.0.1:6333').trim() || 'http://127.0.0.1:6333';
  }

  private getQdrantCollectionName(): string {
    return String(process.env.QDRANT_COLLECTION || this.getCollectionName() || 'zombiecoder_metadata');
  }

  private getQdrantVectorSize(): number {
    const raw = String(process.env.QDRANT_VECTOR_SIZE || '').trim();
    const n = raw ? parseInt(raw, 10) : NaN;
    // Default for Xenova/all-MiniLM-L6-v2 is 384.
    return Number.isFinite(n) && n > 0 ? n : 384;
  }

  private async getVectorStore(): Promise<PGVectorStore> {
    const backend = this.getVectorBackend();
    if (backend !== 'pgvector') {
      throw new Error(`PGVector store requested while RAG_VECTOR_BACKEND=${backend}`);
    }
    if (!this.vectorStorePromise) {
      this.vectorStorePromise = (async () => {
        if (!isPostgresEnabled()) {
          throw new Error('Postgres is not enabled. Set PG_CONNECTION_STRING or PG_HOST env vars.');
        }

        await initializePostgres();

        const schemaName = this.getSchemaName();
        await ensurePgVectorExtension(schemaName || undefined);

        const embeddings = new LocalXenovaEmbeddings();

        const store = await PGVectorStore.initialize(embeddings, {
          pool: getPostgresPool(),
          tableName: this.getTableName(),
          collectionName: this.getCollectionName(),
          schemaName,
          distanceStrategy: 'cosine'
        });

        return store;
      })();
    }

    return this.vectorStorePromise;
  }

  private async getChromaStore(): Promise<Chroma> {
    if (this.getVectorBackend() !== 'chroma') {
      throw new Error('Chroma store requested while RAG_VECTOR_BACKEND is not chroma');
    }

    if (!this.chromaStorePromise) {
      this.chromaStorePromise = (async () => {
        const embeddings = new LocalXenovaEmbeddings();
        const store = new Chroma(embeddings, {
          url: this.getChromaUrl(),
          collectionName: this.getChromaCollectionName()
        });
        // Ensure collection exists with allowReset to avoid validation errors
        await (store as any).ensureCollection({ allowReset: true });
        return store;
      })();
    }
    return this.chromaStorePromise;
  }

  private async getQdrantClient(): Promise<QdrantClient> {
    if (this.getVectorBackend() !== 'qdrant') {
      throw new Error('Qdrant client requested while RAG_VECTOR_BACKEND is not qdrant');
    }

    if (!this.qdrantClientPromise) {
      this.qdrantClientPromise = (async () => {
        const base = this.getQdrantUrl().replace(/\/+$/, '');
        const u = new URL(base);
        const port = u.port ? parseInt(u.port, 10) : (u.protocol === 'https:' ? 443 : 80);
        const client = new QdrantClient({
          host: u.hostname,
          port,
          https: u.protocol === 'https:'
        });
        return client;
      })();
    }

    return this.qdrantClientPromise;
  }

  private async ensureQdrantCollection(): Promise<void> {
    const client = await this.getQdrantClient();
    const name = this.getQdrantCollectionName();

    const existing = await client.getCollections();
    const has = Array.isArray(existing?.collections)
      ? existing.collections.some((c: any) => String(c?.name || '') === name)
      : false;
    if (has) return;

    await client.createCollection(name, {
      vectors: {
        size: this.getQdrantVectorSize(),
        distance: 'Cosine'
      }
    } as any);
  }

  private toQdrantPayload(doc: Document): Record<string, any> {
    return {
      content: doc.pageContent,
      metadata: doc.metadata || {}
    };
  }

  private async qdrantAddDocuments(docs: Document[]): Promise<void> {
    await this.ensureQdrantCollection();
    const client = await this.getQdrantClient();
    const collectionName = this.getQdrantCollectionName();

    const embeddings = new LocalXenovaEmbeddings();
    const vectors = await embeddings.embedDocuments(docs.map(d => d.pageContent));

    const points = docs.map((d, idx) => ({
      id: crypto.randomUUID(),
      vector: vectors[idx],
      payload: this.toQdrantPayload(d)
    }));

    await client.upsert(collectionName, {
      wait: true,
      points
    } as any);
  }

  private async qdrantSimilaritySearch(query: string, k: number): Promise<Document[]> {
    await this.ensureQdrantCollection();
    const client = await this.getQdrantClient();
    const collectionName = this.getQdrantCollectionName();
    const embeddings = new LocalXenovaEmbeddings();
    const vector = await embeddings.embedQuery(query);

    const result = await client.search(collectionName, {
      vector,
      limit: k,
      with_payload: true
    } as any);

    const points = Array.isArray(result) ? result : ((result as any)?.result || []);
    const docs: Document[] = [];
    for (const p of points) {
      const payload = (p as any)?.payload || {};
      const content = typeof payload?.content === 'string' ? payload.content : '';
      const metadata = (payload?.metadata && typeof payload.metadata === 'object') ? payload.metadata : {};
      docs.push(new Document({ pageContent: content, metadata }));
    }
    return docs;
  }

  private chunkText(text: string): string[] {
    const maxChars = parseInt(String(process.env.RAG_CHUNK_SIZE || '900'), 10);
    const overlap = parseInt(String(process.env.RAG_CHUNK_OVERLAP || '150'), 10);
    const cleaned = text.replace(/\r\n/g, '\n').trim();
    if (!cleaned) return [];

    const chunks: string[] = [];
    let i = 0;
    while (i < cleaned.length) {
      const end = Math.min(i + maxChars, cleaned.length);
      const chunk = cleaned.slice(i, end).trim();
      if (chunk) chunks.push(chunk);
      if (end >= cleaned.length) break;
      i = Math.max(0, end - overlap);
    }
    return chunks;
  }

  private recordIndexedFile(filePath: string, chunkCount: number): void {
    const at = new Date().toISOString();
    this.recentIndexedFiles = [{ path: filePath, at, chunks: chunkCount }, ...this.recentIndexedFiles]
      .slice(0, parseInt(String(process.env.RAG_RECENT_FILES_MAX || '50'), 10));
  }

  async ingestMetadataMd(): Promise<{ chunkCount: number }> {
    const filePath = this.getMetadataPath();
    const raw = fs.readFileSync(filePath, 'utf8');
    const chunks = this.chunkText(raw);

    const docs: Document[] = chunks.map((c, idx) =>
      new Document({
        pageContent: c,
        metadata: {
          source: filePath,
          type: 'metadata_md',
          chunk_index: idx
        }
      })
    );

    const backend = this.getVectorBackend();
    if (backend === 'chroma') {
      const store = await this.getChromaStore();

      // Best-effort cleanup for the same source before re-ingesting.
      try {
        await store.delete({
          filter: { source: filePath, type: 'metadata_md' } as any
        });
      } catch {
        // ignore
      }

      await store.addDocuments(docs);
    } else if (backend === 'qdrant') {
      await this.qdrantAddDocuments(docs);
    } else {
      const store = await this.getVectorStore();

      // Best-effort cleanup for the same source before re-ingesting.
      try {
        await store.delete({
          filter: { source: filePath, type: 'metadata_md' }
        });
      } catch {
        // ignore
      }

      await store.addDocuments(docs);
    }

    this.totalIngestOperations += 1;
    this.totalIngestedChunks += docs.length;
    this.lastIngestAt = new Date().toISOString();
    this.recordIndexedFile(filePath, docs.length);

    this.logger.info('RAG metadata.md ingested into vector store', { backend, filePath, chunks: docs.length });

    return { chunkCount: docs.length };
  }

  async ingestFile(filePath: string, opts?: { type?: string; maxBytes?: number }): Promise<{ chunkCount: number }> {
    const maxBytes = typeof opts?.maxBytes === 'number' ? opts.maxBytes : parseInt(String(process.env.RAG_MAX_FILE_BYTES || '1048576'), 10);
    const buf = fs.readFileSync(filePath);
    if (buf.byteLength > maxBytes) {
      throw new Error(`File too large to ingest (bytes=${buf.byteLength}, max=${maxBytes})`);
    }

    const raw = buf.toString('utf8');
    const chunks = this.chunkText(raw);
    const baseType = String(opts?.type || 'file');

    const docs: Document[] = chunks.map((c, idx) =>
      new Document({
        pageContent: c,
        metadata: {
          source: filePath,
          type: baseType,
          chunk_index: idx
        }
      })
    );

    const backend = this.getVectorBackend();
    if (backend === 'chroma') {
      const store = await this.getChromaStore();
      try {
        await store.delete({
          filter: { source: filePath, type: baseType } as any
        });
      } catch {
      }
      await store.addDocuments(docs);
    } else if (backend === 'qdrant') {
      await this.qdrantAddDocuments(docs);
    } else {
      const store = await this.getVectorStore();
      try {
        await store.delete({
          filter: { source: filePath, type: baseType }
        });
      } catch {
      }
      await store.addDocuments(docs);
    }

    this.totalIngestOperations += 1;
    this.totalIngestedChunks += docs.length;
    this.lastIngestAt = new Date().toISOString();
    this.recordIndexedFile(filePath, docs.length);

    return { chunkCount: docs.length };
  }

  async retrieveContext(query: string, k = 6): Promise<RagRetrievedContext> {
    this.totalRetrieveQueries += 1;
    this.lastRetrieveAt = new Date().toISOString();
    const backend = this.getVectorBackend();
    const docs = backend === 'chroma'
      ? await (await this.getChromaStore()).similaritySearch(query, k)
      : backend === 'qdrant'
        ? await this.qdrantSimilaritySearch(query, k)
        : await (await this.getVectorStore()).similaritySearch(query, k);

    const normalized = docs.map((d: Document) => ({
      content: d.pageContent,
      metadata: (d.metadata || {}) as Record<string, any>
    }));

    const contextText = normalized
      .map((d: { content: string }, i: number) => `[CONTEXT_${i + 1}]\n${d.content}`)
      .join('\n\n');

    return { documents: normalized, contextText };
  }

  getMetricsSnapshot(): RagMetricsSnapshot {
    return {
      vectorBackend: this.getVectorBackend(),
      totalIngestOperations: this.totalIngestOperations,
      totalIngestedChunks: this.totalIngestedChunks,
      totalRetrieveQueries: this.totalRetrieveQueries,
      lastIngestAt: this.lastIngestAt,
      lastRetrieveAt: this.lastRetrieveAt,
      recentIndexedFiles: [...this.recentIndexedFiles]
    };
  }

  async countDocuments(): Promise<number | null> {
    try {
      const backend = this.getVectorBackend();

      if (backend === 'chroma') {
        const store = await this.getChromaStore();
        const col = await store.ensureCollection();
        const count = await (col as any).count();
        return typeof count === 'number' ? count : null;
      }

      // For qdrant/pgvector, count is best handled by backend-specific APIs.
      return null;
    } catch {
      return null;
    }
  }

  async verifyAnswerWithContext(userQuery: string, modelAnswer: string, contextText: string): Promise<{ ok: boolean; notes: string }> {
    // Light-weight verification prompt; uses the same model path via ProviderGateway later.
    // This function returns a decision payload to let caller decide what to do.

    const q = userQuery.trim();
    const a = modelAnswer.trim();

    if (!contextText.trim()) {
      return { ok: true, notes: 'No RAG context available; verification skipped.' };
    }

    const lowerQ = q.toLowerCase();
    const wantsBangla = /[\u0980-\u09FF]/.test(q);

    const notes = [
      wantsBangla
        ? 'যাচাই নোট: উত্তরটি প্রসঙ্গ (RAG context) অনুযায়ী সঠিক কি না দেখুন।'
        : 'Verification note: Check whether the answer is supported by retrieved context.',
      'Heuristic check only (no second model call yet).',
      `QueryLen=${q.length}, AnswerLen=${a.length}, ContextLen=${contextText.length}`,
      lowerQ.includes('who are you') || lowerQ.includes('who developed') || lowerQ.includes('owner')
        ? 'Identity-related query detected.'
        : 'General query.'
    ].join(' ');

    return { ok: true, notes };
  }
}

export const ragService = new RagService();

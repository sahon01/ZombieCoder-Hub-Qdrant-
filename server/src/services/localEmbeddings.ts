import type { EmbeddingsInterface } from '@langchain/core/embeddings';
import { Logger } from '../utils/logger';

export class LocalXenovaEmbeddings implements EmbeddingsInterface {
  private logger = new Logger();
  private model: string;
  private embedderPromise: Promise<any> | null = null;

  constructor(model?: string) {
    this.model = model || process.env.EMBEDDING_MODEL || 'Xenova/all-MiniLM-L6-v2';
  }

  private async getEmbedder(): Promise<any> {
    if (!this.embedderPromise) {
      this.embedderPromise = (async () => {
        const mod: any = await import('@xenova/transformers');
        const pipeline = mod.pipeline;
        return pipeline('feature-extraction', this.model);
      })();
    }
    return this.embedderPromise;
  }

  private normalizeToNumberArray(out: any): number[] {
    const embeddingArray: number[] | Float32Array = out?.data;
    if (!embeddingArray || typeof (embeddingArray as any).length !== 'number') {
      throw new Error('Invalid embedding output received from local model');
    }
    return Array.from(embeddingArray as any);
  }

  async embedQuery(text: string): Promise<number[]> {
    const embedder = await this.getEmbedder();
    const out = await embedder(text, { pooling: 'mean', normalize: true });
    const vec = this.normalizeToNumberArray(out);
    this.logger.info('Embedding generated (query)', { model: this.model, dimensions: vec.length });
    return vec;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    const embedder = await this.getEmbedder();
    const vectors: number[][] = [];
    for (const text of texts) {
      const out = await embedder(text, { pooling: 'mean', normalize: true });
      vectors.push(this.normalizeToNumberArray(out));
    }
    this.logger.info('Embeddings generated (documents)', { model: this.model, count: vectors.length });
    return vectors;
  }
}

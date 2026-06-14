import { Chunker } from './chunker.js';
import { EmbeddingService } from '../embeddings/embeddingService.js';
import { VectorStore } from '../vectorStore/vectorStore.js';

export class IngestionPipeline {
  constructor(
    private readonly chunker: Chunker,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStore: VectorStore
  ) {}

  public async ingest(
    document: { id: string; content: string; metadata?: Record<string, unknown> },
    options?: { reingest?: boolean }
  ): Promise<{ chunksCreated: number }> {
    if (options?.reingest) {
      await this.vectorStore.deleteByDocumentId(document.id);
    }

    const chunks = this.chunker.chunk(document.content);
    if (chunks.length === 0) {
      return { chunksCreated: 0 };
    }

    const textsToEmbed = chunks.map(c => c.text);
    const embeddings = await this.embeddingService.embedBatch(textsToEmbed);

    const chunksToInsert = chunks.map((c, idx) => ({
      documentId: document.id,
      content: c.text,
      embedding: embeddings[idx],
      metadata: {
        ...(document.metadata ?? {}),
        startChar: c.startChar,
        endChar: c.endChar,
        tokenCount: c.tokenCount
      }
    }));

    await this.vectorStore.insertBatch(chunksToInsert);

    return { chunksCreated: chunks.length };
  }
}

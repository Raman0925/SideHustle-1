import { vi, it, expect, beforeEach } from 'vitest';
import { Chunker } from '../chunker.js';
import { IngestionPipeline } from '../ingestion-pipeline.js';
import { EmbeddingService } from '../../embeddings/embeddingService.js';
import { VectorStore } from '../../vectorStore/vectorStore.js';

let mockChunker: Chunker;
let mockEmbeddingService: EmbeddingService;
let mockVectorStore: VectorStore;
let pipeline: IngestionPipeline;

beforeEach(() => {
  mockChunker = {
    chunk: vi.fn().mockReturnValue([
      { text: 'Chunk 1', startChar: 0, endChar: 7, tokenCount: 2 },
      { text: 'Chunk 2', startChar: 8, endChar: 15, tokenCount: 2 }
    ])
  } as any;

  mockEmbeddingService = {
    embedBatch: vi.fn().mockResolvedValue([
      [0.1, 0.2],
      [0.3, 0.4]
    ])
  } as any;

  mockVectorStore = {
    insertBatch: vi.fn().mockResolvedValue(['id-1', 'id-2']),
    deleteByDocumentId: vi.fn().mockResolvedValue(1)
  } as any;

  pipeline = new IngestionPipeline(mockChunker, mockEmbeddingService, mockVectorStore);
});

it('IngestionPipeline calls embedBatch once regardless of chunk count', async () => {
  const doc = { id: 'doc-123', content: 'Some document content' };
  const result = await pipeline.ingest(doc);

  expect(mockChunker.chunk).toHaveBeenCalledWith(doc.content);
  expect(mockEmbeddingService.embedBatch).toHaveBeenCalledOnce();
  expect(mockEmbeddingService.embedBatch).toHaveBeenCalledWith(['Chunk 1', 'Chunk 2']);
  expect(mockVectorStore.insertBatch).toHaveBeenCalledOnce();
  expect(result.chunksCreated).toBe(2);
});

it('IngestionPipeline should delete old chunks first when reingest option is true', async () => {
  const doc = { id: 'doc-123', content: 'Some document content' };
  await pipeline.ingest(doc, { reingest: true });

  expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledOnce();
  expect(mockVectorStore.deleteByDocumentId).toHaveBeenCalledWith('doc-123');
});

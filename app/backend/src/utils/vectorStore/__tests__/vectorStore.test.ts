import { vi, describe, it, expect, beforeEach } from 'vitest';
import { VectorStore, createVectorStore } from '../vectorStore.js';
import { InsertChunkParams, SearchParams } from '../types.js';

describe('VectorStore', () => {
  let mockDbFn: any;
  let db: any;
  let store: VectorStore;

  beforeEach(() => {
    mockDbFn = vi.fn();
    db = vi.fn((...args: any[]) => {
      if (Array.isArray(args[0]) && 'raw' in args[0]) {
        const queryText = args[0].join('');
        // If it is a nested SQL fragment call, return a placeholder instead of calling the mock executor
        if (queryText.trim().startsWith('AND') || queryText.trim() === '') {
          return { type: 'fragment', args };
        }
        return mockDbFn(...args);
      }
      return { type: 'helper', data: args[0] };
    });
    store = createVectorStore(db);
  });

  it('should batch insert chunks in a single SQL statement and return IDs', async () => {
    const mockIds = [{ id: 'id-1' }, { id: 'id-2' }];
    mockDbFn.mockResolvedValueOnce(mockIds);

    const chunks: InsertChunkParams[] = [
      { documentId: 'doc-1', content: 'content-1', embedding: [0.1, 0.2] },
      { documentId: 'doc-1', content: 'content-2', embedding: [0.3, 0.4] }
    ];

    const result = await store.insertBatch(chunks);

    expect(db).toHaveBeenCalled();
    expect(mockDbFn).toHaveBeenCalledOnce();
    expect(result).toEqual(['id-1', 'id-2']);
  });

  it('should search using parameter-based vector queries and parse results', async () => {
    const mockSearchResults = [
      { id: '1', document_id: 'doc-1', content: 'match-1', similarity: '0.95', metadata: '{"source":"pdf"}' },
      { id: '2', document_id: 'doc-1', content: 'match-2', similarity: 0.85, metadata: { source: 'web' } }
    ];
    mockDbFn.mockResolvedValueOnce(mockSearchResults);

    const searchParams: SearchParams = {
      embedding: [0.1, 0.2, 0.3],
      limit: 5,
      minSimilarity: 0.8,
      filter: { customer_tier: 'enterprise' }
    };

    const results = await store.search(searchParams);

    expect(mockDbFn).toHaveBeenCalledOnce();
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      id: '1',
      documentId: 'doc-1',
      content: 'match-1',
      similarity: 0.95,
      metadata: { source: 'pdf' }
    });
    expect(results[1]).toEqual({
      id: '2',
      documentId: 'doc-1',
      content: 'match-2',
      similarity: 0.85,
      metadata: { source: 'web' }
    });
  });

  it('should delete by document ID and return count of deleted records', async () => {
    const mockDeleteResult = { count: 3 };
    mockDbFn.mockResolvedValueOnce(mockDeleteResult);

    const count = await store.deleteByDocumentId('doc-1');

    expect(mockDbFn).toHaveBeenCalledOnce();
    expect(count).toBe(3);
  });
});

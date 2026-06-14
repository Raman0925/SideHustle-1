import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Reranker } from '../reranker.js';

describe('Reranker', () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize successfully and fail on empty api key', () => {
    expect(() => new Reranker('')).toThrowError('API key is required');
  });

  it('should call Cohere rerank API and return sorted documents with relevance scores', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { index: 1, relevance_score: 0.98 },
          { index: 0, relevance_score: 0.45 }
        ]
      })
    });

    const reranker = new Reranker('cohere-api-key');
    const query = 'AI frameworks';
    const documents = ['Doc A: TensorFlow is a library.', 'Doc B: PyTorch is a framework.'];

    const result = await reranker.rerank(query, documents);

    expect(mockFetch).toHaveBeenCalledWith('https://api.cohere.com/v1/rerank', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer cohere-api-key',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        model: 'rerank-english-v3.0',
        query,
        documents,
        top_n: 2
      })
    }));

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      index: 1,
      relevanceScore: 0.98,
      content: 'Doc B: PyTorch is a framework.'
    });
    expect(result[1]).toEqual({
      index: 0,
      relevanceScore: 0.45,
      content: 'Doc A: TensorFlow is a library.'
    });
  });

  it('should return empty list immediately on empty documents input', async () => {
    const reranker = new Reranker('cohere-api-key');
    const result = await reranker.rerank('query', []);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

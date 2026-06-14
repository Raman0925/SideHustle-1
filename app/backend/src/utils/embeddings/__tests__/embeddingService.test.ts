import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EmbeddingService } from '../embeddingService.js';

describe('EmbeddingService', () => {
  const model = 'text-embedding-ada-002';
  let originalApiKey: string | undefined;
  const mockFetch = vi.fn();

  beforeEach(() => {
    originalApiKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-api-key';
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalApiKey;
    vi.restoreAllMocks();
  });

  // Test 1: Model validation in constructor
  it('should throw an error if model is invalid during initialization', () => {
    expect(() => new EmbeddingService('invalid-model')).toThrowError(/Invalid model/);
  });

  // Test 2: API key retrieval via getApiKey throws if missing
  it('should throw an error if OPENAI_API_KEY is not defined', async () => {
    delete process.env.OPENAI_API_KEY;
    const service = new EmbeddingService(model);
    await expect(service.embedBatch(['Hello'])).rejects.toThrowError('OPENAI_API_KEY environment variable is not defined');
  });

  // Test 3: embed delegates to embedBatch
  it('should delegate to embedBatch and return the first embedding when calling embed', async () => {
    const service = new EmbeddingService(model);
    const spy = vi.spyOn(service, 'embedBatch').mockResolvedValueOnce([[0.1, 0.2, 0.3]]);
    
    const result = await service.embed('Hello world');
    
    expect(spy).toHaveBeenCalledWith(['Hello world']);
    expect(result).toEqual([0.1, 0.2, 0.3]);
  });

  // Test 4: embedBatch correctly calls API and handles ordering
  it('should fetch embeddings from OpenAI API and maintain their original order', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { embedding: [0.4, 0.5], index: 1, object: 'embedding' },
          { embedding: [0.1, 0.2], index: 0, object: 'embedding' }
        ]
      })
    });

    const service = new EmbeddingService(model);
    const result = await service.embedBatch(['first', 'second']);

    expect(mockFetch).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'Authorization': 'Bearer test-api-key',
        'Content-Type': 'application/json'
      }),
      body: JSON.stringify({
        input: ['first', 'second'],
        model: model,
        encoding_format: 'float'
      })
    }));
    expect(result).toEqual([
      [0.1, 0.2],
      [0.4, 0.5]
    ]);
  });

  // Test 5: findMostSimilar works as expected
  it('should correctly find the index of the candidate vector most similar to the query', () => {
    const service = new EmbeddingService(model);
    const query = [1, 0, 0];
    const candidates = [
      [0, 1, 0], // Orthogonal (similarity 0)
      [0.8, 0.6, 0], // High similarity (0.8)
      [-1, 0, 0] // Opposite (similarity -1)
    ];

    const result = service.findMostSimilar(query, candidates);
    expect(result.index).toBe(1);
    expect(result.similarity).toBeCloseTo(0.8, 5);
  });
});

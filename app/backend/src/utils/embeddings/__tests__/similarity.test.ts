import { describe, it, expect } from 'vitest';
import { cosineSimilarity } from '../similarity.js';
import { EmbeddingService } from '../embeddingService.js';

describe('cosineSimilarity', () => {
  it('identical vectors return 1.0', () => {
    const a = [1, 0, 0];
    const b = [1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1.0, 5);
  });

  it('opposite vectors return -1.0', () => {
    const a = [1, 0, 0];
    const b = [-1, 0, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('different length vectors throw', () => {
    const a = [1, 2];
    const b = [1, 2, 3];
    expect(() => cosineSimilarity(a, b)).toThrow();
  });
});

describe('EmbeddingService.findMostSimilar', () => {
  it('returns index of most similar candidate', () => {
    const service = new EmbeddingService('text-embedding-ada-002');
    const query = [1, 0, 0];
    const candidates = [
      [0, 1, 0],
      [1, 0, 0],
      [0, 0, 1]
    ];
    const result = service.findMostSimilar(query, candidates);
    expect(result.index).toBe(1);
    expect(result.similarity).toBeCloseTo(1.0, 5);
  });

  it('throws on empty candidates', () => {
    const service = new EmbeddingService('text-embedding-ada-002');
    const query = [1, 0, 0];
    const candidates: number[][] = [];
    expect(() => service.findMostSimilar(query, candidates)).toThrow();
  });
});

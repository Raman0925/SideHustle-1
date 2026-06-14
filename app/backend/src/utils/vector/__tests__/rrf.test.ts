import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion } from '../rrf.js';

describe('reciprocalRankFusion', () => {
  it('should rank items correctly based on their ranks in multiple lists', () => {
    const listA = [{ id: 'doc-1' }, { id: 'doc-2' }];
    const listB = [{ id: 'doc-2' }, { id: 'doc-3' }];

    const fused = reciprocalRankFusion([listA, listB], 60);

    expect(fused).toHaveLength(3);
    expect(fused[0].item.id).toBe('doc-2');
    expect(fused[1].item.id).toBe('doc-1');
    expect(fused[2].item.id).toBe('doc-3');
    expect(fused[0].score).toBeCloseTo(1/62 + 1/61, 6);
  });

  it('should return empty list if input lists are empty', () => {
    const fused = reciprocalRankFusion([], 60);
    expect(fused).toEqual([]);
  });
});

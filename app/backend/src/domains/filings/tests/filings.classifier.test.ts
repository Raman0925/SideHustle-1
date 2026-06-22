import { describe, it, expect } from 'vitest';
import { FilingClassifier, createFilingClassifier } from '../filings.classifier.js';

describe('FilingClassifier', () => {
  const classifier = createFilingClassifier();

  it('classifies as MATERIAL HIGH when multiple material keywords match and no routine keywords match', () => {
    const result = classifier.classify('Award of contract for acquisition of stake', 'Corp Action');
    expect(result.tier).toBe('MATERIAL');
    expect(result.confidence).toBe('HIGH');
    expect(result.matchedKeywords).toContain('contract');
    expect(result.matchedKeywords).toContain('acquisition');
  });

  it('classifies as MATERIAL LOW when exactly one material keyword matches and no routine keywords match', () => {
    const result = classifier.classify('Company gets order win', 'Announcement');
    expect(result.tier).toBe('MATERIAL');
    expect(result.confidence).toBe('LOW');
    expect(result.matchedKeywords).toEqual(['order']);
  });

  it('classifies as ROUTINE HIGH when routine keywords match and no material keywords match', () => {
    const result = classifier.classify('Board Meeting Notice details', 'Board Notice');
    expect(result.tier).toBe('ROUTINE');
    expect(result.confidence).toBe('HIGH');
    expect(result.matchedKeywords).toContain('board meeting notice');
  });

  it('classifies as WATCH LOW when both material and routine keywords match', () => {
    const result = classifier.classify('Loss of share certificate and order win announcement', 'Loss and Win');
    expect(result.tier).toBe('WATCH');
    expect(result.confidence).toBe('LOW');
    expect(result.matchedKeywords).toContain('order');
    expect(result.matchedKeywords).toContain('loss of share certificate');
  });

  it('classifies as WATCH LOW when no keywords match', () => {
    const result = classifier.classify('Random subject text here', 'General');
    expect(result.tier).toBe('WATCH');
    expect(result.confidence).toBe('LOW');
    expect(result.matchedKeywords).toEqual([]);
  });
});

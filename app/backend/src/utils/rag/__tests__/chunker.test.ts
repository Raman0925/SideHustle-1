import { describe, it, expect } from 'vitest';
import { Chunker } from '../chunker.js';
import { TokenBudgetManager } from '../../tokens/tokenBudgetManager.js';
import { contextBudget } from '../../tokens/types.js';

describe('Chunker', () => {
  const mockBudget: contextBudget = {
    systemPrompt: 100,
    toolDefinitions: 0,
    retrievedDocuments: 0,
    conversationHistory: 0,
    userMessage: 100,
    responseBudget: 0
  };
  const tokenManager = new TokenBudgetManager(mockBudget);

  it('Chunker splits long text into multiple chunks', () => {
    const chunker = new Chunker(tokenManager, { maxTokens: 10, overlapTokens: 2 });
    const text = 'Paragraph one has some text.\n\nParagraph two has more text here.\n\nParagraph three is the final paragraph.';
    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      const extractedText = text.substring(chunk.startChar, chunk.endChar);
      expect(extractedText.trim()).toBe(chunk.text.trim());
    }
  });

  it('Chunker respects maxTokens limit per chunk', () => {
    const maxTokens = 5;
    const chunker = new Chunker(tokenManager, { maxTokens, overlapTokens: 1 });
    const text = 'This is a test sentence that is quite long and should result in multiple small chunks.';
    const chunks = chunker.chunk(text);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens);
    }
  });
});

import { it, expect } from 'vitest';
import { Chunker, createChunker } from '../chunker.js';
import { TokenBudgetManager, createTokenBudgetManager } from '../../tokens/tokenBudgetManager.js';
import { contextBudget } from '../../tokens/types.js';

const mockBudget: contextBudget = {
  systemPrompt: 100,
  toolDefinitions: 0,
  retrievedDocuments: 0,
  conversationHistory: 0,
  userMessage: 100,
  responseBudget: 0
};
const tokenManager = createTokenBudgetManager(mockBudget);

it('Chunker splits long text into multiple chunks', () => {
  const chunker = createChunker(tokenManager, { maxTokens: 10, overlapTokens: 2 });
  const text = 'Paragraph one has some text.\n\nParagraph two has more text here.\n\nParagraph three is the final paragraph.';
  const chunks = chunker.chunk(text);

  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    const extractedText = text.substring(chunk.startChar, chunk.endChar);
    expect(extractedText.trim()).toBe(chunk.text.trim());
  }
});

it('Chunker respects maxTokens per chunk', () => {
  const maxTokens = 5;
  const chunker = createChunker(tokenManager, { maxTokens, overlapTokens: 1 });
  const text = 'This is a test sentence that is quite long and should result in multiple small chunks.';
  const chunks = chunker.chunk(text);

  expect(chunks.length).toBeGreaterThan(1);
  for (const chunk of chunks) {
    expect(chunk.tokenCount).toBeLessThanOrEqual(maxTokens);
  }
});

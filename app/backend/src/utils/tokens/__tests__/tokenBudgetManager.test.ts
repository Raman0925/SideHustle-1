import { describe, it, expect } from 'vitest';
import { TokenBudgetManager, createTokenBudgetManager } from '../tokenBudgetManager.js';
import { contextBudget } from '../types.js';

describe('TokenBudgetManager', () => {
  const mockBudget: contextBudget = {
    systemPrompt: 20,
    toolDefinitions: 15,
    retrievedDocuments: 50,
    conversationHistory: 100,
    userMessage: 30,
    responseBudget: 50
  };

  const manager = createTokenBudgetManager(mockBudget);

  describe('getTokenCount', () => {
    it('should return 0 for empty string', () => {
      expect(manager.getTokenCount('')).toBe(0);
    });

    it('should return correct token count for a known sentence', () => {
      const text = 'Hello world, this is a test.';
      expect(manager.getTokenCount(text)).toBeGreaterThan(0);
    });
  });

  describe('validateBudget', () => {
    it('should validate successfully when all components are within budget', () => {
      const components = {
        systemPrompt: 'Short system prompt.',
        userMessage: 'Hello!'
      };
      const result = manager.validateBudget(components);
      expect(result.valid).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it('should report violations when a component is over budget', () => {
      const components = {
        systemPrompt: 'This is a very very very very very very very very very very very very very long system prompt that will definitely exceed twenty tokens.',
        userMessage: 'Hello!'
      };
      const result = manager.validateBudget(components);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].component).toBe('systemPrompt');
      expect(result.violations[0].over).toBeGreaterThan(0);
    });

    it('should handle component names not present in the budget schema by defaulting limit to 0', () => {
      const components = {
        unknownComponent: 'This is some text for an unknown component.'
      };
      const result = manager.validateBudget(components);
      expect(result.valid).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].component).toBe('unknownComponent');
      expect(result.violations[0].limit).toBe(0);
      expect(result.violations[0].over).toBe(manager.getTokenCount(components.unknownComponent));
    });
  });

  describe('truncateToFit', () => {
    it('should not truncate if already within limits', () => {
      const text = 'Short text';
      expect(manager.truncateToFit(text, 10)).toBe(text);
    });

    it('should truncate to fit at a word boundary', () => {
      const text = 'One two three four five six seven eight nine ten';
      const maxTokens = 5;
      const truncated = manager.truncateToFit(text, maxTokens);
      
      expect(manager.getTokenCount(truncated)).toBeLessThanOrEqual(maxTokens);
      const words = truncated.split(/\s+/);
      expect(words[words.length - 1]).toMatch(/^(One|two|three|four|five|six|seven|eight|nine|ten)$/);
    });

    it('should return empty string if maxTokens is 0', () => {
      const text = 'Hello world';
      expect(manager.truncateToFit(text, 0)).toBe('');
    });

    it('should handle truncation when the first word exceeds the token limit', () => {
      const text = 'Supercalifragilisticexpialidocious is a very long word';
      // Let's set maxTokens extremely small (e.g. 1 token)
      const truncated = manager.truncateToFit(text, 1);
      expect(manager.getTokenCount(truncated)).toBeLessThanOrEqual(1);
    });

    it('should preserve formatting and spacing during truncation check', () => {
      const text = 'Line1\nLine2\nLine3';
      const truncated = manager.truncateToFit(text, 2);
      expect(manager.getTokenCount(truncated)).toBeLessThanOrEqual(2);
    });
  });

  describe('getMetrics', () => {
    it('should calculate utilization metrics correctly', () => {
      const components = {
        systemPrompt: 'System prompt',
        userMessage: 'User message'
      };
      const metrics = manager.getMetrics(components);
      expect(metrics.totalBudget).toBe(265); // sum of mockBudget
      expect(metrics.totalUsed).toBe(manager.getTokenCount('System prompt') + manager.getTokenCount('User message'));
      expect(metrics.utilization.systemPrompt).toBeGreaterThan(0);
      expect(metrics.overallUtilization).toBeGreaterThan(0);
    });

    it('should report 0% utilization for missing components', () => {
      const components = {};
      const metrics = manager.getMetrics(components);
      expect(metrics.utilization.systemPrompt).toBe(0);
      expect(metrics.totalUsed).toBe(0);
      expect(metrics.overallUtilization).toBe(0);
    });
  });
});

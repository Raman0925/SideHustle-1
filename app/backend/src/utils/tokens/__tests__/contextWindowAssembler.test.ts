import { describe, it, expect } from 'vitest';
import { TokenBudgetManager, createTokenBudgetManager } from '../tokenBudgetManager.js';
import { ContextWindowAssembler, createContextWindowAssembler } from '../contextWindowAssembler.js';
import { contextBudget, Message } from '../types.js';

describe('ContextWindowAssembler', () => {
  describe('assemble success paths', () => {
    const mockBudget: contextBudget = {
      systemPrompt: 50,
      toolDefinitions: 0,
      retrievedDocuments: 50,
      conversationHistory: 100,
      userMessage: 30,
      responseBudget: 0
    };

    const tokenManager = createTokenBudgetManager(mockBudget);
    const assembler = createContextWindowAssembler(mockBudget, tokenManager);

    it('should successfully assemble context when all inputs are within budget', () => {
      const systemPrompt = 'Short prompt';
      const history: Message[] = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi' }
      ];
      const currentMessage = 'How?';
      const documents = ['Doc 1', 'Doc 2'];

      const result = assembler.assemble(systemPrompt, history, currentMessage, documents);

      expect(result.systemPrompt).toBe(systemPrompt);
      expect(result.messages).toHaveLength(3);
      expect(result.messages[2]).toEqual({ role: 'user', content: currentMessage });
      expect(result.totalTokens).toBeGreaterThan(0);
      expect(result.dropped.historyMessagesDropped).toBe(0);
      expect(result.dropped.documentsSkipped).toBe(0);
    });
  });

  describe('assemble constraint enforcement', () => {
    it('should drop older history messages that exceed the conversation history budget', () => {
      const mockBudget: contextBudget = {
        systemPrompt: 50,
        toolDefinitions: 0,
        retrievedDocuments: 50,
        conversationHistory: 10,
        userMessage: 30,
        responseBudget: 0
      };
      const tokenManager = createTokenBudgetManager(mockBudget);
      const assembler = createContextWindowAssembler(mockBudget, tokenManager);

      const systemPrompt = 'Helper';
      const history: Message[] = [
        { role: 'user', content: 'This message is extremely long and will definitely exceed the ten token history budget.' },
        { role: 'assistant', content: 'Hi' },
        { role: 'user', content: 'Okay' }
      ];
      const currentMessage = 'Test';
      const documents: string[] = [];

      const result = assembler.assemble(systemPrompt, history, currentMessage, documents);

      expect(result.messages).toHaveLength(3);
      expect(result.dropped.historyMessagesDropped).toBe(1);
    });

    it('should skip retrieved documents that exceed the retrieved documents budget', () => {
      const mockBudget: contextBudget = {
        systemPrompt: 50,
        toolDefinitions: 0,
        retrievedDocuments: 10,
        conversationHistory: 100,
        userMessage: 30,
        responseBudget: 0
      };
      const tokenManager = createTokenBudgetManager(mockBudget);
      const assembler = createContextWindowAssembler(mockBudget, tokenManager);

      const systemPrompt = 'Helper';
      const history: Message[] = [];
      const currentMessage = 'Hello';
      const documents = [
        'Short doc',
        'This is a very long document that is definitely more than ten tokens and should be skipped by the assembler.',
        'Short doc 2'
      ];

      const result = assembler.assemble(systemPrompt, history, currentMessage, documents);

      expect(result.dropped.documentsSkipped).toBe(1);
    });

    it('should throw an error if the system prompt exceeds its budget', () => {
      const mockBudget: contextBudget = {
        systemPrompt: 5,
        toolDefinitions: 0,
        retrievedDocuments: 50,
        conversationHistory: 100,
        userMessage: 30,
        responseBudget: 0
      };
      const tokenManager = createTokenBudgetManager(mockBudget);
      const assembler = createContextWindowAssembler(mockBudget, tokenManager);

      const systemPrompt = 'This is a long system prompt that will easily exceed five tokens.';
      const history: Message[] = [];
      const currentMessage = 'Hello';
      const documents: string[] = [];

      expect(() => {
        assembler.assemble(systemPrompt, history, currentMessage, documents);
      }).toThrowError(/System prompt exceeds budget/);
    });

    it('should throw an error if the current user message exceeds its budget', () => {
      const mockBudget: contextBudget = {
        systemPrompt: 50,
        toolDefinitions: 0,
        retrievedDocuments: 50,
        conversationHistory: 100,
        userMessage: 5,
        responseBudget: 0
      };
      const tokenManager = createTokenBudgetManager(mockBudget);
      const assembler = createContextWindowAssembler(mockBudget, tokenManager);

      const systemPrompt = 'Helper';
      const history: Message[] = [];
      const currentMessage = 'This is a very long user message that will easily exceed five tokens.';
      const documents: string[] = [];

      expect(() => {
        assembler.assemble(systemPrompt, history, currentMessage, documents);
      }).toThrowError(/Current message exceeds budget/);
    });
  });
});

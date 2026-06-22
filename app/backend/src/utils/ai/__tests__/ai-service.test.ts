import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AIService, createAIService } from '../ai-service.js';
import { ModelRouter, createModelRouter, CompletionParams } from '../model-router.js';
import { CostTracker, createCostTracker } from '../cost-tracker.js';

describe('AIService', () => {
  let provider: any;
  let streaming: any;
  let costTracker: CostTracker;
  let modelRouter: ModelRouter;
  let aiService: AIService;

  beforeEach(() => {
    provider = {
      complete: vi.fn(),
      embed: vi.fn()
    };
    streaming = {
      streamComplete: vi.fn()
    };
    modelRouter = createModelRouter();
    costTracker = createCostTracker(modelRouter);
    aiService = createAIService(provider, streaming, costTracker, modelRouter);
  });

  it('complete retries on failure then succeeds with exponential backoff delay', async () => {
    const mockParams: CompletionParams = {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'test message' }]
    };
    const mockMetadata = {
      feature: 'chat-bot',
      task: 'chat',
      tier: 'cheap'
    };

    // First attempt fails, second succeeds
    provider.complete
      .mockRejectedValueOnce(new Error('Temporary Server Error (503)'))
      .mockResolvedValueOnce({
        text: 'Successful response',
        usage: { inputTokens: 10, outputTokens: 20 }
      });

    const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

    const result = await aiService.complete(mockParams, mockMetadata, {
      maxRetries: 3,
      initialDelayMs: 2
    });

    expect(result.text).toBe('Successful response');
    expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 20 });
    expect(provider.complete).toHaveBeenCalledTimes(2);

    // Verify exponential backoff delay was used on the first retry (2ms)
    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenNthCalledWith(1, expect.any(Function), 2);

    // Verify cost tracking was recorded
    const trackedCosts = aiService.getTrackedCosts();
    expect(trackedCosts).toHaveLength(1);
    expect(trackedCosts[0].feature).toBe('chat-bot');
    expect(trackedCosts[0].inputTokens).toBe(10);
    expect(trackedCosts[0].outputTokens).toBe(20);
    expect(trackedCosts[0].cost).toBeGreaterThan(0);

    setTimeoutSpy.mockRestore();
  });

  it('complete does not retry on 400 Bad Request error', async () => {
    const mockParams: CompletionParams = {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'test message' }]
    };
    const mockMetadata = {
      feature: 'chat-bot',
      task: 'chat',
      tier: 'cheap'
    };

    // Throw a 400 Bad Request error
    provider.complete.mockRejectedValueOnce(new Error('Anthropic API request failed: 400 Bad Request'));

    await expect(
      aiService.complete(mockParams, mockMetadata, {
        maxRetries: 3,
        initialDelayMs: 1
      })
    ).rejects.toThrow('400 Bad Request');

    // Should only be called once since 400 is non-retryable
    expect(provider.complete).toHaveBeenCalledTimes(1);

    // Tracked costs should be empty
    expect(aiService.getTrackedCosts()).toHaveLength(0);
  });

  it('complete does not retry on invalid API key error', async () => {
    const mockParams: CompletionParams = {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'test message' }]
    };
    const mockMetadata = {
      feature: 'chat-bot',
      task: 'chat',
      tier: 'cheap'
    };

    // Throw an API key error
    provider.complete.mockRejectedValueOnce(new Error('Anthropic API key is not defined'));

    await expect(
      aiService.complete(mockParams, mockMetadata, {
        maxRetries: 3,
        initialDelayMs: 1
      })
    ).rejects.toThrow('Anthropic API key is not defined');

    // Should only be called once since invalid API key is non-retryable
    expect(provider.complete).toHaveBeenCalledTimes(1);
  });

  it('stream delegates to streaming provider and tracks cost on completion', async () => {
    const mockParams: CompletionParams = {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'test stream' }]
    };
    const mockMetadata = {
      feature: 'chat-bot',
      task: 'chat',
      tier: 'cheap'
    };

    streaming.streamComplete.mockImplementation(
      async (params: any, onChunk: any, onDone: any) => {
        onChunk('Hello ');
        onChunk('stream');
        onDone({ inputTokens: 15, outputTokens: 25 });
      }
    );

    const chunks: string[] = [];
    let finalUsage: any = null;

    await aiService.stream(
      mockParams,
      mockMetadata,
      (chunk) => chunks.push(chunk),
      (usage) => { finalUsage = usage; }
    );

    expect(chunks).toEqual(['Hello ', 'stream']);
    expect(finalUsage).toEqual({ inputTokens: 15, outputTokens: 25 });
    expect(streaming.streamComplete).toHaveBeenCalledOnce();

    // Verify cost tracking was recorded
    const trackedCosts = aiService.getTrackedCosts();
    expect(trackedCosts).toHaveLength(1);
    expect(trackedCosts[0].feature).toBe('chat-bot');
    expect(trackedCosts[0].inputTokens).toBe(15);
    expect(trackedCosts[0].outputTokens).toBe(25);
  });
});

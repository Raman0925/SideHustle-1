import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelRouter, createModelRouter, ModelConfig } from '../model-router.js';
import { AnthropicProvider, createAnthropicProvider } from '../anthropic-provider.js';

describe('ModelRouter', () => {
  let router: ModelRouter;

  beforeEach(() => {
    router = createModelRouter();
  });

  it('getModel returns correct model for task and tier', () => {
    const cheapChatConfig = router.getModel('chat', 'cheap');
    expect(cheapChatConfig.modelName).toBe('claude-haiku-4-5');
    expect(cheapChatConfig.inputCostPerMillion).toBe(0.80);

    const premiumChatConfig = router.getModel('chat', 'premium');
    expect(premiumChatConfig.modelName).toBe('claude-sonnet-4-6');
    expect(premiumChatConfig.inputCostPerMillion).toBe(3.00);

    // Throws on unknown task
    expect(() => router.getModel('unknown-task', 'cheap')).toThrowError(/Unknown task/);

    // Throws on unknown tier
    expect(() => router.getModel('chat', 'unknown-tier')).toThrowError(/Unknown tier/);
  });

  it('estimateCost calculates correctly', () => {
    const testConfig: ModelConfig = {
      modelName: 'test-model',
      inputCostPerMillion: 1.50,
      outputCostPerMillion: 5.00
    };

    // 1M input, 1M output -> 1.50 + 5.00 = 6.50
    const cost1 = router.estimateCost(testConfig, 1_000_000, 1_000_000);
    expect(cost1).toBeCloseTo(6.50, 5);

    // 500k input, 100k output -> 0.75 + 0.50 = 1.25
    const cost2 = router.estimateCost(testConfig, 500_000, 100_000);
    expect(cost2).toBeCloseTo(1.25, 5);

    // 0 tokens -> 0.00
    const cost3 = router.estimateCost(testConfig, 0, 0);
    expect(cost3).toBe(0);
  });
});

describe('AnthropicProvider', () => {
  const apiKey = 'test-anthropic-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('complete normalizes response correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'Hello there, how can I help you today?'
          }
        ],
        usage: {
          input_tokens: 150,
          output_tokens: 45
        }
      })
    });

    const provider = createAnthropicProvider(apiKey);
    const result = await provider.complete({
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: 'hi' }],
      temperature: 0.7,
      systemPrompt: 'You are a helpful assistant.'
    });

    expect(result).toEqual({
      text: 'Hello there, how can I help you today?',
      usage: {
        inputTokens: 150,
        outputTokens: 45
      }
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }),
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'hi' }],
        temperature: 0.7,
        system: 'You are a helpful assistant.'
      })
    }));
  });
});

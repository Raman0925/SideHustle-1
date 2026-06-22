import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ModelRouter, createModelRouter } from '../model-router.js';
import { CostTracker, createCostTracker, CostMetrics } from '../cost-tracker.js';
import { StreamingProvider, createStreamingProvider } from '../streaming-provider.js';

describe('CostTracker', () => {
  let router: ModelRouter;
  let tracker: CostTracker;

  beforeEach(() => {
    router = createModelRouter();
    tracker = createCostTracker(router);
  });

  it('CostTracker.track calculates cost correctly', () => {
    // chat cheap uses claude-haiku-4-5 (0.80 input, 4.00 output per million)
    // 500k input tokens -> 0.40
    // 250k output tokens -> 1.00
    // total cost -> 1.40
    const metrics = tracker.track('customer_chat', 'chat', 'cheap', {
      inputTokens: 500_000,
      outputTokens: 250_000
    });

    expect(metrics).toEqual({
      feature: 'customer_chat',
      task: 'chat',
      tier: 'cheap',
      inputTokens: 500_000,
      outputTokens: 250_000,
      cost: 1.40
    });
  });

  it('CostTracker.summarize aggregates by feature correctly', () => {
    const metrics: CostMetrics[] = [
      {
        feature: 'chat_bot',
        task: 'chat',
        tier: 'cheap',
        inputTokens: 100_000,
        outputTokens: 50_000,
        cost: 0.28
      },
      {
        feature: 'summarizer',
        task: 'chat',
        tier: 'premium',
        inputTokens: 200_000,
        outputTokens: 100_000,
        cost: 2.10
      },
      {
        feature: 'chat_bot',
        task: 'chat',
        tier: 'premium',
        inputTokens: 100_000,
        outputTokens: 50_000,
        cost: 1.05
      }
    ];

    const summary = tracker.summarize(metrics);

    expect(summary.totalCost).toBeCloseTo(3.43, 5);
    expect(summary.totalTokens).toEqual({
      input: 400_000,
      output: 200_000
    });

    // Verify breakdown by feature
    expect(summary.byFeature['chat_bot']).toEqual({
      cost: 1.33,
      inputTokens: 200_000,
      outputTokens: 100_000
    });

    expect(summary.byFeature['summarizer']).toEqual({
      cost: 2.10,
      inputTokens: 200_000,
      outputTokens: 100_000
    });
  });

  it('CostTracker.summarize returns an empty report when no metrics are provided', () => {
    const summary = tracker.summarize([]);
    expect(summary.totalCost).toBe(0);
    expect(summary.totalTokens).toEqual({ input: 0, output: 0 });
    expect(summary.byFeature).toEqual({});
  });
});

describe('StreamingProvider', () => {
  const apiKey = 'test-streaming-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('StreamingProvider calls onChunk for each delta', async () => {
    const lines = [
      'data: {"type": "message_start", "message": {"usage": {"input_tokens": 120}}}\n',
      'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": "Streaming"}}\n',
      'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": " is"}}\n',
      'data: {"type": "content_block_delta", "delta": {"type": "text_delta", "text": " fun!"}}\n',
      'data: {"type": "message_delta", "usage": {"output_tokens": 45}}\n'
    ];

    const mockStream = {
      [Symbol.asyncIterator]: async function* () {
        for (const line of lines) {
          yield line;
        }
      }
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      body: mockStream
    });

    const provider = createStreamingProvider(apiKey);
    const chunks: string[] = [];
    let finalUsage: { inputTokens: number; outputTokens: number } | null = null;

    await provider.streamComplete(
      {
        model: 'claude-haiku-4-5',
        messages: [{ role: 'user', content: 'test stream' }]
      },
      (chunk) => {
        chunks.push(chunk);
      },
      (usage) => {
        finalUsage = usage;
      }
    );

    expect(chunks).toEqual(['Streaming', ' is', ' fun!']);
    expect(finalUsage).toEqual({
      inputTokens: 120,
      outputTokens: 45
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 4096,
        messages: [{ role: 'user', content: 'test stream' }],
        stream: true
      })
    }));
  });

  it('StreamingProvider throws error when API response is not OK', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      text: async () => 'Error payload'
    });

    const provider = createStreamingProvider(apiKey);
    await expect(
      provider.streamComplete(
        {
          model: 'claude-haiku-4-5',
          messages: [{ role: 'user', content: 'test stream' }]
        },
        () => {},
        () => {}
      )
    ).rejects.toThrowError(/Anthropic API request failed: 500 Internal Server Error - Error payload/);
  });
});

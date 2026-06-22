import { ModelRouter, CompletionParams, CompletionResult, ModelProvider } from './model-router.js';
import { StreamingProvider } from './streaming-provider.js';
import { CostTracker, CostMetrics } from './cost-tracker.js';

export interface AIService {
  getTrackedCosts(): CostMetrics[];
  complete(
    params: CompletionParams,
    metadata: { feature: string; task: string; tier: string },
    options?: { maxRetries?: number; initialDelayMs?: number }
  ): Promise<CompletionResult & { costMetrics: CostMetrics }>;
  stream(
    params: CompletionParams,
    metadata: { feature: string; task: string; tier: string },
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  ): Promise<void>;
}

export function createAIService(
  provider: ModelProvider,
  streaming: StreamingProvider,
  costTracker: CostTracker,
  modelRouter: ModelRouter
): AIService {
  const trackedCosts: CostMetrics[] = [];

  /**
   * Retrieves all tracked costs recorded during the lifecycle of this service.
   */
  function getTrackedCosts(): CostMetrics[] {
    return trackedCosts;
  }

  /**
   * Checks whether the error is non-retryable.
   * Invalid API keys and HTTP 400 Bad Requests are not retried.
   */
  function isNonRetryableError(error: any): boolean {
    const msg = error?.message || String(error);
    
    // HTTP 400 Bad Request
    if (msg.includes('400')) {
      return true;
    }
    
    // Unauthorized / API key configuration issues
    if (
      msg.toLowerCase().includes('api key') ||
      msg.toLowerCase().includes('unauthorized') ||
      msg.toLowerCase().includes('invalid key') ||
      msg.includes('401')
    ) {
      return true;
    }
    
    return false;
  }

  /**
   * Generates a model completion.
   * Automatically retries on temporary failure with exponential backoff.
   */
  async function complete(
    params: CompletionParams,
    metadata: { feature: string; task: string; tier: string },
    options: { maxRetries?: number; initialDelayMs?: number } = {}
  ): Promise<CompletionResult & { costMetrics: CostMetrics }> {
    const maxRetries = options.maxRetries ?? 3;
    const initialDelayMs = options.initialDelayMs ?? 1000;
    
    let attempt = 0;
    while (true) {
      try {
        const result = await provider.complete(params);
        
        // Track cost
        const costMetrics = costTracker.track(
          metadata.feature,
          metadata.task,
          metadata.tier,
          result.usage
        );
        trackedCosts.push(costMetrics);
        
        return {
          ...result,
          costMetrics
        };
      } catch (err: any) {
        attempt++;
        if (attempt > maxRetries || isNonRetryableError(err)) {
          throw err;
        }
        
        // Exponential backoff
        const delay = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Delegates streaming completion.
   * Tracks final token costs when the stream finishes.
   */
  async function stream(
    params: CompletionParams,
    metadata: { feature: string; task: string; tier: string },
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  ): Promise<void> {
    await streaming.streamComplete(
      params,
      onChunk,
      (usage) => {
        // Track cost
        const costMetrics = costTracker.track(
          metadata.feature,
          metadata.task,
          metadata.tier,
          usage
        );
        trackedCosts.push(costMetrics);
        
        // Delegate to original callback
        onDone(usage);
      }
    );
  }

  return {
    getTrackedCosts,
    complete,
    stream
  };
}

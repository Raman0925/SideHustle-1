export interface ModelConfig {
  modelName: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface CompletionParams {
  model: string;
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface CompletionResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface ModelProvider {
  complete(params: CompletionParams): Promise<CompletionResult>;
  embed(text: string): Promise<number[]>;
}

const MODELS = {
  haiku: {
    modelName: 'claude-haiku-4-5',
    inputCostPerMillion: 0.80,
    outputCostPerMillion: 4.00
  },
  sonnet: {
    modelName: 'claude-sonnet-4-6',
    inputCostPerMillion: 3.00,
    outputCostPerMillion: 15.00
  }
};

export class ModelRouter {
  private static readonly registry: Record<string, Record<string, ModelConfig>> = {
    chat: {
      cheap: MODELS.haiku,
      premium: MODELS.sonnet
    },
    classification: {
      cheap: MODELS.haiku,
      premium: MODELS.sonnet
    },
    extraction: {
      cheap: MODELS.haiku,
      premium: MODELS.sonnet
    },
    // Filing pipeline:
    // - cheap  = Haiku  → WATCH tier classification assist (fast, low cost)
    // - premium = Sonnet → MATERIAL filing summarization (quality matters)
    filing: {
      cheap: MODELS.haiku,
      premium: MODELS.sonnet
    }
  };

  /**
   * Returns correct model configuration for a task and tier.
   * Throws if an unknown task or tier is requested.
   */
  public getModel(task: string, tier: string): ModelConfig {
    const taskConfig = ModelRouter.registry[task];
    if (!taskConfig) {
      throw new Error(`Unknown task: ${task}`);
    }
    const config = taskConfig[tier];
    if (!config) {
      throw new Error(`Unknown tier: ${tier} for task: ${task}`);
    }
    return config;
  }

  /**
   * Estimates cost given token counts.
   */
  public estimateCost(
    config: ModelConfig,
    inputTokens: number,
    outputTokens: number
  ): number {
    const inputCost = (inputTokens / 1_000_000) * config.inputCostPerMillion;
    const outputCost = (outputTokens / 1_000_000) * config.outputCostPerMillion;
    return inputCost + outputCost;
  }
}

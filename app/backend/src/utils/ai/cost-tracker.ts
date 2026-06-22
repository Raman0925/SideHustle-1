import { ModelRouter, ModelConfig } from './model-router.js';

export interface CostMetrics {
  feature: string;
  task: string;
  tier: string;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface DailyCostReport {
  totalCost: number;
  totalTokens: {
    input: number;
    output: number;
  };
  byFeature: Record<string, {
    cost: number;
    inputTokens: number;
    outputTokens: number;
  }>;
}

export interface CostTracker {
  track(
    feature: string,
    task: string,
    tier: string,
    usage: { inputTokens: number; outputTokens: number }
  ): CostMetrics;
  summarize(metrics: CostMetrics[]): DailyCostReport;
}

export function createCostTracker(modelRouter: ModelRouter): CostTracker {
  /**
   * Calculates the cost based on token usage and configuration, returning a CostMetrics object.
   */
  function track(
    feature: string,
    task: string,
    tier: string,
    usage: { inputTokens: number; outputTokens: number }
  ): CostMetrics {
    const config = modelRouter.getModel(task, tier);
    const cost = modelRouter.estimateCost(config, usage.inputTokens, usage.outputTokens);
    return {
      feature,
      task,
      tier,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cost
    };
  }

  /**
   * Aggregates cost metrics into a daily summary report.
   */
  function summarize(metrics: CostMetrics[]): DailyCostReport {
    let totalCost = 0;
    let input = 0;
    let output = 0;
    const byFeature: Record<string, { cost: number; inputTokens: number; outputTokens: number }> = {};

    for (const m of metrics) {
      totalCost += m.cost;
      input += m.inputTokens;
      output += m.outputTokens;

      if (!byFeature[m.feature]) {
        byFeature[m.feature] = { cost: 0, inputTokens: 0, outputTokens: 0 };
      }
      byFeature[m.feature].cost += m.cost;
      byFeature[m.feature].inputTokens += m.inputTokens;
      byFeature[m.feature].outputTokens += m.outputTokens;
    }

    return {
      totalCost,
      totalTokens: {
        input,
        output
      },
      byFeature
    };
  }

  return {
    track,
    summarize
  };
}

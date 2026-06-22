import { BudgetMetrics, contextBudget, ValidationResult } from './types.js';
import { encode, decode } from 'gpt-tokenizer';

export interface TokenBudgetManager {
    getTokenCount(text: string): number;
    validateBudget(components: Record<string, string>): ValidationResult;
    truncateToFit(text: string, maxTokens: number): string;
    getMetrics(components: Record<string, string>): BudgetMetrics;
}

export function createTokenBudgetManager(budget: contextBudget): TokenBudgetManager {
    function getTokenCount(text: string): number {
        if (!text) return 0;
        return encode(text).length;
    }

    function validateBudget(
        components: Record<string, string>
    ): ValidationResult {

        const violations = [];

        for (const [componentName, text] of Object.entries(components)) {
            const used = getTokenCount(text);
            const limit = budget[componentName as keyof contextBudget] ?? 0;

            if (used > limit) {
                violations.push({
                    component: componentName,
                    used,
                    limit,
                    over: used - limit   
                });
            }
        }

        return {
            valid: violations.length === 0,  
            violations
        };
    }
    
    function truncateToFit(text: string, maxTokens: number): string {
        const tokens = encode(text);

        if (tokens.length <= maxTokens) return text;

        const truncated = tokens.slice(0, maxTokens);
        return decode(truncated);
    }

    function getMetrics(components: Record<string, string>): BudgetMetrics {
        const utilization: Record<string, number> = {};
        let totalUsed = 0;
        let totalBudget = 0;

        for (const [key, limit] of Object.entries(budget)) {
            totalBudget += limit;
            const text = components[key] ?? '';
            const used = getTokenCount(text);
            totalUsed += used;

            utilization[key] = limit > 0 ? Number(((used / limit) * 100).toFixed(2)) : 0;
        }

        const overallUtilization = totalBudget > 0 ? Number(((totalUsed / totalBudget) * 100).toFixed(2)) : 0;

        return {
            utilization,
            totalUsed,
            totalBudget,
            overallUtilization
        };
    }

    return {
        getTokenCount,
        validateBudget,
        truncateToFit,
        getMetrics
    };
}
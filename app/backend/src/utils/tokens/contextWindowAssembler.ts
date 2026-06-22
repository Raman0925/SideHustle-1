import { TokenBudgetManager } from './tokenBudgetManager.js';
import { Message, AssembledContext, contextBudget } from './types.js';

export interface ContextWindowAssembler {
    getBudget(): contextBudget;
    assemble(
        systemPrompt: string,
        history: Message[],
        currentMessage: string,
        documents: string[]
    ): AssembledContext;
}

export function createContextWindowAssembler(
    budget: contextBudget,
    tokenManager: TokenBudgetManager
): ContextWindowAssembler {
    function getBudget(): contextBudget {
        return budget;
    }

    function fitHistory(messages: Message[], budgetTokens: number, manager: TokenBudgetManager) {
        const selected: Message[] = [];
        let used = 0;

        // start from the most recent message and go backwards
        for (const msg of [...messages].reverse()) {
            const tokens = manager.getTokenCount(msg.content);

            // if adding this message would exceed budget, stop
            if (used + tokens > budgetTokens) break;

            selected.unshift(msg); // add to front to keep order correct
            used += tokens;
        }

        return { selected, used };
    }

    function fitDocuments(documents: string[], budgetTokens: number, manager: TokenBudgetManager) {
        const fitted: string[] = [];
        let used = 0;
        let skipped = 0;

        for (const doc of documents) {
            const tokens = manager.getTokenCount(doc);

            // if this doc fits, include it
            if (used + tokens <= budgetTokens) {
                fitted.push(doc);
                used += tokens;
            } else {
                // if it doesn't fit, skip it
                skipped++;
            }
        }

        return { fitted, used, skipped };
    }

    function assemble(
        systemPrompt: string,
        history: Message[],
        currentMessage: string,
        documents: string[]
    ): AssembledContext {
        const systemTokens = tokenManager.getTokenCount(systemPrompt);
        if (systemTokens > budget.systemPrompt) {
            throw new Error(`System prompt exceeds budget: ${systemTokens} > ${budget.systemPrompt}`);
        }

        const currentTokens = tokenManager.getTokenCount(currentMessage);
        if (currentTokens > budget.userMessage) {
            throw new Error(`Current message exceeds budget: ${currentTokens} > ${budget.userMessage}`);
        }

        const currentHistory = fitHistory(history, budget.conversationHistory, tokenManager);
        const currentDocuments = fitDocuments(documents, budget.retrievedDocuments, tokenManager);
        const totalTokens = systemTokens + currentHistory.used + currentTokens + currentDocuments.used;

        return {
            systemPrompt: systemPrompt,
            messages: currentHistory.selected.concat({ role: 'user', content: currentMessage }),
            totalTokens: totalTokens,
            dropped: {
                historyMessagesDropped: history.length - currentHistory.selected.length,
                documentsSkipped: currentDocuments.skipped,
            }
        };
    }

    return {
        getBudget,
        assemble
    };
}   
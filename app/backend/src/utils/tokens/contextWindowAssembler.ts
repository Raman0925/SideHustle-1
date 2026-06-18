import { TokenBudgetManager } from './tokenBudgetManager.js';
import { Message, AssembledContext, contextBudget } from './types.js';

export class ContextWindowAssembler {
    constructor(
        private readonly budget: contextBudget,
        private readonly tokenManager: TokenBudgetManager
    ) { }

    public getBudget(): contextBudget {
        return this.budget;
    }

    public assemble(
        systemPrompt: string,
        history: Message[],
        currentMessage: string,
        documents: string[]
    ): AssembledContext {
        const systemTokens = this.tokenManager.getTokenCount(systemPrompt);
        if (systemTokens > this.budget.systemPrompt) {
            throw new Error(`System prompt exceeds budget: ${systemTokens} > ${this.budget.systemPrompt}`);
        }

        const currentTokens = this.tokenManager.getTokenCount(currentMessage);
        if (currentTokens > this.budget.userMessage) {
            throw new Error(`Current message exceeds budget: ${currentTokens} > ${this.budget.userMessage}`);
        }

        const currentHistory = this.fitHistory(history, this.budget.conversationHistory, this.tokenManager);
        const currentDocuments = this.fitDocuments(documents, this.budget.retrievedDocuments, this.tokenManager);
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
    private fitHistory(messages: Message[], budgetTokens: number, manager: TokenBudgetManager) {
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

    private fitDocuments(documents: string[], budgetTokens: number, manager: TokenBudgetManager) {
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
}   
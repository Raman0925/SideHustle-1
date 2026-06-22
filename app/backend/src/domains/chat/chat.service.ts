import postgres from 'postgres';
import { HybridRetriever, createHybridRetriever } from '../../utils/vector/hybrid-retriever.js';
import { VectorStore, createVectorStore } from '../../utils/vectorStore/vectorStore.js';
import { EmbeddingService, createEmbeddingService } from '../../utils/embeddings/embeddingService.js';
import { Reranker, createReranker } from '../../utils/vector/reranker.js';
import { ContextWindowAssembler, createContextWindowAssembler } from '../../utils/tokens/contextWindowAssembler.js';
import { TokenBudgetManager, createTokenBudgetManager } from '../../utils/tokens/tokenBudgetManager.js';
import { ModelRouter, createModelRouter } from '../../utils/ai/model-router.js';
import { AnthropicProvider, createAnthropicProvider } from '../../utils/ai/anthropic-provider.js';
import { StreamingProvider, createStreamingProvider } from '../../utils/ai/streaming-provider.js';
import { Message, contextBudget } from '../../utils/tokens/types.js';
import { customerSupportSystemPrompt } from '../../utils/prompts/prompt-manager.js';
import { DEFAULT_CHAT_BUDGET, DEFAULT_COMPANY_NAME, DEFAULT_SUPPORT_EMAIL } from './chat.constant.js';
import { mapTierToModelRouterTier } from './chat.util.js';

export interface ChatService {
  sendMessage(
    message: string,
    history: Message[],
    tier?: 'fast' | 'balanced' | 'powerful'
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }>;

  streamMessage(
    message: string,
    history: Message[],
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void,
    tier?: 'fast' | 'balanced' | 'powerful'
  ): Promise<void>;

  streamMessageIterable(
    message: string,
    history: Message[],
    tier?: 'fast' | 'balanced' | 'powerful'
  ): AsyncGenerator<string | { data: any; event: string }, void, unknown>;
}

export function createChatService(
  retriever: HybridRetriever,
  assembler: ContextWindowAssembler,
  tokenManager: TokenBudgetManager,
  modelRouter: ModelRouter,
  provider: AnthropicProvider,
  streaming: StreamingProvider
): ChatService {
  async function sendMessage(
    message: string,
    history: Message[],
    tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    // 1. Retrieve documents matching the user query
    const searchResults = await retriever.retrieve(message);
    const documents = searchResults.map(r => r.content);

    // 2. Perform budget token counts of retrieved documents to mimic assembler behavior
    const budget = assembler.getBudget();
    const fittedDocs: string[] = [];
    let usedTokens = 0;
    for (const doc of documents) {
      const tokens = tokenManager.getTokenCount(doc);
      if (usedTokens + tokens <= budget.retrievedDocuments) {
        fittedDocs.push(doc);
        usedTokens += tokens;
      }
    }

    // 3. Render base system prompt
    const baseSystemPrompt = customerSupportSystemPrompt
      .replace('{{companyName}}', DEFAULT_COMPANY_NAME)
      .replace('{{supportEmail}}', DEFAULT_SUPPORT_EMAIL);

    // 4. Call ContextWindowAssembler to validate limits and calculate overall token counts
    const assembled = assembler.assemble(baseSystemPrompt, history, message, documents);

    // 5. Replace sources placeholder with fitted documents in the final system prompt
    const sourcesText = fittedDocs.join('\n\n');
    const finalSystemPrompt = baseSystemPrompt.replace('{{sources}}', sourcesText);

    // 6. Get model configuration from router
    const routerTier = mapTierToModelRouterTier(tier);
    const modelConfig = modelRouter.getModel('chat', routerTier);

    // 7. Execute provider call
    const result = await provider.complete({
      model: modelConfig.modelName,
      messages: assembled.messages,
      systemPrompt: finalSystemPrompt
    });

    return result;
  }

  async function streamMessage(
    message: string,
    history: Message[],
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void,
    tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
  ): Promise<void> {
    // 1. Retrieve documents matching the user query
    const searchResults = await retriever.retrieve(message);
    const documents = searchResults.map(r => r.content);

    // 2. Perform budget token counts of retrieved documents to mimic assembler behavior
    const budget = assembler.getBudget();
    const fittedDocs: string[] = [];
    let usedTokens = 0;
    for (const doc of documents) {
      const tokens = tokenManager.getTokenCount(doc);
      if (usedTokens + tokens <= budget.retrievedDocuments) {
        fittedDocs.push(doc);
        usedTokens += tokens;
      }
    }

    // 3. Render base system prompt
    const baseSystemPrompt = customerSupportSystemPrompt
      .replace('{{companyName}}', DEFAULT_COMPANY_NAME)
      .replace('{{supportEmail}}', DEFAULT_SUPPORT_EMAIL);

    // 4. Call ContextWindowAssembler to validate limits and calculate overall token counts
    const assembled = assembler.assemble(baseSystemPrompt, history, message, documents);

    // 5. Replace sources placeholder with fitted documents in the final system prompt
    const sourcesText = fittedDocs.join('\n\n');
    const finalSystemPrompt = baseSystemPrompt.replace('{{sources}}', sourcesText);

    // 6. Get model configuration from router
    const routerTier = mapTierToModelRouterTier(tier);
    const modelConfig = modelRouter.getModel('chat', routerTier);

    // 7. Execute streaming provider call
    await streaming.streamComplete(
      {
        model: modelConfig.modelName,
        messages: assembled.messages,
        systemPrompt: finalSystemPrompt
      },
      onChunk,
      onDone
    );
  }

  /**
   * Helper to convert callback-based streaming into an AsyncGenerator.
   * Encapsulates the SSE message queuing and formatting business logic.
   */
  async function *streamMessageIterable(
    message: string,
    history: Message[],
    tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
  ): AsyncGenerator<string | { data: any; event: string }, void, unknown> {
    const queue: Array<string | { data: any; event: string } | null> = [];
    let resolveNext: (() => void) | null = null;

    const push = (item: string | { data: any; event: string } | null) => {
      queue.push(item);
      if (resolveNext) {
        resolveNext();
        resolveNext = null;
      }
    };

    // Trigger asynchronous message stream in the background
    streamMessage(
      message,
      history,
      (chunk) => push(chunk),
      (usage) => {
        push({ data: usage, event: 'done' });
        push(null); // Terminate the generator loop
      },
      tier
    ).catch((err) => {
      push({ data: JSON.stringify({ error: err.message }), event: 'error' });
      push(null);
    });

    while (true) {
      if (queue.length === 0) {
        await new Promise<void>((resolve) => {
          resolveNext = resolve;
        });
      }
      const item = queue.shift();
      if (item === null || item === undefined) {
        break; // Stop generator cleanly
      }
      yield item;
    }
  }

  return {
    sendMessage,
    streamMessage,
    streamMessageIterable
  };
}

// Global Singleton Initialization for exported domain functions
const db = postgres(process.env.DATABASE_URL || '', {
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const vectorStore = createVectorStore(db);
const embeddingService = createEmbeddingService('text-embedding-3-small');
const reranker = createReranker(process.env.COHERE_API_KEY || 'dummy-cohere-key');
const retriever = createHybridRetriever(vectorStore, embeddingService, reranker, db);

const tokenManager = createTokenBudgetManager(DEFAULT_CHAT_BUDGET);
const assembler = createContextWindowAssembler(DEFAULT_CHAT_BUDGET, tokenManager);
const modelRouter = createModelRouter();
const provider = createAnthropicProvider(process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key');
const streaming = createStreamingProvider(process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key');

export const chatService = createChatService(
  retriever,
  assembler,
  tokenManager,
  modelRouter,
  provider,
  streaming
);

// Standalone service functions mapped to singleton instance
export async function sendMessage(
  message: string,
  history: Message[],
  tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
) {
  return chatService.sendMessage(message, history, tier);
}

export async function streamMessage(
  message: string,
  history: Message[],
  onChunk: (text: string) => void,
  onDone: (usage: { inputTokens: number; outputTokens: number }) => void,
  tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
) {
  return chatService.streamMessage(message, history, onChunk, onDone, tier);
}

export function streamMessageIterable(
  message: string,
  history: Message[],
  tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
) {
  return chatService.streamMessageIterable(message, history, tier);
}

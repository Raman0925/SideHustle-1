import postgres from 'postgres';
import { HybridRetriever } from '../../utils/vector/hybrid-retriever.js';
import { VectorStore } from '../../utils/vectorStore/vectorStore.js';
import { EmbeddingService } from '../../utils/embeddings/embeddingService.js';
import { Reranker } from '../../utils/vector/reranker.js';
import { ContextWindowAssembler } from '../../utils/tokens/contextWindowAssembler.js';
import { TokenBudgetManager } from '../../utils/tokens/tokenBudgetManager.js';
import { ModelRouter } from '../../utils/ai/model-router.js';
import { AnthropicProvider } from '../../utils/ai/anthropic-provider.js';
import { StreamingProvider } from '../../utils/ai/streaming-provider.js';
import { Message, contextBudget } from '../../utils/tokens/types.js';
import { customerSupportSystemPrompt } from '../../utils/prompts/prompt-manager.js';
import { DEFAULT_CHAT_BUDGET, DEFAULT_COMPANY_NAME, DEFAULT_SUPPORT_EMAIL } from './chat.constant.js';
import { mapTierToModelRouterTier } from './chat.util.js';

export class ChatService {
  constructor(
    private readonly retriever: HybridRetriever,
    private readonly assembler: ContextWindowAssembler,
    private readonly tokenManager: TokenBudgetManager,
    private readonly modelRouter: ModelRouter,
    private readonly provider: AnthropicProvider,
    private readonly streaming: StreamingProvider
  ) {}

  public async sendMessage(
    message: string,
    history: Message[],
    tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
  ): Promise<{ text: string; usage: { inputTokens: number; outputTokens: number } }> {
    // 1. Retrieve documents matching the user query
    const searchResults = await this.retriever.retrieve(message);
    const documents = searchResults.map(r => r.content);

    // 2. Perform budget token counts of retrieved documents to mimic assembler behavior
    const budget = (this.assembler as any).budget;
    const fittedDocs: string[] = [];
    let usedTokens = 0;
    for (const doc of documents) {
      const tokens = this.tokenManager.getTokenCount(doc);
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
    const assembled = this.assembler.assemble(baseSystemPrompt, history, message, documents);

    // 5. Replace sources placeholder with fitted documents in the final system prompt
    const sourcesText = fittedDocs.join('\n\n');
    const finalSystemPrompt = baseSystemPrompt.replace('{{sources}}', sourcesText);

    // 6. Get model configuration from router
    const routerTier = mapTierToModelRouterTier(tier);
    const modelConfig = this.modelRouter.getModel('chat', routerTier);

    // 7. Execute provider call
    const result = await this.provider.complete({
      model: modelConfig.modelName,
      messages: assembled.messages,
      systemPrompt: finalSystemPrompt
    });

    return result;
  }

  public async streamMessage(
    message: string,
    history: Message[],
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void,
    tier: 'fast' | 'balanced' | 'powerful' = 'balanced'
  ): Promise<void> {
    // 1. Retrieve documents matching the user query
    const searchResults = await this.retriever.retrieve(message);
    const documents = searchResults.map(r => r.content);

    // 2. Perform budget token counts of retrieved documents to mimic assembler behavior
    const budget = (this.assembler as any).budget;
    const fittedDocs: string[] = [];
    let usedTokens = 0;
    for (const doc of documents) {
      const tokens = this.tokenManager.getTokenCount(doc);
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
    const assembled = this.assembler.assemble(baseSystemPrompt, history, message, documents);

    // 5. Replace sources placeholder with fitted documents in the final system prompt
    const sourcesText = fittedDocs.join('\n\n');
    const finalSystemPrompt = baseSystemPrompt.replace('{{sources}}', sourcesText);

    // 6. Get model configuration from router
    const routerTier = mapTierToModelRouterTier(tier);
    const modelConfig = this.modelRouter.getModel('chat', routerTier);

    // 7. Execute streaming provider call
    await this.streaming.streamComplete(
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
  public async *streamMessageIterable(
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
    this.streamMessage(
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
}

// Global Singleton Initialization for exported domain functions
const db = postgres(process.env.DATABASE_URL || '', {
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

const vectorStore = new VectorStore(db);
const embeddingService = new EmbeddingService('text-embedding-3-small');
const reranker = new Reranker(process.env.COHERE_API_KEY || 'dummy-cohere-key');
const retriever = new HybridRetriever(vectorStore, embeddingService, reranker, db);

const tokenManager = new TokenBudgetManager(DEFAULT_CHAT_BUDGET);
const assembler = new ContextWindowAssembler(DEFAULT_CHAT_BUDGET, tokenManager);
const modelRouter = new ModelRouter();
const provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key');
const streaming = new StreamingProvider(process.env.ANTHROPIC_API_KEY || 'dummy-anthropic-key');

export const chatService = new ChatService(
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

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ChatService, createChatService } from '../chat.service.js';
import { Message } from '../../../utils/tokens/types.js';

describe('ChatService', () => {
  let retriever: any;
  let assembler: any;
  let tokenManager: any;
  let modelRouter: any;
  let provider: any;
  let streaming: any;
  let service: ChatService;

  beforeEach(() => {
    retriever = {
      retrieve: vi.fn().mockResolvedValue([
        { content: 'Doc content 1' },
        { content: 'Doc content 2' }
      ])
    };
    assembler = {
      getBudget: vi.fn().mockReturnValue({
        systemPrompt: 2000,
        toolDefinitions: 0,
        retrievedDocuments: 4000,
        conversationHistory: 8000,
        userMessage: 2000,
        responseBudget: 4000
      }),
      assemble: vi.fn().mockReturnValue({
        systemPrompt: 'System Prompt',
        messages: [{ role: 'user', content: 'hello' }],
        totalTokens: 100,
        dropped: { historyMessagesDropped: 0, documentsSkipped: 0 }
      })
    };
    tokenManager = {
      getTokenCount: vi.fn().mockReturnValue(10)
    };
    modelRouter = {
      getModel: vi.fn().mockReturnValue({
        modelName: 'claude-haiku-4-5',
        inputCostPerMillion: 0.8,
        outputCostPerMillion: 4.0
      })
    };
    provider = {
      complete: vi.fn().mockResolvedValue({
        text: 'Mocked response from Claude',
        usage: { inputTokens: 50, outputTokens: 25 }
      })
    };
    streaming = {
      streamComplete: vi.fn()
    };

    service = createChatService(
      retriever,
      assembler,
      tokenManager,
      modelRouter,
      provider,
      streaming
    );
  });

  it('sendMessage retrieves chunks, formats context, and calls provider returning text and usage', async () => {
    const history: Message[] = [];
    const result = await service.sendMessage('hello', history, 'balanced');

    expect(retriever.retrieve).toHaveBeenCalledWith('hello');
    expect(tokenManager.getTokenCount).toHaveBeenCalledTimes(2); // for two retrieved docs
    expect(assembler.assemble).toHaveBeenCalled();
    expect(modelRouter.getModel).toHaveBeenCalledWith('chat', 'cheap');
    expect(provider.complete).toHaveBeenCalled();
    expect(result).toEqual({
      text: 'Mocked response from Claude',
      usage: { inputTokens: 50, outputTokens: 25 }
    });
  });

  it('streamMessage calls streaming provider with correct params', async () => {
    streaming.streamComplete.mockImplementation(
      async (params: any, onChunk: any, onDone: any) => {
        onChunk('Hello ');
        onChunk('world');
        onDone({ inputTokens: 30, outputTokens: 10 });
      }
    );

    const chunks: string[] = [];
    let finalUsage: any = null;

    await service.streamMessage(
      'test question',
      [],
      (chunk) => chunks.push(chunk),
      (usage) => { finalUsage = usage; },
      'fast'
    );

    expect(chunks).toEqual(['Hello ', 'world']);
    expect(finalUsage).toEqual({ inputTokens: 30, outputTokens: 10 });
    expect(streaming.streamComplete).toHaveBeenCalledOnce();
  });
});

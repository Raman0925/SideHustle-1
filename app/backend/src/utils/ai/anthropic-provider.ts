import { ModelProvider, CompletionParams, CompletionResult } from './model-router.js';
import { EmbeddingService, createEmbeddingService } from '../embeddings/embeddingService.js';

export interface AnthropicProvider extends ModelProvider {}

export function createAnthropicProvider(apiKey: string): AnthropicProvider {
  const embeddingService = createEmbeddingService('text-embedding-3-small');

  /**
   * Calls the Anthropic Messages API and normalizes the response to CompletionResult.
   */
  async function complete(params: CompletionParams): Promise<CompletionResult> {
    if (!apiKey) {
      throw new Error('Anthropic API key is not defined');
    }

    const requestBody: Record<string, unknown> = {
      model: params.model,
      max_tokens: params.maxTokens ?? 4096,
      messages: params.messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }))
    };

    if (params.temperature !== undefined) {
      requestBody.temperature = params.temperature;
    }

    if (params.systemPrompt !== undefined) {
      requestBody.system = params.systemPrompt;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errBody}`);
    }

    const responseData = (await response.json()) as {
      content: Array<{
        type: string;
        text?: string;
      }>;
      usage?: {
        input_tokens: number;
        output_tokens: number;
      };
    };

    const textBlock = responseData.content.find(block => block.type === 'text');
    const text = textBlock?.text || '';

    const inputTokens = responseData.usage?.input_tokens ?? 0;
    const outputTokens = responseData.usage?.output_tokens ?? 0;

    return {
      text,
      usage: {
        inputTokens,
        outputTokens
      }
    };
  }

  /**
   * Generates embedding vector for a text.
   */
  async function embed(text: string): Promise<number[]> {
    return embeddingService.embed(text);
  }

  return {
    complete,
    embed
  };
}

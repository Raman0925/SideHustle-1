import { CompletionParams } from './model-router.js';

export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<TextContentBlock | ToolUseBlock | ToolResultBlock>;
}

function processSSELine(
  line: string,
  onChunk: (text: string) => void
): { inputTokens?: number; outputTokens?: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('data:')) return null;

  const jsonStr = trimmed.slice(5).trim();
  if (jsonStr === '[DONE]') return null;

  try {
    const data = JSON.parse(jsonStr);
    
    if (data.type === 'message_start' && data.message?.usage) {
      return { inputTokens: data.message.usage.input_tokens };
    }
    
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      onChunk(data.delta.text);
    }
    
    if (data.type === 'message_delta' && data.usage) {
      return { outputTokens: data.usage.output_tokens };
    }
  } catch (err) {
    // Ignore invalid JSON chunks gracefully
  }
  return null;
}

export interface StreamingProvider {
  streamComplete(
    params: CompletionParams,
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  ): Promise<void>;
}

export function createStreamingProvider(apiKey: string): StreamingProvider {
  /**
   * Calls the Anthropic Messages streaming API, calling onChunk for text deltas,
   * and onDone with final token usage stats when streaming concludes.
   */
  async function streamComplete(
    params: CompletionParams,
    onChunk: (text: string) => void,
    onDone: (usage: { inputTokens: number; outputTokens: number }) => void
  ): Promise<void> {
    if (!apiKey) {
      throw new Error('Anthropic API key is not defined');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: params.model,
        max_tokens: params.maxTokens ?? 4096,
        messages: params.messages.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        system: params.systemPrompt,
        temperature: params.temperature,
        stream: true
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errBody}`);
    }

    if (!response.body) {
      throw new Error('No response body received for streaming');
    }

    let inputTokens = 0;
    let outputTokens = 0;

    const reader = response.body.getReader ? response.body.getReader() : null;

    if (reader) {
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const result = processSSELine(line, onChunk);
          if (result) {
            if (result.inputTokens !== undefined) inputTokens = result.inputTokens;
            if (result.outputTokens !== undefined) outputTokens = result.outputTokens;
          }
        }
      }
    } else {
      const stream = response.body as any;
      if (typeof stream[Symbol.asyncIterator] === 'function') {
        const decoder = new TextDecoder();
        let buffer = '';

        for await (const chunk of stream) {
          buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk);
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const result = processSSELine(line, onChunk);
            if (result) {
              if (result.inputTokens !== undefined) inputTokens = result.inputTokens;
              if (result.outputTokens !== undefined) outputTokens = result.outputTokens;
            }
          }
        }
      }
    }

    onDone({ inputTokens, outputTokens });
  }

  return {
    streamComplete
  };
}

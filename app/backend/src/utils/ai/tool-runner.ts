export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface ToolHandler<TInput = any, TOutput = any> {
  definition: ToolDefinition;
  handler: (input: TInput) => Promise<TOutput>;
}

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

export interface ToolRunner {
  register(tool: ToolHandler): void;
  getDefinitions(): ToolDefinition[];
  run(
    messages: Message[],
    apiKey: string
  ): Promise<{ result: string; toolCallCount: number }>;
}

export function createToolRunner(): ToolRunner {
  const tools = new Map<string, ToolHandler>();
  const MAX_ITERATIONS = 10;

  /**
   * Registers a tool and its handler.
   */
  function register(tool: ToolHandler): void {
    tools.set(tool.definition.name, tool);
  }

  /**
   * Returns all registered tool definitions.
   */
  function getDefinitions(): ToolDefinition[] {
    return Array.from(tools.values()).map(t => t.definition);
  }

  /**
   * Runs the tool loop until the model returns end_turn or MAX_ITERATIONS is exceeded.
   */
  async function run(
    messages: Message[],
    apiKey: string
  ): Promise<{ result: string; toolCallCount: number }> {
    let toolCallCount = 0;
    let iterations = 0;

    const toolDefinitions = getDefinitions();
    const currentMessages = [...messages];

    while (iterations < MAX_ITERATIONS) {
      const requestBody: Record<string, unknown> = {
        model: 'claude-3-5-haiku-20241022',
        max_tokens: 4096,
        messages: currentMessages.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      };

      if (toolDefinitions.length > 0) {
        requestBody.tools = toolDefinitions;
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
        content: Array<TextContentBlock | ToolUseBlock>;
        stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';
      };

      // Push assistant's message into messages history copy
      currentMessages.push({
        role: 'assistant',
        content: responseData.content
      });

      if (responseData.stop_reason === 'tool_use') {
        const toolResults: ToolResultBlock[] = [];

        for (const block of responseData.content) {
          if (block.type === 'tool_use') {
            const toolUse = block as ToolUseBlock;
            const tool = tools.get(toolUse.name);

            let resultString: string;
            if (!tool) {
              resultString = JSON.stringify({ error: `Tool ${toolUse.name} not found` });
            } else {
              try {
                const output = await tool.handler(toolUse.input);
                resultString = JSON.stringify(output);
              } catch (handlerErr: unknown) {
                const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
                resultString = JSON.stringify({ error: `Tool execution failed: ${errMsg}` });
              }
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUse.id,
              content: resultString
            });

            toolCallCount++;
          }
        }

        currentMessages.push({
          role: 'user',
          content: toolResults
        });

        iterations++;
      } else {
        const textBlock = responseData.content.find(block => block.type === 'text') as TextContentBlock | undefined;
        return {
          result: textBlock?.text || '',
          toolCallCount
        };
      }
    }

    throw new Error(`Exceeded maximum tool execution iterations of ${MAX_ITERATIONS}`);
  }

  return {
    register,
    getDefinitions,
    run
  };
}

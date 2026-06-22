import { ToolDefinition } from './tool-runner.js';

/**
 * Calls Anthropic Claude to perform structured extraction using a forced tool choice.
 * Returns the parsed input arguments of the tool call.
 */
export async function extractStructured<T>(
  input: string,
  toolDefinition: ToolDefinition,
  apiKey: string,
  model: string = 'claude-3-5-haiku-20241022'
): Promise<T> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      messages: [
        {
          role: 'user',
          content: input
        }
      ],
      tools: [toolDefinition],
      tool_choice: {
        type: 'tool',
        name: toolDefinition.name
      }
    })
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Anthropic API request failed: ${response.status} ${response.statusText} - ${errBody}`);
  }

  const responseData = (await response.json()) as {
    content: Array<{
      type: string;
      id?: string;
      name?: string;
      input?: unknown;
    }>;
    stop_reason: string;
  };

  const toolUseBlock = responseData.content.find(
    block => block.type === 'tool_use' && block.name === toolDefinition.name
  );

  if (!toolUseBlock) {
    throw new Error(`Model did not call the expected tool: ${toolDefinition.name}`);
  }

  return toolUseBlock.input as T;
}

export const extractShippingAddress: ToolDefinition = {
  name: 'extractShippingAddress',
  description: 'Extract shipping address information from unstructured text.',
  input_schema: {
    type: 'object',
    properties: {
      fullName: {
        type: 'string',
        description: 'The full name of the recipient.'
      },
      streetAddress: {
        type: 'string',
        description: 'The street address (e.g. 123 Main St, Apt 4).'
      },
      city: {
        type: 'string',
        description: 'The city name.'
      },
      country: {
        type: 'string',
        description: 'The country name.'
      },
      postalCode: {
        type: 'string',
        description: 'The postal code or ZIP code.'
      }
    },
    required: ['fullName', 'streetAddress', 'city', 'country']
  }
};

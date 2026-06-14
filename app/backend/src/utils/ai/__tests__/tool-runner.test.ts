import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ToolRunner, Message } from '../tool-runner.js';
import { getOrderStatus, getCustomerAccount, createSupportTicket } from '../../../domains/support/tools.js';

describe('ToolRunner', () => {
  const apiKey = 'test-api-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('getDefinitions returns all registered tool definitions', () => {
    const runner = new ToolRunner();
    runner.register(getOrderStatus);
    runner.register(getCustomerAccount);

    const definitions = runner.getDefinitions();
    expect(definitions).toHaveLength(2);
    expect(definitions[0].name).toBe('getOrderStatus');
    expect(definitions[1].name).toBe('getCustomerAccount');
  });

  it('Tool loop executes tool and sends result back to model', async () => {
    const runner = new ToolRunner();
    runner.register(getOrderStatus);

    // Call 1: model requests to use the getOrderStatus tool
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'getOrderStatus',
            input: { orderId: 'ORD-999' }
          }
        ],
        stop_reason: 'tool_use'
      })
    });

    // Call 2: model uses the tool result and returns final response
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'Your order ORD-999 is shipped and will arrive on 2024-01-15.'
          }
        ],
        stop_reason: 'end_turn'
      })
    });

    const messages: Message[] = [
      { role: 'user', content: 'What is the status of order ORD-999?' }
    ];

    const { result, toolCallCount } = await runner.run(messages, apiKey);

    expect(result).toBe('Your order ORD-999 is shipped and will arrive on 2024-01-15.');
    expect(toolCallCount).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the caller's array remains unmodified
    expect(messages).toHaveLength(1);

    // Verify the second call to the model includes the correct messages history
    const secondCallArgs = mockFetch.mock.calls[1];
    const requestBody = JSON.parse(secondCallArgs[1].body);
    expect(requestBody.messages).toHaveLength(3);

    // 1. Initial user prompt
    expect(requestBody.messages[0]).toEqual({
      role: 'user',
      content: 'What is the status of order ORD-999?'
    });

    // 2. Assistant requests tool call
    expect(requestBody.messages[1].role).toBe('assistant');
    expect(requestBody.messages[1].content[0]).toMatchObject({
      type: 'tool_use',
      name: 'getOrderStatus',
      input: { orderId: 'ORD-999' }
    });

    // 3. User provides tool result
    expect(requestBody.messages[2].role).toBe('user');
    expect(requestBody.messages[2].content[0]).toMatchObject({
      type: 'tool_result',
      tool_use_id: 'toolu_1',
      content: JSON.stringify({ orderId: 'ORD-999', status: 'shipped', eta: '2024-01-15' })
    });
  });

  it('Tool loop throws after MAX_ITERATIONS', async () => {
    const runner = new ToolRunner();
    runner.register(getOrderStatus);

    // Fetch always returns tool_use (infinite loop)
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_infinite',
            name: 'getOrderStatus',
            input: { orderId: 'ORD-123' }
          }
        ],
        stop_reason: 'tool_use'
      })
    });

    const messages: Message[] = [
      { role: 'user', content: 'Check status' }
    ];

    await expect(runner.run(messages, apiKey)).rejects.toThrowError(/Exceeded maximum tool execution iterations/);
    
    // Should have called fetch exactly MAX_ITERATIONS (10) times before throwing
    expect(mockFetch).toHaveBeenCalledTimes(10);
  });
});

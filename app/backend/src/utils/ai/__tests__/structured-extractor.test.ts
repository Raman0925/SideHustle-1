import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StructuredExtractor, createStructuredExtractor, TicketSchema, ContactSchema } from '../structured-extractor.js';

describe('StructuredExtractor', () => {
  const apiKey = 'test-api-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extract returns correct shape for valid model output', async () => {
    const validJsonOutput = JSON.stringify({
      category: ['technical'],
      priority: 'high',
      summary: 'Cannot connect to database',
      requiresHuman: true
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: `\`\`\`json\n${validJsonOutput}\n\`\`\``
          }
        ]
      })
    });

    const extractor = createStructuredExtractor(apiKey);
    const result = await extractor.extract(
      TicketSchema,
      'Classify the support ticket.',
      'Help, I cannot connect to my Postgres database!'
    );

    expect(result).toEqual({
      category: ['technical'],
      priority: 'high',
      summary: 'Cannot connect to database',
      requiresHuman: true
    });

    expect(mockFetch).toHaveBeenCalledWith('https://api.anthropic.com/v1/messages', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      }),
      body: expect.stringContaining('"model":"claude-haiku-4-5"')
    }));
  });

  it('extract throws when JSON is invalid', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'This is not JSON at all'
          }
        ]
      })
    });

    const extractor = createStructuredExtractor(apiKey);
    await expect(
      extractor.extract(
        TicketSchema,
        'Classify the support ticket.',
        'Hello!'
      )
    ).rejects.toThrowError(/Failed to parse response as JSON/);
  });

  it('extract throws when schema validation fails', async () => {
    // Missing required field "requiresHuman" and priority is invalid
    const invalidSchemaJson = JSON.stringify({
      category: 'billing',
      priority: 'invalid-priority',
      summary: 'Billing issue'
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: `\`\`\`json\n${invalidSchemaJson}\n\`\`\``
          }
        ]
      })
    });

    const extractor = createStructuredExtractor(apiKey);
    await expect(
      extractor.extract(
        TicketSchema,
        'Classify the support ticket.',
        'Hello!'
      )
    ).rejects.toThrowError(/Validation failed/);
  });

  it('extractWithRetry retries on validation failure', async () => {
    // First call returns invalid schema (missing requiresHuman)
    const invalidJson = JSON.stringify({
      category: ['billing'],
      priority: 'low',
      summary: 'Billing question'
    });

    // Second call returns valid schema
    const validJson = JSON.stringify({
      category: ['billing'],
      priority: 'low',
      summary: 'Billing question',
      requiresHuman: false
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: `\`\`\`json\n${invalidJson}\n\`\`\``
            }
          ]
        })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          content: [
            {
              type: 'text',
              text: `\`\`\`json\n${validJson}\n\`\`\``
            }
          ]
        })
      });

    const extractor = createStructuredExtractor(apiKey);
    const result = await extractor.extractWithRetry(
      TicketSchema,
      'Classify the support ticket.',
      'How do I view my invoice?'
    );

    expect(result).toEqual({
      category: ['billing'],
      priority: 'low',
      summary: 'Billing question',
      requiresHuman: false
    });

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Verify the second call's messages history
    const secondCallArgs = mockFetch.mock.calls[1];
    const requestBody = JSON.parse(secondCallArgs[1].body);
    
    expect(requestBody.messages).toHaveLength(3);
    
    // First message: original user input
    expect(requestBody.messages[0]).toEqual({
      role: 'user',
      content: 'How do I view my invoice?'
    });
    
    // Second message: assistant bad output
    expect(requestBody.messages[1].role).toBe('assistant');
    expect(requestBody.messages[1].content).toContain('Billing question');
    
    // Third message: user error feedback request
    expect(requestBody.messages[2].role).toBe('user');
    expect(requestBody.messages[2].content).toContain('failed validation');
    expect(requestBody.messages[2].content).toContain('requiresHuman');
  });

  it('extractWithRetry extracts contact information correctly', async () => {
    const contactJson = JSON.stringify({
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Acme Inc'
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: `\`\`\`json\n${contactJson}\n\`\`\``
          }
        ]
      })
    });

    const extractor = createStructuredExtractor(apiKey);
    const result = await extractor.extract(
      ContactSchema,
      'Extract contact information.',
      'My name is John Doe, reach me at john@example.com. I work at Acme Inc.'
    );

    expect(result).toEqual({
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Acme Inc'
    });
  });
});

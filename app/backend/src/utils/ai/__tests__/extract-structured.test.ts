import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { extractStructured, extractShippingAddress } from '../extract-structured.js';

describe('extractStructured', () => {
  const apiKey = 'test-api-key';
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extractStructured returns the tool input when model calls the tool', async () => {
    const mockAddress = {
      fullName: 'John Doe',
      streetAddress: '1600 Amphitheatre Pkwy',
      city: 'Mountain View',
      country: 'USA',
      postalCode: '94043'
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'tool_use',
            id: 'toolu_addr_1',
            name: 'extractShippingAddress',
            input: mockAddress
          }
        ],
        stop_reason: 'tool_use'
      })
    });

    const result = await extractStructured(
      'Deliver to John Doe at 1600 Amphitheatre Pkwy, Mountain View, USA, ZIP 94043',
      extractShippingAddress,
      apiKey
    );

    expect(result).toEqual(mockAddress);
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockFetch.mock.calls[0];
    const requestBody = JSON.parse(callArgs[1].body);
    expect(requestBody.tool_choice).toEqual({
      type: 'tool',
      name: 'extractShippingAddress'
    });
  });

  it("extractStructured throws when model doesn't call the expected tool", async () => {
    // Return a normal text response instead of tool call
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [
          {
            type: 'text',
            text: 'I cannot extract any address.'
          }
        ],
        stop_reason: 'end_turn'
      })
    });

    await expect(
      extractStructured(
        'Hello there!',
        extractShippingAddress,
        apiKey
      )
    ).rejects.toThrowError(/Model did not call the expected tool: extractShippingAddress/);
  });
});

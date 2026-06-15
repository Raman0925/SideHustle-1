import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import fastifySSE from '@fastify/sse';
import chatController from '../chat.controller.js';

// Mock the ChatService functional exports directly
vi.mock('../chat.service.js', () => {
  return {
    sendMessage: vi.fn().mockResolvedValue({
      text: 'Complete response',
      usage: { inputTokens: 10, outputTokens: 20 }
    }),
    streamMessageIterable: vi.fn().mockImplementation(async function* (message, history, tier) {
      yield 'Hello';
      yield ' world';
      yield { data: { inputTokens: 5, outputTokens: 10 }, event: 'done' };
    })
  };
});

describe('Chat Controller Routes', () => {
  let app: any;

  beforeEach(async () => {
    app = Fastify();
    app.register(fastifySSE);
    app.register(chatController, { prefix: '/chat' });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it('POST /chat returns 400 when body is invalid', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {} // missing message field
    });

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.payload);
    expect(body.error).toBe('Bad Request');
  });

  it('POST /chat returns complete response when successful', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/chat',
      payload: {
        message: 'hello'
      }
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body).toEqual({
      text: 'Complete response',
      usage: { inputTokens: 10, outputTokens: 20 }
    });
  });

  it('POST /chat/stream sends SSE events correctly', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/chat/stream',
      headers: {
        accept: 'text/event-stream'
      },
      payload: {
        message: 'hello'
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/event-stream');

    const lines = response.payload.split('\n');
    
    // We expect text chunks emitted, followed by the done event and token usage
    expect(lines).toContain('data: Hello');
    expect(lines).toContain('data:  world');
    expect(lines).toContain('event: done');
    expect(lines).toContain('data: {"inputTokens":5,"outputTokens":10}');
  });
});

import { FastifyInstance, FastifyPluginOptions, FastifyRequest, FastifyReply } from 'fastify';
import { sendMessage, streamMessageIterable } from './chat.service.js';
import { ChatRequestSchema } from './chat.validator.js';

/**
 * Chat Controller Plugin
 * Defines endpoints for standard and streaming response generation.
 */
const chatController = async (fastify: FastifyInstance, options: FastifyPluginOptions) => {
  // POST /chat
  fastify.post(
    '/',
    {
      schema: {
        tags: ['Chat'],
        summary: 'Send chat message',
        description: 'Sends a chat message and retrieves a complete response.',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ChatRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          statusCode: 400
        });
      }

      const { message, history, tier } = parsed.data;
      const result = await sendMessage(message, history, tier);
      return reply.code(200).send(result);
    }
  );

  // POST /chat/stream
  fastify.post(
    '/stream',
    {
      sse: true,
      schema: {
        tags: ['Chat'],
        summary: 'Stream chat message',
        description: 'Streams response using Server-Sent Events (SSE).',
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = ChatRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'Bad Request',
          message: parsed.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join(', '),
          statusCode: 400
        });
      }

      const { message, history, tier } = parsed.data;

      if (!reply.sse) {
        return reply.code(406).send({
          error: 'Not Acceptable',
          message: 'Accept header must contain text/event-stream',
          statusCode: 406
        });
      }

      const sseStream = streamMessageIterable(message, history, tier);
      return reply.sse.send(sseStream);
    }
  );
};

export default chatController;

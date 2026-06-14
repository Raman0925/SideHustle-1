import { FastifyRequest, FastifyReply } from 'fastify';

/**
 * Request Context Middleware
 */
export async function requestContextMiddleware(request: FastifyRequest, reply: FastifyReply) {
  reply.header('x-request-id', request.id);
}

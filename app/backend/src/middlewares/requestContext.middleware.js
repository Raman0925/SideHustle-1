/**
 * Request Context Middleware
 */
export async function requestContextMiddleware(request, reply) {
  reply.header('x-request-id', request.id);
}

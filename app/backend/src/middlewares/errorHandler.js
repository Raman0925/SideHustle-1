/**
 * Global Fastify Error Handler
 * Standardizes API error responses and prevents sensitive server details from leaking.
 */
export default function errorHandler(error, request, reply) {
  // Log the full error stack using Fastify's native logger
  request.log.error(error);

  // Handle Fastify/AJV or validation errors
  if (error.validation) {
    return reply.status(400).send({
      error: 'Bad Request',
      message: 'Schema validation failed',
      details: error.validation,
    });
  }

  // Handle business logic errors with set status codes
  const statusCode = error.statusCode || 500;

  // Do not expose details of internal server errors (500) to the client
  const message =
    statusCode === 500 ? 'An unexpected error occurred on the server.' : error.message;

  return reply.status(statusCode).send({
    error: statusCode === 500 ? 'Internal Server Error' : error.name || 'Error',
    message,
    statusCode,
  });
}

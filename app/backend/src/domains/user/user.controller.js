import { UserService } from './user.service.js';

/**
 * User Controller Plugin
 * Defines routes and Swagger schemas under the /auth prefix.
 */
export default async function userController(fastify, options) {
  // Instantiate UserService with Fastify's pg pool
  const userService = new UserService(fastify.pg);

  fastify.get(
    '/me',
    {
      schema: {
        description: 'Retrieve current authenticated user profile.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        response: {
          200: {
            description: 'Success profile retrieval',
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              full_name: { type: 'string', nullable: true },
              avatar_url: { type: 'string', nullable: true },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
          401: {
            description: 'Unauthorized access',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
              statusCode: { type: 'number' },
            },
          },
          404: {
            description: 'Profile not found',
            type: 'object',
            properties: {
              error: { type: 'string' },
              message: { type: 'string' },
              statusCode: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      // request.user is populated by global authMiddleware
      // Query service to ensure latest DB record is fetched
      const profile = await userService.getProfile(request.user.id);
      return profile;
    },
  );

  fastify.put(
    '/me',
    {
      schema: {
        description: 'Update metadata details (name/avatar) of the current user profile.',
        tags: ['User'],
        security: [{ bearerAuth: [] }],
        body: {
          type: 'object',
          properties: {
            full_name: { type: 'string', nullable: true },
            avatar_url: { type: 'string', nullable: true },
          },
        },
        response: {
          200: {
            description: 'Successful update',
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              full_name: { type: 'string', nullable: true },
              avatar_url: { type: 'string', nullable: true },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { full_name, avatar_url } = request.body || {};

      const updatedProfile = await userService.updateProfile(request.user.id, {
        fullName: full_name,
        avatarUrl: avatar_url,
      });

      return updatedProfile;
    },
  );
}

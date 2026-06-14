import pg from 'pg';

declare module 'fastify' {
  interface FastifyInstance {
    pg: pg.Pool;
  }

  interface FastifyRequest {
    user: {
      id: string;
      email: string;
      full_name: string | null;
      avatar_url: string | null;
      updated_at: string;
    };
  }
}

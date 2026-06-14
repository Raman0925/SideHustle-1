import pg from 'pg';
import fp from 'fastify-plugin';

async function dbConnectorPlugin(fastify, options) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not defined in environment variables');
  }

  const pool = new pg.Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: {
      rejectUnauthorized: false
    }
  });

  // Test the connection immediately on startup
  try {
    const client = await pool.connect();
    fastify.log.info('Database pool connected successfully');
    client.release();
  } catch (err) {
    fastify.log.error('Database connection failed:', err);
    throw err;
  }

  // Decorate the fastify instance with the pg pool
  fastify.decorate('pg', pool);

  // Close the pool when the fastify instance is closed
  fastify.addHook('onClose', async (instance) => {
    fastify.log.info('Closing database connection pool...');
    await pool.end();
    fastify.log.info('Database connection pool closed');
  });
}

export default fp(dbConnectorPlugin);

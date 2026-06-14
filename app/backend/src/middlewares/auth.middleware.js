import jwt from 'jsonwebtoken';

export default async function authMiddleware(request, reply) {
  const { url } = request;

  if (url === '/health' || url.startsWith('/docs') || url.startsWith('/favicon.ico')) {
    return;
  }
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const err = new Error('Unauthorized: Missing or invalid token format');
    err.statusCode = 401;
    throw err;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      const err = new Error('Internal Server Error: JWT secret is not configured');
      err.statusCode = 500;
      throw err;
    }

    let decoded;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      });
    } catch (jwtErr) {
      const err = new Error('Unauthorized: Invalid or expired access token');
      err.statusCode = 401;
      throw err;
    }

    if (!decoded || !decoded.sub) {
      const err = new Error('Unauthorized: Invalid or expired access token');
      err.statusCode = 401;
      throw err;
    }

    const user = {
      id: decoded.sub,
      email: decoded.email,
      user_metadata: decoded.user_metadata,
    };

    // 4. Query the public.profiles database table using the pg connection pool
    const result = await request.server.pg.query(
      'SELECT id, email, full_name, avatar_url, updated_at FROM public.profiles WHERE id = $1',
      [user.id],
    );

    const profile = result.rows[0];

    if (!profile) {
      // Resilient Fallback: If DB sync trigger hasn't finished, construct profile from JWT metadata
      request.user = {
        id: user.id,
        email: user.email,
        full_name: user.user_metadata?.full_name || user.user_metadata?.name || null,
        avatar_url: user.user_metadata?.avatar_url || null,
        updated_at: new Date().toISOString(),
      };
      request.log.warn(
        `Profile for user ${user.id} not found in public.profiles. Used fallback metadata.`,
      );
    } else {
      // Attach the DB profile to the request
      request.user = profile;
    }
  } catch (err) {
    // Pass errors down to Fastify's error handler hook
    if (!err.statusCode) {
      err.statusCode = 401;
    }
    throw err;
  }
}

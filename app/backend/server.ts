import 'dotenv/config';
import Fastify from 'fastify';
import dbConnector from '#plugins/dbConnector.js';
import errorHandler from '#middlewares/errorHandler.js';
import { requestContextMiddleware } from '#middlewares/requestContext.middleware.js';
import authMiddleware from '#middlewares/auth.middleware.js';
import userController from '#domains/user/user.controller.js';
import chatController from '#domains/chat/chat.controller.js';
import filingsController from '#domains/filings/filings.controller.js';
import { startFilingsPolling, stopFilingsPolling } from '#domains/filings/filings.service.js';
import fastifySSE from '@fastify/sse';
import loggerConfig from '#config/loggerConfig.js';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { swaggerConfig, swaggerUiConfig } from '#config/swaggerConfig.js';

const fastify = Fastify({ logger: loggerConfig });

// ── Plugins ────────────────────────────────────────────────────────────────────
fastify.register(cors, {
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});
fastify.register(dbConnector);
fastify.register(websocket);
fastify.register(fastifySSE.default);
fastify.register(swagger, swaggerConfig);
fastify.register(swaggerUi, swaggerUiConfig);

// ── Global middlewares ─────────────────────────────────────────────────────────
fastify.addHook('onRequest', requestContextMiddleware);
fastify.addHook('preHandler', authMiddleware);

// ── Domain routes ──────────────────────────────────────────────────────────────
fastify.register(userController,    { prefix: '/auth' });
fastify.register(chatController,    { prefix: '/chat' });
fastify.register(filingsController, { prefix: '/filings' });

// ── Global error handler ───────────────────────────────────────────────────────
fastify.setErrorHandler(errorHandler);

// ── Start server ───────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await fastify.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${process.env.PORT || 3000}`);

    // Start NSE + BSE polling after server is up
    // 90s interval — respectful to exchanges, fast enough to catch filings early
    startFilingsPolling(90_000);
    fastify.log.info('Filings poller started — NSE + BSE, 90s interval');

  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// ── Graceful shutdown ──────────────────────────────────────────────────────────
// Stop polling before killing the process so no in-flight DB writes are lost
const shutdown = async () => {
  fastify.log.info('Shutting down gracefully...');
  stopFilingsPolling();
  await fastify.close();
  process.exit(0);
};

process.on('SIGINT', shutdown);   // Ctrl+C
process.on('SIGTERM', shutdown);  // Docker / PM2 stop

startServer();

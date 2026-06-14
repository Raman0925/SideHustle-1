import 'dotenv/config';
import Fastify from 'fastify';
import dbConnector from '#plugins/dbConnector.js';
import errorHandler from '#middlewares/errorHandler.js';
import { requestContextMiddleware } from '#middlewares/requestContext.middleware.js';
import authMiddleware from '#middlewares/auth.middleware.js';
import userController from '#domains/user/user.controller.js';
import loggerConfig from '#config/loggerConfig.js';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { swaggerConfig, swaggerUiConfig } from '#config/swaggerConfig.js';

const fastify = Fastify({ logger: loggerConfig });

// Register plugins
fastify.register(cors, {
  origin: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
});
fastify.register(dbConnector);
fastify.register(websocket);
fastify.register(swagger, swaggerConfig);
fastify.register(swaggerUi, swaggerUiConfig);

// Register global middlewares
fastify.addHook('onRequest', requestContextMiddleware);
fastify.addHook('preHandler', authMiddleware);

// Register domain routes
fastify.register(userController, { prefix: '/auth' });

// Register global error handler
fastify.setErrorHandler(errorHandler);

const startServer = async () => {
  try {
    await fastify.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });
    fastify.log.info(`Server running on http://localhost:${process.env.PORT || 3000}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

startServer();

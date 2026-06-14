const port = process.env.PORT || 5000;

export const swaggerConfig = {
  openapi: {
    info: {
      title: 'AI App API',
      description: 'Production-grade API specification for the Fastify custom backend',
      version: '1.0.0',
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Input your Supabase Session JWT token to authenticate requests.',
        },
      },
    },
  },
};

export const swaggerUiConfig = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
};

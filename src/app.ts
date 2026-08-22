import Fastify, { FastifyInstance } from 'fastify';
import { env } from './config/env.js';
import { registerCallRoutes } from './routes/calls.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
    },
  });

  // Health check endpoint
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'elevate-voice',
      timestamp: new Date().toISOString(),
    });
  });

  // Register call routes
  app.register(registerCallRoutes);

  // Basic centralized error handling
  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, 'Unhandled request error');

    const statusCode = error.statusCode || 500;
    return reply.status(statusCode).send({
      error: {
        message: statusCode === 500 ? 'Internal Server Error' : error.message,
        statusCode,
      },
    });
  });

  return app;
}


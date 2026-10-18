import type { FastifyInstance } from 'fastify';
import type { GenerationController } from '@refloor/server/features/generation/generation.controller';

export function registerGenerationRoutes(app: FastifyInstance, controller: GenerationController) {
  app.post(
    '/api/generations',
    { config: { rateLimit: { max: 6, timeWindow: '1 hour' } } },
    controller.create,
  );
  app.get('/api/generations/:id', controller.get);
}

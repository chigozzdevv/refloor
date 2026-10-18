import type { FastifyInstance } from 'fastify';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';

export function registerSessionRoutes(app: FastifyInstance, controller: SessionController) {
  app.post(
    '/api/sessions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.create,
  );
}

import type { FastifyInstance } from 'fastify';
import type { SessionController } from '@refloor/server/features/sessions/session.controller';

export function registerSessionRoutes(app: FastifyInstance, controller: SessionController) {
  app.post(
    '/api/sessions',
    { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
    controller.create,
  );
  app.post(
    '/api/sessions/recovery',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    controller.recovery,
  );
  app.post(
    '/api/sessions/recover',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    controller.recover,
  );
}

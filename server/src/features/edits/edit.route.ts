import type { FastifyInstance } from 'fastify';
import type { EditController } from '@refloor/server/features/edits/edit.controller';

export function registerEditRoutes(app: FastifyInstance, controller: EditController) {
  app.post(
    '/api/edits/interpret',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } },
    controller.interpret,
  );
  app.post('/api/projects/:id/edits', controller.apply);
  app.post('/api/projects/:id/undo', controller.undo);
  app.post('/api/projects/:id/redo', controller.redo);
}

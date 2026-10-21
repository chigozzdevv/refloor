import type { FastifyInstance } from 'fastify';
import type { CollaborationController } from '@refloor/server/features/collaboration/collaboration.controller';
export function registerCollaborationRoutes(
  app: FastifyInstance,
  controller: CollaborationController,
) {
  app.get('/api/collaboration/projects', controller.list);
  const base = '/api/collaboration/projects/:id';
  app.get(base, controller.state);
  app.post(`${base}/enable`, controller.enable);
  app.get(`${base}/invites`, controller.invites);
  app.post(`${base}/invites`, controller.invite);
  app.post(`${base}/invites/:inviteId/revoke`, controller.revoke);
  app.post(`${base}/members`, controller.manage);
  app.post(`${base}/edits`, controller.edit);
  app.post(`${base}/activity/:eventId`, controller.rollback);
  app.get(`${base}/activity`, controller.history);
  app.post('/api/collaboration/join', controller.join);
}

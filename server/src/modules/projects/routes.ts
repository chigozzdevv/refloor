import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  projectCreateSchema,
  projectEditSchema,
  projectHistorySchema,
  projectSaveSchema,
} from '@refloor/contracts';
import type { Projects } from '@refloor/server/modules/projects/service';
import type { Sessions } from '@refloor/server/modules/sessions/service';

const paramsSchema = z.strictObject({ id: z.uuid() });
const listSchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(512).optional(),
});

export function registerProjects(app: FastifyInstance, projects: Projects, sessions: Sessions) {
  app.get('/api/projects', async (request) => {
    const owner = await sessions.require(request);
    const query = listSchema.parse(request.query);
    return projects.list(owner, query.limit, query.cursor);
  });
  app.post('/api/projects', async (request, reply) => {
    const owner = await sessions.require(request);
    const result = await projects.create(owner, projectCreateSchema.parse(request.body));
    return reply.code(result.replayed ? 200 : 201).send(result);
  });
  app.get('/api/projects/:id', async (request) => {
    const owner = await sessions.require(request);
    return projects.get(owner, paramsSchema.parse(request.params).id);
  });
  app.put('/api/projects/:id', async (request) => {
    const owner = await sessions.require(request);
    return projects.save(
      owner,
      paramsSchema.parse(request.params).id,
      projectSaveSchema.parse(request.body),
    );
  });
  app.post('/api/projects/:id/edits', async (request) => {
    const owner = await sessions.require(request);
    return projects.edit(
      owner,
      paramsSchema.parse(request.params).id,
      projectEditSchema.parse(request.body),
    );
  });
  for (const kind of ['undo', 'redo'] as const)
    app.post(`/api/projects/:id/${kind}`, async (request) => {
      const owner = await sessions.require(request);
      return projects.history(
        owner,
        paramsSchema.parse(request.params).id,
        kind,
        projectHistorySchema.parse(request.body),
      );
    });
}

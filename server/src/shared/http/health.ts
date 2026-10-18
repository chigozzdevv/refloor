import type { FastifyInstance } from 'fastify';
import type { Db } from 'mongodb';

export function registerHealth(app: FastifyInstance, database: Db) {
  app.get('/api/health', async (_request, reply) => {
    try {
      await database.command({ ping: 1 }, { timeoutMS: 3000 });
      return { ready: true };
    } catch {
      return reply.code(503).send({ ready: false });
    }
  });
}

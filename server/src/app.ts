import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { ServerConfig } from '@refloor/server/config/environment';
import { connectDatabase } from '@refloor/server/database/connection';
import { ApiError, registerErrors } from '@refloor/server/http/errors';
import { Sessions } from '@refloor/server/modules/sessions/service';
import { Projects } from '@refloor/server/modules/projects/service';
import { registerProjects } from '@refloor/server/modules/projects/routes';

export async function createApp(config: ServerConfig, logging = true) {
  const app = Fastify({
    logger: logging
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] }
      : false,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 30000,
  });
  registerErrors(app);
  const database = await connectDatabase(config.mongoUri, config.database);
  app.addHook('onClose', async () => {
    await database.client.close();
  });
  try {
    await app.register(cookie);
    await app.register(cors, {
      origin: config.clientOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    });
    await app.register(rateLimit, { max: 120, timeWindow: '1 minute' });
    app.addHook('onRequest', async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      if (
        ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
        request.headers.origin &&
        !config.clientOrigins.includes(request.headers.origin)
      )
        throw new ApiError(403, 'ORIGIN_REJECTED', 'This origin cannot change projects.');
    });
    const sessions = new Sessions(database, config.production);
    registerProjects(app, new Projects(database), sessions);
    app.post(
      '/api/sessions',
      { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } },
      (request, reply) => sessions.create(request, reply),
    );
    app.get('/api/health', async (_request, reply) => {
      try {
        await database.db.command({ ping: 1 }, { timeoutMS: 3000 });
        return { ready: true };
      } catch {
        return reply.code(503).send({ ready: false });
      }
    });
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

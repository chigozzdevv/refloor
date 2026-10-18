import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { ServerConfig } from '@refloor/server/shared/config/env';
import { connectMongo } from '@refloor/server/shared/database/mongo';
import { ApiError, registerErrors } from '@refloor/server/shared/http/errors';
import { registerHealth } from '@refloor/server/shared/http/health';
import { SessionRepository } from '@refloor/server/features/sessions/session.repo';
import { SessionService } from '@refloor/server/features/sessions/session.service';
import { SessionController } from '@refloor/server/features/sessions/session.controller';
import { registerSessionRoutes } from '@refloor/server/features/sessions/session.route';
import { HouseRepository } from '@refloor/server/features/houses/house.repo';
import { HouseService } from '@refloor/server/features/houses/house.service';
import { HouseController } from '@refloor/server/features/houses/house.controller';
import { registerHouseRoutes } from '@refloor/server/features/houses/house.route';
import { RevisionRepository } from '@refloor/server/features/edits/revision.repo';
import { EditService } from '@refloor/server/features/edits/edit.service';
import { UndoService } from '@refloor/server/features/edits/undo.service';
import { EditController } from '@refloor/server/features/edits/edit.controller';
import { registerEditRoutes } from '@refloor/server/features/edits/edit.route';

export async function createApp(config: ServerConfig, logging = true) {
  const app = Fastify({
    logger: logging
      ? { redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers.set-cookie'] }
      : false,
    bodyLimit: 2 * 1024 * 1024,
    requestTimeout: 30000,
  });
  registerErrors(app);
  const database = await connectMongo(config.mongoUri, config.database);
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
    const sessions = new SessionController(
      new SessionService(new SessionRepository(database.db)),
      config.production,
    );
    const houses = new HouseRepository(database.db);
    const revisions = new RevisionRepository(database.client, database.db, houses);
    registerHouseRoutes(app, new HouseController(new HouseService(houses, revisions), sessions));
    registerEditRoutes(
      app,
      new EditController(new EditService(revisions), new UndoService(revisions), sessions),
    );
    registerSessionRoutes(app, sessions);
    registerHealth(app, database.db);
    await app.ready();
    return app;
  } catch (error) {
    await app.close();
    throw error;
  }
}

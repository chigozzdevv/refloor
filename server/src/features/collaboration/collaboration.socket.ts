import { Server } from 'socket.io';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { presenceInputSchema } from '@refloor/scene/collaboration';
import type { SharedPresence } from '@refloor/scene/collaboration';
import type { SessionService } from '@refloor/server/features/sessions/session.service';
import { sessionCookie } from '@refloor/server/features/sessions/session.model';
import type { CollaborationService } from '@refloor/server/features/collaboration/collaboration.service';
import { memberView } from '@refloor/server/features/collaboration/collaboration.model';
import type { ServerConfig } from '@refloor/server/shared/config/env';

export function registerCollaborationSocket(
  app: FastifyInstance,
  service: CollaborationService,
  sessions: SessionService,
  config: ServerConfig,
) {
  const io = new Server(app.server, {
    path: '/api/live',
    serveClient: false,
    maxHttpBufferSize: 8192,
    cors: { origin: config.clientOrigins, credentials: true },
    allowRequest: (request, callback) =>
      callback(
        null,
        !request.headers.origin || config.clientOrigins.includes(request.headers.origin),
      ),
  });
  const presence = new Map<
    string,
    {
      projectId: string;
      ownerId: string;
      value: SharedPresence;
      seen: number;
      token: string | undefined;
    }
  >();
  const publish = (id: string) =>
    io.to(id).emit(
      'presence',
      [...presence.values()].filter((value) => value.projectId === id).map((value) => value.value),
    );
  service.players = (id) =>
    [...presence.values()]
      .filter((entry) => entry.projectId === id && Date.now() - entry.seen < 15000)
      .flatMap((entry) => (entry.value.player ? [entry.value.player] : []));
  const changed = (id: string) => {
    io.to(id).emit('changed');
    for (const [socketId, entry] of presence)
      if (entry.projectId === id)
        void service
          .access(entry.ownerId, id)
          .then((member) => {
            if (!presence.has(socketId)) return;
            entry.value.member = memberView(member);
            publish(id);
          })
          .catch(() => io.sockets.sockets.get(socketId)?.disconnect(true));
  };
  service.changes.add(changed);
  io.use(async (socket, next) => {
    try {
      const session = socket.handshake.auth.session as unknown,
        token =
          session === undefined
            ? app.parseCookie(socket.request.headers.cookie ?? '')[
                config.sessionCookieName ?? sessionCookie
              ]
            : typeof session === 'string'
              ? session
              : undefined;
      socket.data.ownerId = await sessions.require(token);
      socket.data.token = token;
      next();
    } catch {
      next(new Error('Your browser session is no longer available.'));
    }
  });
  io.on('connection', (socket) => {
    let packets = 0,
      windowStart = Date.now(),
      ready = false;
    socket.on(
      'join',
      async (raw: unknown, ack: (reply: { ready: boolean; message?: string }) => void) => {
        try {
          if (ready || typeof ack !== 'function')
            throw new Error('This connection already joined a house.');
          ready = true;
          const { projectId, clientId } = z
            .strictObject({ projectId: z.uuid(), clientId: z.uuid() })
            .parse(raw);
          const member = await service.access(String(socket.data.ownerId), projectId);
          if ([...presence.values()].filter((entry) => entry.projectId === projectId).length >= 24)
            throw new Error('This house already has 24 live visitors.');
          await socket.join(projectId);
          presence.set(socket.id, {
            projectId,
            ownerId: String(socket.data.ownerId),
            token: socket.data.token as string | undefined,
            seen: Date.now(),
            value: {
              clientId,
              member: memberView(member),
              selection: null,
              draft: '',
              phase: 'idle',
              player: null,
              floorId: '',
            },
          });
          publish(projectId);
          ack({ ready: true });
        } catch (error) {
          if (!presence.has(socket.id)) ready = false;
          if (typeof ack === 'function')
            ack({
              ready: false,
              message: error instanceof Error ? error.message : 'Could not join this house.',
            });
        }
      },
    );
    socket.on('presence', async (raw: unknown) => {
      const entry = presence.get(socket.id);
      if (!entry) return;
      if (Date.now() - windowStart > 1000) {
        packets = 0;
        windowStart = Date.now();
      }
      if (++packets > 12) return;
      const parsed = presenceInputSchema.safeParse(raw);
      if (!parsed.success) return;
      try {
        await sessions.require(entry.token);
        const member = await service.access(entry.ownerId, entry.projectId);
        if (
          !(await service.validPresence(entry.projectId, parsed.data.player, parsed.data.floorId))
        )
          return;
        entry.value = { ...entry.value, ...parsed.data, member: memberView(member) };
        entry.seen = Date.now();
        publish(entry.projectId);
      } catch {
        socket.disconnect(true);
      }
    });
    socket.on('disconnect', () => {
      const entry = presence.get(socket.id);
      presence.delete(socket.id);
      if (entry) publish(entry.projectId);
    });
  });
  const expiry = setInterval(() => {
    for (const [id, entry] of presence)
      if (Date.now() - entry.seen > 15000) io.sockets.sockets.get(id)?.disconnect(true);
  }, 5000);
  expiry.unref();
  app.addHook('preClose', async () => {
    clearInterval(expiry);
    service.changes.delete(changed);
    io.disconnectSockets(true);
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
}

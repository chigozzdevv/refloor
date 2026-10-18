import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '@refloor/server/features/sessions/session.service';
import { sessionCookie, sessionLifetime } from '@refloor/server/features/sessions/session.model';

export class SessionController {
  constructor(
    private readonly sessions: SessionService,
    private readonly production: boolean,
  ) {}

  owner(request: FastifyRequest) {
    return this.sessions.require(request.cookies[sessionCookie]);
  }

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = await this.sessions.create(request.cookies[sessionCookie]);
    if (token)
      reply.setCookie(sessionCookie, token, {
        path: '/api',
        httpOnly: true,
        sameSite: 'lax',
        secure: this.production,
        maxAge: sessionLifetime,
      });
    return { ready: true };
  };
}

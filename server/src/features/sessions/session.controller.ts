import type { FastifyRequest, FastifyReply } from 'fastify';
import type { SessionService } from '@refloor/server/features/sessions/session.service';
import { sessionCookie, sessionLifetime } from '@refloor/server/features/sessions/session.model';
import { z } from 'zod';

const recoverySchema = z.strictObject({
  key: z
    .string()
    .trim()
    .regex(/^rf_[a-f0-9]{64}$/),
});

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
    if (token) this.cookie(reply, token);
    return { ready: true };
  };

  recovery = async (request: FastifyRequest) => ({
    key: await this.sessions.recoveryKey(request.cookies[sessionCookie]),
  });

  recover = async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = recoverySchema.parse(request.body),
      token = await this.sessions.recover(key);
    this.cookie(reply, token);
    return { ready: true };
  };

  private cookie(reply: FastifyReply, token: string) {
    reply.setCookie(sessionCookie, token, {
      path: '/api',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.production,
      maxAge: sessionLifetime,
    });
  }
}

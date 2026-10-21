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
    private readonly cookieName = sessionCookie,
  ) {}

  owner(request: FastifyRequest) {
    return this.sessions.require(request.cookies[this.cookieName]);
  }

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = await this.sessions.create(request.cookies[this.cookieName]);
    if (token) this.cookie(reply, token);
    return { ready: true };
  };

  recovery = async (request: FastifyRequest) => ({
    key: await this.sessions.recoveryKey(request.cookies[this.cookieName]),
  });

  recover = async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = recoverySchema.parse(request.body),
      token = await this.sessions.recover(key);
    this.cookie(reply, token);
    return { ready: true };
  };

  private cookie(reply: FastifyReply, token: string) {
    reply.setCookie(this.cookieName, token, {
      path: '/api',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.production,
      maxAge: sessionLifetime,
    });
  }
}

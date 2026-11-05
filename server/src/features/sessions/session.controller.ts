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
    return this.sessions.require(this.token(request));
  }

  create = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = await this.sessions.create(this.token(request));
    return this.ready(request, reply, token);
  };

  recovery = async (request: FastifyRequest) => ({
    key: await this.sessions.recoveryKey(this.token(request)),
  });

  recover = async (request: FastifyRequest, reply: FastifyReply) => {
    const { key } = recoverySchema.parse(request.body),
      token = await this.sessions.recover(key);
    return this.ready(request, reply, token);
  };

  private token(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    return authorization === undefined
      ? request.cookies[this.cookieName]
      : /^Bearer ([a-f0-9]{64})$/.exec(authorization)?.[1];
  }

  private ready(request: FastifyRequest, reply: FastifyReply, token: string) {
    if (request.headers['x-refloor-session'] === 'token') return { ready: true, token };
    this.cookie(reply, token);
    return { ready: true };
  }

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

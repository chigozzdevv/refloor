import { createHash, randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Database } from '@refloor/server/database/connection';
import { ApiError } from '@refloor/server/http/errors';

const cookieName = 'refloor_session';
const lifetime = 30 * 24 * 60 * 60;
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class Sessions {
  constructor(
    private readonly database: Database,
    private readonly production: boolean,
  ) {}

  async find(request: FastifyRequest): Promise<string | null> {
    const token = request.cookies[cookieName];
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const record = await this.database.sessions.findOne({
      _id: hashToken(token),
      expiresAt: { $gt: new Date() },
    });
    return record?._id ?? null;
  }

  async require(request: FastifyRequest): Promise<string> {
    const owner = await this.find(request);
    if (!owner)
      throw new ApiError(
        401,
        'SESSION_REQUIRED',
        'Start a browser session before opening saved projects.',
      );
    return owner;
  }

  async create(request: FastifyRequest, reply: FastifyReply) {
    if (await this.find(request)) return { ready: true };
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    await this.database.sessions.insertOne({
      _id: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + lifetime * 1000),
    });
    reply.setCookie(cookieName, token, {
      path: '/api',
      httpOnly: true,
      sameSite: 'lax',
      secure: this.production,
      maxAge: lifetime,
    });
    return { ready: true };
  }
}

import { createHash, randomBytes } from 'node:crypto';
import type { SessionRepository } from '@refloor/server/features/sessions/session.repo';
import { sessionLifetime } from '@refloor/server/features/sessions/session.model';
import { ApiError } from '@refloor/server/shared/http/errors';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async find(token: string | undefined): Promise<string | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return (await this.sessions.findActive(hashToken(token)))?._id ?? null;
  }

  async require(token: string | undefined): Promise<string> {
    const owner = await this.find(token);
    if (!owner)
      throw new ApiError(
        401,
        'SESSION_REQUIRED',
        'Start a browser session before opening saved projects.',
      );
    return owner;
  }

  async create(existing: string | undefined): Promise<string | null> {
    if (await this.find(existing)) return null;
    const token = randomBytes(32).toString('hex'),
      now = new Date();
    await this.sessions.insert({
      _id: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetime * 1000),
    });
    return token;
  }
}

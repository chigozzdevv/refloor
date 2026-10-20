import { createHash, randomBytes } from 'node:crypto';
import type { SessionRepository } from '@refloor/server/features/sessions/session.repo';
import { sessionLifetime } from '@refloor/server/features/sessions/session.model';
import { ApiError } from '@refloor/server/shared/http/errors';

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export class SessionService {
  constructor(private readonly sessions: SessionRepository) {}

  async find(token: string | undefined): Promise<string | null> {
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.sessions.findActive(hashToken(token));
    return session?.ownerId ?? session?._id ?? null;
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

  async create(existing: string | undefined): Promise<string> {
    if (existing && (await this.find(existing))) {
      await this.sessions.renew(hashToken(existing), new Date(Date.now() + sessionLifetime * 1000));
      return existing;
    }
    const token = randomBytes(32).toString('hex'),
      now = new Date();
    await this.sessions.insert({
      _id: hashToken(token),
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetime * 1000),
    });
    return token;
  }

  async recoveryKey(token: string | undefined) {
    const ownerId = await this.require(token),
      key = `rf_${randomBytes(32).toString('hex')}`;
    await this.sessions.saveRecovery(ownerId, hashToken(key));
    return key;
  }

  async recover(key: string) {
    const recovery = await this.sessions.findRecovery(hashToken(key));
    if (!recovery)
      throw new ApiError(
        401,
        'INVALID_RECOVERY_KEY',
        'This recovery key could not open a collection.',
      );
    const token = randomBytes(32).toString('hex'),
      now = new Date();
    await this.sessions.insert({
      _id: hashToken(token),
      ownerId: recovery._id,
      createdAt: now,
      expiresAt: new Date(now.getTime() + sessionLifetime * 1000),
    });
    return token;
  }
}

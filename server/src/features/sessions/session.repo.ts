import type { Collection, Db } from 'mongodb';
import type {
  RecoveryRecord,
  SessionRecord,
} from '@refloor/server/features/sessions/session.model';

export class SessionRepository {
  private readonly collection: Collection<SessionRecord>;
  private readonly recovery: Collection<RecoveryRecord>;
  constructor(database: Db) {
    this.collection = database.collection<SessionRecord>('sessions');
    this.recovery = database.collection<RecoveryRecord>('session_recovery');
  }

  findActive(id: string) {
    return this.collection.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  }
  async insert(record: SessionRecord) {
    await this.collection.insertOne(record);
  }

  async renew(id: string, expiresAt: Date) {
    await this.collection.updateOne({ _id: id }, { $set: { expiresAt } });
  }

  async saveRecovery(ownerId: string, keyHash: string) {
    await this.recovery.updateOne(
      { _id: ownerId },
      { $set: { keyHash, updatedAt: new Date() } },
      { upsert: true },
    );
  }

  findRecovery(keyHash: string) {
    return this.recovery.findOne({ keyHash });
  }
}

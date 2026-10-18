import type { Collection, Db } from 'mongodb';
import type { SessionRecord } from '@refloor/server/features/sessions/session.model';

export class SessionRepository {
  private readonly collection: Collection<SessionRecord>;
  constructor(database: Db) {
    this.collection = database.collection<SessionRecord>('sessions');
  }

  findActive(id: string) {
    return this.collection.findOne({ _id: id, expiresAt: { $gt: new Date() } });
  }
  async insert(record: SessionRecord) {
    await this.collection.insertOne(record);
  }
}

import { MongoServerError } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import type { GenerationRecord } from '@refloor/server/features/generation/generation.model';

export class GenerationRepository {
  private readonly collection: Collection<GenerationRecord>;
  constructor(database: Db) {
    this.collection = database.collection<GenerationRecord>('generations');
  }
  find(ownerId: string, id: string) {
    return this.collection.findOne({ ownerId, _id: id });
  }
  findRequest(ownerId: string, requestId: string) {
    return this.collection.findOne({ ownerId, requestId });
  }
  async insert(record: GenerationRecord) {
    try {
      await this.collection.insertOne(record);
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }
  async claim() {
    await this.collection.updateMany(
      { active: true, deadline: { $lt: new Date(), $ne: null } },
      {
        $set: {
          active: false,
          status: 'failed',
          error: 'Generation was interrupted. Submit a new request to try again.',
        },
      },
    );
    return this.collection.findOneAndUpdate(
      { status: 'queued', active: true },
      { $set: { status: 'interpreting', deadline: new Date(Date.now() + 180000) } },
      { sort: { createdAt: 1 }, returnDocument: 'after' },
    );
  }
  update(
    id: string,
    change: Partial<Pick<GenerationRecord, 'status' | 'projectId' | 'error' | 'usage' | 'active'>>,
  ) {
    return this.collection.updateOne({ _id: id, active: true }, { $set: change });
  }
}

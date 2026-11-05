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
    const expired = { active: true, deadline: { $lt: new Date(), $ne: null } };
    await this.collection.updateMany(
      { ...expired, recoveries: { $gte: 1 } },
      {
        $set: {
          active: false,
          status: 'failed',
          error: 'Generation was interrupted. Submit a new request to try again.',
        },
      },
    );
    await this.collection.updateMany(
      { ...expired, $or: [{ recoveries: { $exists: false } }, { recoveries: 0 }] },
      {
        $set: { status: 'queued', deadline: null, error: null },
        $inc: { recoveries: 1 },
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
    deadline?: Date,
  ) {
    return this.collection.updateOne(
      { _id: id, active: true, ...(deadline ? { deadline } : {}) },
      { $set: change },
    );
  }
}

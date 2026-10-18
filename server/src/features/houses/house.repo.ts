import { MongoServerError } from 'mongodb';
import type { Db, ClientSession, Collection } from 'mongodb';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';
import type { HouseCursor } from '@refloor/server/features/houses/house.schema';

export class HouseRepository {
  private readonly collection: Collection<HouseRecord>;
  constructor(database: Db) {
    this.collection = database.collection<HouseRecord>('projects');
  }

  find(ownerId: string, id: string, session?: ClientSession) {
    return this.collection.findOne({ _id: id, ownerId }, session ? { session } : {});
  }

  findCreation(ownerId: string, requestId: string) {
    return this.collection.findOne({ ownerId, creationId: requestId });
  }

  list(ownerId: string, limit: number, after: HouseCursor | null) {
    return this.collection
      .find({
        ownerId,
        ...(after
          ? {
              $or: [
                { updatedAt: { $lt: new Date(after.at) } },
                { updatedAt: new Date(after.at), _id: { $lt: after.id } },
              ],
            }
          : {}),
      })
      .sort({ updatedAt: -1, _id: -1 })
      .limit(limit + 1)
      .toArray();
  }

  async insert(record: HouseRecord): Promise<boolean> {
    try {
      await this.collection.insertOne(record);
      return true;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) return false;
      throw error;
    }
  }

  async replace(
    ownerId: string,
    record: HouseRecord,
    expectedVersion: number,
    session: ClientSession,
  ) {
    const result = await this.collection.replaceOne(
      { _id: record._id, ownerId, version: expectedVersion },
      record,
      { session },
    );
    return result.matchedCount === 1;
  }
}

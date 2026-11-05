import { MongoServerError } from 'mongodb';
import type { Db, ClientSession, Collection } from 'mongodb';
import type { HouseRecord } from '@refloor/server/features/houses/house.model';
import type { HouseCursor } from '@refloor/server/features/houses/house.schema';
import type { ProjectCollection } from '@refloor/scene/contracts';

export class HouseRepository {
  private readonly collection: Collection<HouseRecord>;
  constructor(database: Db) {
    this.collection = database.collection<HouseRecord>('projects');
  }

  find(ownerId: string, id: string, session?: ClientSession) {
    return this.collection.findOne(
      { _id: id, ownerId, deleted: { $ne: true } },
      session ? { session } : {},
    );
  }

  findIncludingDeleted(ownerId: string, id: string) {
    return this.collection.findOne({ _id: id, ownerId });
  }

  updateCollection(ownerId: string, id: string, input: ProjectCollection) {
    return this.collection.findOneAndUpdate(
      {
        _id: id,
        ownerId,
        shared: { $ne: true },
        $or: [
          { collectionVersion: input.expectedCollectionVersion },
          ...(input.expectedCollectionVersion === 0
            ? [{ collectionVersion: { $exists: false } as const }]
            : []),
        ],
      },
      {
        $set: {
          ...(input.name === undefined ? {} : { displayName: input.name }),
          ...(input.deleted === undefined ? {} : { deleted: input.deleted }),
          updatedAt: new Date(),
        },
        $inc: { collectionVersion: 1 },
      },
      { returnDocument: 'after' },
    );
  }

  findCreation(ownerId: string, requestId: string) {
    return this.collection.findOne({ ownerId, creationId: requestId });
  }

  list(ownerId: string, limit: number, after: HouseCursor | null, deleted = false) {
    return this.collection
      .find({
        ownerId,
        deleted: deleted ? true : { $ne: true },
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
      { _id: record._id, ownerId, version: expectedVersion, deleted: { $ne: true } },
      record,
      { session },
    );
    return result.matchedCount === 1;
  }
}

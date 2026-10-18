import type { Db } from 'mongodb';

export async function createIndexes(database: Db) {
  await database
    .collection('projects')
    .createIndex({ ownerId: 1, creationId: 1 }, { unique: true });
  await database.collection('projects').createIndex({ ownerId: 1, updatedAt: -1, _id: -1 });
  await database
    .collection('project_revisions')
    .createIndex({ projectId: 1, requestId: 1 }, { unique: true });
  await database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

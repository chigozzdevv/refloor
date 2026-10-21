import type { Db } from 'mongodb';

export async function createIndexes(database: Db) {
  await database
    .collection('project_activity')
    .createIndex({ projectId: 1, originalId: 1, version: -1 });
  await database
    .collection('project_members')
    .createIndex({ projectId: 1, ownerId: 1 }, { unique: true });
  await database.collection('project_invites').createIndex({ tokenHash: 1 }, { unique: true });
  await database
    .collection('project_invites')
    .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database
    .collection('project_activity')
    .createIndex({ projectId: 1, requestId: 1 }, { unique: true });
  await database
    .collection('project_activity')
    .createIndex({ projectId: 1, version: -1 }, { unique: true });
  await database
    .collection('projects')
    .createIndex({ ownerId: 1, creationId: 1 }, { unique: true });
  await database.collection('projects').createIndex({ ownerId: 1, updatedAt: -1, _id: -1 });
  await database
    .collection('project_revisions')
    .createIndex({ projectId: 1, requestId: 1 }, { unique: true });
  await database.collection('sessions').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await database.collection('session_recovery').createIndex({ keyHash: 1 }, { unique: true });
  await database
    .collection('generations')
    .createIndex({ ownerId: 1, requestId: 1 }, { unique: true });
  await database
    .collection('generations')
    .createIndex({ ownerId: 1 }, { unique: true, partialFilterExpression: { active: true } });
  await database.collection('generations').createIndex({ status: 1, createdAt: 1 });
  await database.collection('generations').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
}

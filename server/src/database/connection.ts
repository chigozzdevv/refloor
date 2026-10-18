import { MongoClient } from 'mongodb';
import type { ProjectRecord, RevisionRecord, SessionRecord } from '@refloor/server/database/models';

export async function connectDatabase(uri: string, database: string) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 20,
    appName: 'refloor',
  });
  try {
    await client.connect();
    const db = client.db(database);
    const hello = await db.command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error(
        'MongoDB must use a replica set or sharded cluster for atomic project revisions.',
      );
    const projects = db.collection<ProjectRecord>('projects');
    const revisions = db.collection<RevisionRecord>('project_revisions');
    const sessions = db.collection<SessionRecord>('sessions');
    await projects.createIndex({ ownerId: 1, creationId: 1 }, { unique: true });
    await projects.createIndex({ ownerId: 1, updatedAt: -1, _id: -1 });
    await revisions.createIndex({ projectId: 1, requestId: 1 }, { unique: true });
    await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    return { client, db, projects, revisions, sessions };
  } catch (error) {
    await client.close();
    throw error;
  }
}

export type Database = Awaited<ReturnType<typeof connectDatabase>>;

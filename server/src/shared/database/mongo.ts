import { MongoClient } from 'mongodb';
import { createIndexes } from '@refloor/server/shared/database/indexes';

export async function connectMongo(uri: string, database: string) {
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    maxPoolSize: 20,
    appName: 'refloor',
  });
  try {
    await client.connect();
    const db = client.db(database),
      hello = await db.command({ hello: 1 });
    if (!hello.setName && hello.msg !== 'isdbgrid')
      throw new Error(
        'MongoDB must use a replica set or sharded cluster for atomic project revisions.',
      );
    await createIndexes(db);
    return { client, db };
  } catch (error) {
    await client.close();
    throw error;
  }
}

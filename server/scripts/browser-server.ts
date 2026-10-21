import { randomUUID } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { createApp } from '@refloor/server/app';
import { readConfig } from '@refloor/server/shared/config/env';

const database = `refloor_browser_${randomUUID().replaceAll('-', '')}`,
  config = readConfig({ ...process.env, OPENAI_API_KEY: '' }),
  app = await createApp(
    {
      ...config,
      sessionCookieName: 'refloor_browser_test',
      production: false,
      database,
      host: '127.0.0.1',
      port: 4317,
      clientOrigins: ['http://127.0.0.1:4318'],
    },
    false,
  );
await app.listen({ host: '127.0.0.1', port: 4317 });
console.info('Browser test API ready at http://127.0.0.1:4317');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
  const client = new MongoClient(config.mongoUri);
  try {
    await client.connect();
    await client.db(database).dropDatabase();
  } finally {
    await client.close();
  }
}
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});

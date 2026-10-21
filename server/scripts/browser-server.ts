import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { createApp } from '@refloor/server/app';
import { readConfig } from '@refloor/server/shared/config/env';

const replica = await MongoMemoryReplSet.create({
  // Close the API before MongoDB when Playwright terminates the server process group.
  replSet: { count: 1, storageEngine: 'wiredTiger', ip: '127.0.0.1', spawn: { detached: true } },
});
const config = readConfig({ MONGODB_URI: replica.getUri() });
let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  app = await createApp(
    {
      ...config,
      sessionCookieName: 'refloor_browser_test',
      production: false,
      database: 'refloor_browser',
      host: '127.0.0.1',
      port: 4317,
      clientOrigins: ['http://127.0.0.1:4318'],
    },
    false,
  );
  await app.listen({ host: '127.0.0.1', port: 4317 });
} catch (error) {
  await app?.close();
  await replica.stop({ doCleanup: true });
  throw error;
}
console.info('Browser test API ready at http://127.0.0.1:4317');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  try {
    await app?.close();
  } finally {
    await replica.stop({ doCleanup: true });
  }
}
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});

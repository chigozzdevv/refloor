import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const dbPath = fileURLToPath(new URL('../../.local/mongodb', import.meta.url));
await mkdir(dbPath, { recursive: true });
const replica = await MongoMemoryReplSet.create({
  instanceOpts: [{ port: 27018, dbPath }],
  replSet: { count: 1, name: 'refloor-rs', storageEngine: 'wiredTiger', ip: '127.0.0.1' },
});
console.info('MongoDB ready at mongodb://127.0.0.1:27018/refloor?replicaSet=refloor-rs');
let closing = false;
const close = async () => {
  if (closing) return;
  closing = true;
  await replica.stop({ doCleanup: false });
};
process.once('SIGINT', () => {
  void close();
});
process.once('SIGTERM', () => {
  void close();
});

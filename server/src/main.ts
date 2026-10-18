import { createApp } from '@refloor/server/app';
import { readConfig } from '@refloor/server/config/environment';

let app: Awaited<ReturnType<typeof createApp>> | undefined;
try {
  const config = readConfig();
  const server = await createApp(config);
  app = server;
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    const deadline = setTimeout(() => process.exit(1), 10000).unref();
    try {
      await server.close();
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once('SIGINT', () => {
    void close();
  });
  process.once('SIGTERM', () => {
    void close();
  });
  await server.listen({ host: config.host, port: config.port });
} catch {
  await app?.close();
  console.error(
    'Refloor could not start. Check the environment configuration and MongoDB replica set.',
  );
  process.exitCode = 1;
}

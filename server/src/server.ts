import { createApp } from '@refloor/server/app';
import { readConfig } from '@refloor/server/shared/config/env';

process.once('exit', (code) => {
  console.error(JSON.stringify({ event: 'refloor-process-exit', code }));
});

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
    server.log.info({ signal: 'SIGINT' }, 'Refloor is shutting down');
    void close();
  });
  process.once('SIGTERM', () => {
    server.log.info({ signal: 'SIGTERM' }, 'Refloor is shutting down');
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

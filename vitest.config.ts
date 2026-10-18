import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@refloor\/server\//,
        replacement: fileURLToPath(new URL('./server/src/', import.meta.url)),
      },
      {
        find: /^@server-test\//,
        replacement: fileURLToPath(new URL('./server/test/', import.meta.url)),
      },
      { find: /^@\//, replacement: fileURLToPath(new URL('./client/src/', import.meta.url)) },
      {
        find: /^@refloor\/catalogue$/,
        replacement: fileURLToPath(new URL('./packages/catalogue/src/index.ts', import.meta.url)),
      },
      {
        find: /^@refloor\/catalogue\//,
        replacement: fileURLToPath(new URL('./packages/catalogue/src/', import.meta.url)),
      },
      {
        find: /^@refloor\/engine$/,
        replacement: fileURLToPath(new URL('./packages/engine/src/index.ts', import.meta.url)),
      },
      {
        find: /^@refloor\/engine\//,
        replacement: fileURLToPath(new URL('./packages/engine/src/', import.meta.url)),
      },
      {
        find: /^@engine-test\//,
        replacement: fileURLToPath(new URL('./packages/engine/test/', import.meta.url)),
      },
      {
        find: /^@refloor\/scene$/,
        replacement: fileURLToPath(new URL('./packages/scene/src/index.ts', import.meta.url)),
      },
      {
        find: /^@refloor\/scene\//,
        replacement: fileURLToPath(new URL('./packages/scene/src/', import.meta.url)),
      },
      {
        find: /^@scene-test\//,
        replacement: fileURLToPath(new URL('./packages/scene/test/', import.meta.url)),
      },
    ],
  },
  test: {
    include: [
      'packages/*/test/**/*.test.ts',
      'client/test/**/*.test.ts',
      'server/test/**/*.test.ts',
    ],
    environment: 'node',
  },
});

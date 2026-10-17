import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
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
    include: ['packages/*/test/**/*.test.ts'],
    environment: 'node',
  },
});

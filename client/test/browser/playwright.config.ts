import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const root = fileURLToPath(new URL('../../../', import.meta.url)),
  output = fileURLToPath(new URL('../../../.local/browser-results/', import.meta.url));

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  tsconfig: '../../tsconfig.json',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 20_000 },
  outputDir: output,
  reporter: [['list'], ['html', { outputFolder: `${output}/../browser-report`, open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4318',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        channel: 'chromium',
        viewport: { width: 1280, height: 800 },
        launchOptions: {
          args:
            process.platform === 'darwin' ? ['--use-angle=metal'] : ['--enable-unsafe-swiftshader'],
        },
      },
    },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'], browserName: 'webkit' } },
  ],
  webServer: [
    {
      name: 'Browser test API',
      command: 'pnpm --filter @refloor/server browser:serve',
      cwd: root,
      url: 'http://127.0.0.1:4317/api/health',
      timeout: 60_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
    {
      name: 'Production client preview',
      command: 'pnpm --filter @refloor/client preview --port 4318 --strictPort',
      cwd: root,
      env: { REFLOOR_API_URL: 'http://127.0.0.1:4317' },
      url: 'http://127.0.0.1:4318',
      timeout: 30_000,
      reuseExistingServer: false,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  expect: { timeout: 12_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5187',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'pnpm --filter @atelier/api exec tsx src/index.ts',
      url: 'http://127.0.0.1:3187/api/v1/health',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { PORT: '3187', APP_ORIGIN: 'http://127.0.0.1:5187', DATA_DIR: '../../.data/e2e' },
    },
    {
      command: 'pnpm --filter @atelier/web dev',
      url: 'http://127.0.0.1:5187',
      reuseExistingServer: false,
      timeout: 60_000,
      env: { WEB_PORT: '5187', API_ORIGIN: 'http://127.0.0.1:3187' },
    },
  ],
});

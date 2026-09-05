import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  reporter: 'list',
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_WEB_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
  },
  workers: 1,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a live stack (web + api + db). Start the apps first
 * (`pnpm dev` and `pnpm db:seed`), then run `pnpm e2e`. In CI, bring the stack up
 * via docker-compose before invoking Playwright.
 */
export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.ts',
  timeout: 30_000,
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

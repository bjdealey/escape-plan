import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config. Boots the Vite dev server and runs the core journey against
 * seeded data (no backend, no keys required). Run with `npm run test:e2e`
 * (needs `npx playwright install chromium` once).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 5173',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});

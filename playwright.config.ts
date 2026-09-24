import { defineConfig, devices } from '@playwright/test';

/** Browser tests run against the full docker stack (nginx on :8080) unless E2E_BASE_URL says otherwise. */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  // Each test drives two or three browsers against one stack; keep parallelism modest.
  workers: 3,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e/pages',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4176/Escape-Velocity/',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run preview:pages -- --host 127.0.0.1 --port 4176',
    url: 'http://127.0.0.1:4176/Escape-Velocity/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

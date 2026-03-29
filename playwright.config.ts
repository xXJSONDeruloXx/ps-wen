import { defineConfig, devices } from '@playwright/test';
import { loadEnv, toBoolean } from './scripts/lib/env.js';

const env = loadEnv();
const headless = toBoolean(env.HEADLESS, false);

export default defineConfig({
  testDir: './tests',
  timeout: 120_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    headless,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome']
      }
    }
  ]
});

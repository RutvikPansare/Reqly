import { defineConfig } from '@playwright/test';

/**
 * T-243 Layer 2: Playwright UI regression suite.
 * global-setup boots a live Reqly server on port 4242 against a writable copy
 * of tests/e2e/fixture-project; global-teardown kills it.
 *
 * Port 4242 is the real UI port, but a developer's live Reqly agent may
 * already own it - set REQLY_E2E_UI_PORT to run the suite on another port.
 */
const uiPort = Number(process.env.REQLY_E2E_UI_PORT) || 4242;
export default defineConfig({
  testDir: '.',
  testMatch: 'ui-regression.spec.ts',
  globalSetup: './helpers/global-setup.ts',
  globalTeardown: './helpers/global-teardown.ts',
  // Journeys share one server and some mutate state (env switch, workspace
  // creation), so run them serially in one worker.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  retries: 0,
  outputDir: './screenshots',
  use: {
    baseURL: `http://localhost:${uiPort}`,
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});

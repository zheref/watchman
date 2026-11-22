import { defineConfig } from '@playwright/test';

/**
 * End-to-end checks against the PRODUCTION build (`next start`), run locally and on demand:
 * `npm run build && npm run e2e --workspace @watchman/web`. Not part of CI (CI runs lint,
 * typecheck, unit tests and the build). It uses the installed Google Chrome (`channel: chrome`),
 * so nothing is downloaded; set `PW_CHANNEL=chromium` to use Playwright's own build instead.
 * `WATCHMAN_SNAPSHOT_DIR` is cleared for the server, so it always serves the synthetic fixture.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.results',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL ?? 'chrome',
    headless: true,
  },
  webServer: {
    command: `npx next start -p ${PORT} -H 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { WATCHMAN_SNAPSHOT_DIR: '', NEXT_TELEMETRY_DISABLED: '1' },
  },
});

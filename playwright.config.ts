import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 960, height: 720 },
    screenshot: 'only-on-failure',
    launchOptions: {
      // Use the environment's chromium when the pinned Playwright version's
      // own download is absent (e.g. the Claude Code cloud sandbox).
      executablePath: process.env.CHROMIUM_PATH ?? undefined
    }
  },
  webServer: {
    // Serves the production build; run `npm run build` first.
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: true
  }
});

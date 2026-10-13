import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Screen checks: the real app in a real browser at phone, tablet and desktop sizes, with Scryfall / EDHREC mocked
// (e2e/mock.ts), so they run offline and give the same result every time. `npm run test:screens`.
const local = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'; // preinstalled in Claude's cloud sessions
const launchOptions = existsSync(local) ? { executablePath: local } : {};

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:4173', serviceWorkers: 'block', colorScheme: 'dark', launchOptions },
  projects: [
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions } },
    { name: 'tablet', use: { viewport: { width: 820, height: 1180 }, hasTouch: true, launchOptions } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, launchOptions } },
  ],
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true, timeout: 180_000 },
});

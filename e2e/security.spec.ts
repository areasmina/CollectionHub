import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

// The preview server sends the live site's security headers (vite.config.ts reads vercel.json), so these checks run
// under the real Content-Security-Policy: anything it would block on the live site is blocked here too.
test('Security headers: the page is served with a Content-Security-Policy and frame protection', async ({ page }) => {
  const r = await page.goto('/');
  const h = r!.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['content-security-policy']).toContain("object-src 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
});

test('Security headers: Discover, Collection, My decks and a deck load with nothing blocked by the policy', async ({ page }) => {
  const blocked: string[] = [];
  page.on('console', (m) => /Content Security Policy|Content-Security-Policy/i.test(m.text()) && blocked.push(m.text()));
  await mockWorld(page);
  await seed(page);
  await expect(page.locator('.pillnav')).toBeVisible();
  for (const tab of [/collection/i, /decks/i]) {
    await page.locator('.pillnav').getByRole('button', { name: tab }).first().click();
    await page.waitForTimeout(600);
  }
  await page.getByText('Tatyova Lands').first().click();
  await page.waitForTimeout(1200);
  expect(blocked).toEqual([]);
});

test('Security headers: the policy refuses a host it does not name', async ({ page }) => {
  await page.goto('/');
  const ok = await page.evaluate(() => fetch('https://example.com/x').then(() => true, () => false));
  expect(ok).toBe(false);
});

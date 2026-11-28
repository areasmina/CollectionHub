import { expect, test } from '@playwright/test';
import { mockWorld } from './mock';

/** Nov 28: the foot of the app names the build this device runs, so an old cached copy is easy to spot. */
test('the footer shows the build stamp', async ({ page }) => {
  await mockWorld(page);
  await page.goto('/');
  await expect(page.locator('footer.credits .build')).toHaveText(/build \w{3,7} · \d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC/);
});

import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** ManaBox-style jump rail beside a long deck list: one tag per section, tap one to land on that section. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Deck page: the jump rail lists the sections, fits the screen, and a tap lands on that section', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const rail = page.getByRole('navigation', { name: 'Jump to section' });
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('button')).toHaveText(['CRE', 'INS', 'SOR', 'ART', 'ENC', 'LND']);
  await fits(page, ['.jrail']);
  // The rail sits beside the cards, never on top of them.
  const railBox = (await rail.boundingBox())!;
  const listBox = (await page.locator('#jump-lands > summary').boundingBox())!;
  expect(railBox.x).toBeGreaterThanOrEqual(listBox.x + listBox.width - 1);
  await page.locator('#jump-lands').evaluate((d) => ((d as HTMLDetailsElement).open = false));
  await rail.getByRole('button', { name: 'Jump to Lands' }).click();
  await expect(page.locator('#jump-lands')).toHaveAttribute('open', '');
  await expect(page.locator('#jump-lands > summary')).toBeInViewport();
  await expect(rail.getByRole('button', { name: 'Jump to Lands' })).toHaveAttribute('aria-current', 'true');
});

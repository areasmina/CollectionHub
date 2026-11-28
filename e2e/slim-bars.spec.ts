import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Guillermo, Nov 15: "Suggestion tab and forge bar are too thick… but can people tell that we have a card suggestion
 * tab?" The bar is as tall as the buttons it holds, the sheet peeks as one row, and that row names itself and pulls up.
 */
test('Phone: the Forge bar and the suggestions tab are one row each, and the tab still pulls up', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the suggestions are a bottom sheet only on phones');
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  // Nov 27: FORGE, the CARDS · ANALYSIS · TO BUY faces, ✕ and ☰ share one Island row
  const bar = page.locator('.pillnav .forge-island-wrap');
  await expect(bar).toBeVisible();
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(52);
  await expect(bar.locator('.fcube')).toBeVisible();
  // every control on it is still a full tap target
  for (const b of await bar.locator('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);

  const sugg = page.locator('.fsugg');
  expect((await sugg.boundingBox())!.height).toBeLessThanOrEqual(60);
  // the row says what it is, and the handle on it is a 44px pull
  await expect(sugg).toContainText('SUGGESTIONS');
  const grab = sugg.locator('.fgrab');
  expect((await grab.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
  await grab.click();
  await expect(page.locator('.fsugg.up')).toHaveCount(1);
  await page.waitForTimeout(500); // it glides up
  expect((await sugg.boundingBox())!.height).toBeGreaterThan(200);
});

test('The suggestions name themselves as your own cards', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.locator('.ccard').first().click();
  await page.locator('.dstrip .forge').click(); // the commander page opens the Forge
  const sugg = page.locator('.fsugg');
  await expect(sugg).toBeVisible();
  if (await sugg.locator('.fgrab').isVisible()) await sugg.locator('.fgrab').click();
  await expect(sugg.locator('.fsugg-header')).toContainText(/SUGGESTIONS/);
  await expect(sugg.locator('.ftabs')).toHaveCount(0); // no ALL / OWNED / NOT OWNED any more
});

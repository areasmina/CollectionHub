import { expect, test } from '@playwright/test';
import { mockWorld, openImport, seed } from './mock';

/**
 * Collection: HIDE STATS (audit roadmap, phase 3). The stat tiles stay exactly as they are and show by default; folding
 * them puts cards on the first phone screen. + DECK and IMPORT stay reachable and the choice is remembered.
 */
test('Collection: HIDE STATS folds the tiles, keeps + DECK and IMPORT, shows cards on the first screen, and is remembered', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const fold = page.locator('.coll .statfold');
  const tiles = page.locator('.coll .stats > .stat');
  // open by default: the three tiles, the appraisal and Top 3 are all there
  await expect(fold).toHaveText('HIDE STATS ▴');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.first()).toBeVisible();
  await expect(page.locator('.coll .slip-val')).toBeVisible();
  await expect(page.locator('.coll .topwidget')).toBeVisible();
  expect((await fold.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await fold.click();
  await expect(fold).toHaveText('SHOW STATS ▾');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(tiles.first()).toBeHidden();
  await expect(page.locator('.coll .slip-val')).toBeHidden();
  await expect(page.locator('.coll .topwidget')).toBeHidden();
  await expect(page.locator('.slip-btn.deck')).toBeVisible();
  // a card picture now starts inside the first screen (on a phone it started below it)
  const card = page.locator('.timg').first();
  await expect(card).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  const top = (await card.boundingBox())!.y;
  expect(top).toBeLessThan(page.viewportSize()!.height * 0.75);
  await page.screenshot({ path: `test-results/collection-folded-${info.project.name}.png` });
  // IMPORT still opens its pop-up
  const pop = await openImport(page);
  await pop.getByRole('button', { name: 'Close dialog' }).click();

  // remembered on this device, and one tap brings everything back
  await page.reload();
  await expect(fold).toHaveText('SHOW STATS ▾');
  await expect(tiles.first()).toBeHidden();
  await fold.click();
  await expect(tiles.first()).toBeVisible();
  await expect(page.locator('.coll .topwidget')).toBeVisible();
});

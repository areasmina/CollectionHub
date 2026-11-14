import { expect, test } from '@playwright/test';
import { mockWorld, openImport, seed } from './mock';

/**
 * Collection: SHOW / HIDE STATS. The stat tiles start folded (Guillermo, Nov 13), so cards are on the first screen; the
 * button sits on the row of + DECK and IMPORT, which stay reachable. The choice is remembered.
 */
test('Collection: stats start folded, SHOW STATS sits beside + DECK and IMPORT, cards on the first screen, and the choice is remembered', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const fold = page.locator('.coll .statfold');
  const tiles = page.locator('.coll .stats > .stat');
  // folded at first: no tiles, appraisal or Top 3; + DECK and IMPORT are there
  await expect(fold).toHaveText('SHOW STATS ▾');
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(tiles.first()).toBeHidden();
  await expect(page.locator('.coll .slip-val')).toBeHidden();
  await expect(page.locator('.coll .topwidget')).toBeHidden();
  await expect(page.locator('.slip-btn.deck')).toBeVisible();
  expect((await fold.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // one row of controls: the button lines up with IMPORT, in both states
  const mid = async (sel: string) => { const b = (await page.locator(sel).boundingBox())!; return b.y + b.height / 2; };
  expect(Math.abs((await mid('.coll .statfold')) - (await mid('.slip-btn.import')))).toBeLessThanOrEqual(3);
  // a card picture starts inside the first screen
  const card = page.locator('.timg').first();
  await expect(card).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  const top = (await card.boundingBox())!.y;
  expect(top).toBeLessThan(page.viewportSize()!.height * 0.75);
  await page.screenshot({ path: `test-results/collection-folded-${info.project.name}.png` });

  // SHOW STATS brings the three tiles, the appraisal and Top 3
  await fold.click();
  await expect(fold).toHaveText('HIDE STATS ▴');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(tiles).toHaveCount(3);
  await expect(tiles.first()).toBeVisible();
  await expect(page.locator('.coll .slip-val')).toBeVisible();
  await expect(page.locator('.coll .topwidget')).toBeVisible();
  expect(Math.abs((await mid('.coll .statfold')) - (await mid('.slip-btn.import')))).toBeLessThanOrEqual(3);
  // IMPORT still opens its pop-up
  const pop = await openImport(page);
  await pop.getByRole('button', { name: 'Close dialog' }).click();

  // remembered on this device, and one tap folds everything again
  await page.reload();
  await expect(fold).toHaveText('HIDE STATS ▴');
  await expect(tiles.first()).toBeVisible();
  await fold.click();
  await expect(tiles.first()).toBeHidden();
  await expect(page.locator('.coll .topwidget')).toBeHidden();
});

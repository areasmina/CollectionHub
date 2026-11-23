import { expect, test } from '@playwright/test';
import { mockWorld, openImport, seed } from './mock';

/**
 * Collection: CARDS | ANALYTICS (Guillermo, Nov 15). The binder is what this page promises, so cards are the first
 * thing on screen, every time it opens; the stat tiles, Top 3 and the charts sit on the second tab. + DECK and IMPORT
 * live on the tab row, so they are one tap away from either tab. This replaces the old SHOW / HIDE STATS fold.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
});

const tab = (page: import('@playwright/test').Page, name: 'CARDS' | 'ANALYTICS') => page.locator('.coll .ctab', { hasText: name });

test('Collection opens on the cards, with the tiles and charts a tap away on the ANALYTICS tab', async ({ page }, info) => {
  await expect(tab(page, 'CARDS')).toHaveAttribute('aria-selected', 'true');
  // nothing above the cards but the title and the tab row
  await expect(page.locator('.coll .stats')).toHaveCount(0);
  await expect(page.locator('.coll .topwidget')).toHaveCount(0);
  await expect(page.locator('.apanel')).toHaveCount(0);
  const card = page.locator('.coll .timg').first();
  await expect(card).toBeVisible();
  await page.evaluate(() => scrollTo(0, 0));
  expect((await card.boundingBox())!.y).toBeLessThan(page.viewportSize()!.height * 0.55);
  await page.screenshot({ path: `test-results/collection-cards-tab-${info.project.name}.png` });

  // both buttons sit on the tab row, on one line with the tabs, at a full tap height
  const mid = async (sel: string) => { const b = (await page.locator(sel).boundingBox())!; return b.y + b.height / 2; };
  expect(Math.abs((await mid('.coll .ctab-acts .slip-btn.import')) - (await mid('.coll .ctab.on')))).toBeLessThanOrEqual(4);
  expect((await page.locator('.coll .ctab.on').boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const pop = await openImport(page);
  await pop.getByRole('button', { name: 'Close dialog' }).click();

  // ANALYTICS: the three tiles, the appraisal, Top 3 and the charts; no cards grid behind them
  await tab(page, 'ANALYTICS').click();
  await expect(tab(page, 'ANALYTICS')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.coll .stats > .stat')).toHaveCount(3);
  await expect(page.locator('.coll .slip-val')).toBeVisible();
  await expect(page.locator('.coll .topwidget')).toBeVisible();
  await expect(page.locator('.apanel .acard').first()).toBeVisible();
  await expect(page.locator('.coll .ctile')).toHaveCount(0);
  await expect(page.locator('.coll .coll-listbar')).toHaveCount(0);
  await expect(page.locator('.coll .ctab-acts .slip-btn.deck')).toBeVisible();
  await page.screenshot({ path: `test-results/collection-analytics-tab-${info.project.name}.png` });

  // CARDS brings the binder back, and a fresh open always starts there
  await tab(page, 'CARDS').click();
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
  await page.reload();
  await expect(tab(page, 'CARDS')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.coll .stats')).toHaveCount(0);
});

test('the analytics cards wear the same zine frame as the stat tiles', async ({ page }) => {
  await tab(page, 'ANALYTICS').click();
  const tile = page.locator('.coll .stats > .stat').first();
  const acard = page.locator('.apanel .acard').first();
  await expect(acard).toBeVisible();
  const look = async (l: ReturnType<typeof page.locator>) =>
    l.evaluate((el) => { const s = getComputedStyle(el); return { bg: s.backgroundColor, img: s.backgroundImage, shadow: s.boxShadow, tilt: s.transform }; });
  const [t, a] = [await look(tile), await look(acard)];
  expect(a.img).toContain('radial-gradient'); // the halftone dots of the tiles
  expect(t.img).toContain('radial-gradient');
  expect(a.bg).toBe(t.bg); // same ink
  expect(a.shadow).not.toBe('none'); // hard shadow
  // a slight tilt on phones, like everything else on the page; from tablet up the cards sit square so the dashboard's
  // edges line up (Guillermo, Nov 23)
  if (page.viewportSize()!.width > 700) expect(a.tilt).toBe('none');
  else expect(a.tilt).not.toBe('none');
});

import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed, settled } from './mock';

/**
 * Guillermo, Nov 19 (phone screenshot, island docked on the top edge): "suggestion box looks weird in mobile, forge
 * button too, and the whole page composition". Two causes, both only with the island on top:
 *  1. the black fill meant for the strip above a *pinned* Forge bar also showed while the bar sat in the page, painting
 *     a black band over the deck's price line (it read as a big empty gap above FORGE);
 *  2. the 52px "sit under the island" offset for pinned toolbars also hit the Forge's deck toolbar on phones, which is
 *     not pinned there, so it slid 52px down: a gap under CARDS · ANALYSIS · TO BUY and the toolbar over the hint line.
 */
const islandOnTop = async (page: Page) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => {
    localStorage.setItem('ch:tab', 'decks');
    localStorage.setItem('ch:island_dock', 'top');
  });
  await page.reload();
  await page.locator('.dcard').first().click();
  await expect(page.locator('.forgetop')).toBeVisible();
  await settled(page);
};
const box = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
});

test('Island on top: the Forge Island contains the Forge bar and leaves the deck price strip uncovered', async ({ page }) => {
  await islandOnTop(page);
  await expect(page.locator('.pillnav.dock-top.forging-island')).toHaveCount(1);
  expect((await box(page, '.pillnav .forgetop')).top).toBeGreaterThanOrEqual(0);
  const strip = page.locator('.dstrip, .vnote').first();
  if (await strip.count()) {
    const hit = await strip.evaluate((e) => {
      const r = e.getBoundingClientRect();
      const y = r.top + r.height / 2;
      if (y < 0 || y > innerHeight) return true; // off screen at this size: nothing to cover
      const at = document.elementFromPoint(r.left + 20, y);
      return !!at && (e === at || e.contains(at));
    });
    expect(hit).toBe(true);
  }
});

test('Phone, island on top: the Forge tabs sit inside the Island under the Forge bar and clear the deck toolbar', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the CARDS · ANALYSIS · TO BUY cube is phone only');
  await islandOnTop(page);
  const ftop = await box(page, '.pillnav .forgetop');
  const cube = await box(page, '.pillnav .fcube');
  const tools = await box(page, '.lists > .dtools.tbar');
  const hint = await box(page, '.lists > .forgehint');
  expect(cube.top).toBeGreaterThanOrEqual(ftop.bottom - 2);
  expect(tools.top).toBeGreaterThanOrEqual(cube.bottom - 1);
  expect(tools.bottom).toBeLessThanOrEqual(hint.top + 1);
});

test('Phone, island on top: scrolled, the Forge Island stays docked with accessible tabs and full tap targets', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the CARDS · ANALYSIS · TO BUY cube is phone only');
  await islandOnTop(page);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(300);
  await expect(page.locator('.pillnav.dock-top.forging-island:not(.away)')).toHaveCount(1);
  await expect.poll(async () => (await box(page, '.pillnav .forgetop')).top).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => (await box(page, '.pillnav .fcube')).top - (await box(page, '.pillnav .forgetop')).bottom).toBeGreaterThanOrEqual(-2);
  for (const b of await page.locator('.fcube > button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

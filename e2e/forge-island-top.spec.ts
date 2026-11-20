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
const fill = (page: Page) => page.locator('.forgetop').evaluate((e) => getComputedStyle(e, '::before').content);

test('Island on top: the Forge bar paints nothing over the deck price line until it is pinned', async ({ page }) => {
  await islandOnTop(page);
  await expect(page.locator('.pillnav.dock-top')).toHaveCount(1);
  // at rest the bar is in the page, so no fill above it, and the price line just above it is fully visible
  await expect(page.locator('.forgetop')).not.toHaveClass(/stuck/);
  expect(['none', 'normal']).toContain(await fill(page));
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

test('Phone, island on top: the deck toolbar sits right under the Forge tabs, with no overlap', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the CARDS · ANALYSIS · TO BUY cube is phone only');
  await islandOnTop(page);
  const cube = await box(page, '.fcube');
  const tools = await box(page, '.lists > .dtools.tbar');
  const hint = await box(page, '.lists > .forgehint');
  expect(tools.top - cube.bottom).toBeLessThanOrEqual(28); // was 64px of empty band
  expect(tools.top).toBeGreaterThanOrEqual(cube.bottom - 1);
  expect(tools.bottom).toBeLessThanOrEqual(hint.top + 1); // the toolbar no longer slides over the hint line
});

test('Phone, island on top: pinned, the Forge bar sits under the island and the tabs under the bar', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the CARDS · ANALYSIS · TO BUY cube is phone only');
  await islandOnTop(page);
  await page.mouse.wheel(0, 900);
  await page.waitForTimeout(400);
  await page.mouse.wheel(0, -150); // scrolling up brings the island back
  await expect(page.locator('.pillnav.dock-top:not(.away)')).toHaveCount(1);
  await expect(page.locator('.forgetop')).toHaveClass(/stuck/);
  await expect.poll(() => fill(page)).not.toBe('none');
  await expect.poll(async () => (await box(page, '.forgetop')).top).toBeGreaterThanOrEqual(45);
  // the tabs are below the bar, not hidden behind it
  await expect.poll(async () => (await box(page, '.fcube')).top - (await box(page, '.forgetop')).bottom).toBeGreaterThanOrEqual(-2);
  // every tab is still a full tap target
  for (const b of await page.locator('.fcube > button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5);
});

import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Dynamic Island, phase 4 step 1: the island only stays put where its own edge has room. A top-docked island used to
 * come back at the END of a page and land on content (Collection's + DECK and IMPORT on desktop).
 */
const open = async (page: Page, dock: string, tab: string) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(([d, t]) => (localStorage.setItem('ch:island_dock', d), localStorage.setItem('ch:tab', t)), [dock, tab]);
  await page.reload();
  await page.waitForSelector('.pillnav', { state: 'attached' });
};
/** Make the page long enough to scroll well past the island's rest zones, whatever the sample data gives. */
const stretch = (page: Page) => page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 3}px`));
const toEnd = (page: Page) => page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
/** Tappable things under the island's visible body right now. */
const covered = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector('.pillnav')!;
    const c = nav.querySelector('.island-content')!.getBoundingClientRect();
    const hit = new Set<string>();
    for (let x = c.left + 3; x < c.right; x += 12)
      for (let y = Math.max(0, c.top) + 3; y < Math.min(innerHeight, c.bottom); y += 8)
        for (const e of document.elementsFromPoint(x, y))
          if (!nav.contains(e) && e.matches('button, a, input, select, summary')) hit.add(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]} "${(e.textContent ?? '').trim().slice(0, 14)}"`);
    return [...hit];
  });

for (const dock of ['top', 'left', 'right'] as const)
  test(`Island docked ${dock}: shows at the start of a page, stays away at the end, comes back on the way up`, async ({ page }) => {
    await open(page, dock, 'collection');
    await page.waitForSelector('.timg');
    await stretch(page);
    const nav = page.locator(`.pillnav.dock-${dock}`);
    await expect(nav).toBeVisible();
    await expect(page.locator('.pillnav.away')).toHaveCount(0); // start of the page: shown
    await page.mouse.wheel(0, 400);
    await expect(page.locator('.pillnav.away')).toHaveCount(1); // going down: away
    await toEnd(page);
    await page.waitForTimeout(400);
    await expect(page.locator('.pillnav.away')).toHaveCount(1); // the end of the page no longer brings it back over content
    await page.mouse.wheel(0, -200);
    await expect(page.locator('.pillnav.away')).toHaveCount(0); // going up: back
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator('.pillnav.away')).toHaveCount(0);
  });

test('Island docked top: at the end of Collection it is not sitting on + DECK or IMPORT', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'phones dock at the bottom by default; the top dock on phones is covered by the test above');
  await open(page, 'top', 'collection');
  await page.waitForSelector('.timg');
  await toEnd(page);
  await page.waitForTimeout(500);
  if (await page.evaluate(() => scrollY >= 80)) expect(await covered(page)).toEqual([]); // scrolled past the start: nothing tappable under it
});

test('Island docked bottom: shows at the top and the end of a page, away while going down, and the end has room for it', async ({ page }) => {
  await open(page, 'bottom', 'collection');
  await page.waitForSelector('.timg');
  await stretch(page);
  await expect(page.locator('.pillnav.dock-bottom')).toBeVisible();
  await expect(page.locator('.pillnav.away')).toHaveCount(0); // a freshly opened page shows its nav
  await page.mouse.wheel(0, 300);
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  await toEnd(page);
  await expect(page.locator('.pillnav.away')).toHaveCount(0); // the end of the page: back, on the room the page leaves
  await page.waitForTimeout(500);
  expect(await covered(page)).toEqual([]);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
});

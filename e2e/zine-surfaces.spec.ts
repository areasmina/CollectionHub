import { expect, test } from '@playwright/test';
import { mockWorld, seed, showStats } from './mock';

/**
 * Round 7 (Guillermo, Nov 16): one cohesive zine surface. The furniture a reader works with — search, filters,
 * menus, tabs, the stat tiles, TOP 3 and the analytics cards — carries no white frame at any width. White belongs to
 * the paper pieces (the appraised slip, the ransom letters, the chosen tab), never to a box drawn round content.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

/** Anything with a white-ish border of its own, inside the given part of the page. */
const whiteFramed = (page: import('@playwright/test').Page, root: string) =>
  page.evaluate((sel) => {
    const white = (c: string) => {
      const m = c.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?\)/);
      if (!m) return false;
      const [r, g, b] = [1, 2, 3].map((i) => Number(m[i]));
      return (m[4] === undefined ? 1 : Number(m[4])) > 0.35 && r > 170 && g > 170 && b > 170;
    };
    const out: string[] = [];
    for (const e of document.querySelectorAll(`${sel} *`)) {
      const s = getComputedStyle(e);
      const r = e.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) continue;
      const sides = ['Top', 'Right', 'Bottom', 'Left'].filter(
        (k) => parseFloat(s[`border${k}Width` as 'borderTopWidth']) > 0 && white(s[`border${k}Color` as 'borderTopColor']),
      );
      if (sides.length) out.push(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]}`);
    }
    return [...new Set(out)];
  }, root);

test('Collection analytics: the stat tiles, TOP 3 and the charts carry no white frame', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
  await page.getByRole('tab', { name: /ANALYTICS/ }).click();
  await expect(page.locator('.apanel .acard').first()).toBeVisible();
  expect(await whiteFramed(page, '.coll .stats')).toEqual([]);
  expect(await whiteFramed(page, '.apanel')).toEqual([]);
  // Nov 23 (Guillermo: "make it feel like a real analysis dashboard"): from tablet up the cards of one row line up,
  // same top and same height, so the panel reads as one dashboard rather than loose cards
  if (page.viewportSize()!.width > 700) {
    expect(await page.locator('.apanel .agrid').evaluate((e) => getComputedStyle(e).alignItems)).toBe('stretch');
    const rows = await page.locator('.apanel .acard').evaluateAll((els) => {
      const by = new Map<number, number[]>();
      for (const e of els) {
        const r = e.getBoundingClientRect();
        by.set(Math.round(r.top), [...(by.get(Math.round(r.top)) ?? []), Math.round(r.height)]);
      }
      return [...by.values()];
    });
    for (const heights of rows) expect(new Set(heights).size, `card heights in one row: ${heights}`).toBe(1);
  }
});

test('Collection: the search bar, the filter sheet and the card menu carry no white frame', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
  expect(await whiteFramed(page, '.collbar, .dtools')).toEqual([]);
  await page.getByRole('button', { name: /^Filter/ }).click();
  await expect(page.getByRole('dialog', { name: 'Filter cards' })).toBeVisible();
  expect(await whiteFramed(page, '.fsheet2')).toEqual([]);
});

test('My Decks: the stat tiles are no wider than they need, the colour count sits at the right, and STATS is lettered like the buttons beside it', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'the row stacks on phones; the title band holds one button per line');
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  const fold = page.getByRole('tab', { name: /STATS/ });
  await expect(fold).toBeVisible();
  const fonts = await page.evaluate(() => {
    const f = (el: Element | null) => (el ? getComputedStyle(el).fontFamily : '');
    const acts = document.querySelector('.titleacts')!;
    return { fold: f(acts.querySelector('.ctab')), btn: f(acts.querySelector('.slip-btn')) };
  });
  expect(fonts.fold).toBe(fonts.btn);
  await showStats(page);
  await expect(page.locator('.dstats .stat').first()).toBeVisible();
  expect(await whiteFramed(page, '.dstats')).toEqual([]);
  const boxes = await page.locator('.dstats .stat').evaluateAll((els) => els.map((e) => ({ cls: e.className, ...e.getBoundingClientRect().toJSON() })));
  const cols = boxes.find((b) => b.cls.includes('dcols'));
  const rest = boxes.filter((b) => !b.cls.includes('dcols'));
  for (const b of rest) expect(b.width).toBeLessThanOrEqual(280); // no tile stretched across the screen
  if (cols) expect(cols.x).toBeGreaterThan(Math.max(...rest.map((b) => b.x))); // colour count at the right
});

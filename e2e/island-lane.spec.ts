import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Dynamic Island, phase 4 step 2 (clear lane) and the side-bar shape Guillermo asked for on Nov 13.
 * - On the left or right edge the island is a thin bar (46px, like the top and bottom island), and the page keeps a
 *   46px lane free on that side, so at rest it never sits on a button, a card picture or a name.
 * - On the top edge nothing is under it at the start of a page (the Forge bar steps down under it).
 * - On the bottom edge nothing is under it at the end of a page. At the very top of a page it covers the last row of
 *   the first screen until the first small scroll: Guillermo's pick ("Keep it, covers until you scroll").
 * - While the page moves the island turns see-through; at rest it is solid again.
 */
const open = async (page: Page, dock: string, tab: string) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(([d, t]) => (localStorage.setItem('ch:island_dock', d), localStorage.setItem('ch:tab', t)), [dock, tab]);
  await page.reload();
  await page.waitForSelector('.pillnav', { state: 'attached' });
};
/** What you would see under the island: the topmost thing at each point of its body, if it is tappable, a card picture or a name. */
const under = (page: Page) =>
  page.evaluate(() => {
    const nav = document.querySelector('.pillnav') as HTMLElement;
    if (nav.classList.contains('away')) return [];
    const off = document.createElement('style');
    off.textContent = '.pillnav, .pillnav * { pointer-events: none !important; }';
    document.head.append(off);
    const c = nav.querySelector('.island-content')!.getBoundingClientRect();
    const hit = new Set<string>();
    for (let x = c.left + 2; x < c.right - 1; x += 6)
      for (let y = Math.max(0, c.top) + 2; y < Math.min(innerHeight, c.bottom) - 1; y += 6) {
        const e = document.elementFromPoint(x, y)?.closest('button, a, input, select, summary, img, [class*="name"]');
        if (e) hit.add(`${e.tagName.toLowerCase()}.${String((e as HTMLElement).className).split(' ')[0]} "${(e.textContent ?? '').trim().slice(0, 14)}"`);
      }
    off.remove();
    return [...hit];
  });
const pages: [string, string, (p: Page) => Promise<void>][] = [
  ['Discover', 'discover', async (p) => void (await p.waitForSelector('.ccard'))],
  ['commander page', 'discover', async (p) => (await p.locator('.ccard').first().click(), void (await p.waitForSelector('details.cat')))],
  ['Collection', 'collection', async (p) => void (await p.waitForSelector('.timg'))],
  ['My Decks', 'decks', async (p) => void (await p.waitForSelector('.dcard'))],
  ['saved deck', 'decks', async (p) => (await p.locator('.dcard').first().click(), void (await p.waitForSelector('.lists')))],
];

for (const dock of ['left', 'right'] as const)
  test(`Island docked ${dock}: a thin bar, and nothing on any main page sits under it`, async ({ page }) => {
    test.setTimeout(90_000);
    for (const [name, tab, go] of pages) {
      await open(page, dock, tab);
      await go(page);
      await page.waitForTimeout(700);
      const box = (await page.locator('.pillnav').boundingBox())!;
      expect(box.width, 'side island is a thin bar').toBeLessThanOrEqual(47);
      expect(box.height, 'side island runs along the edge').toBeGreaterThan(box.width * 4);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(500);
      expect(await under(page), `${name}, start of the page`).toEqual([]);
    }
  });

test('Island docked top: nothing under it at the start of any main page', async ({ page }) => {
  test.setTimeout(90_000);
  for (const [name, tab, go] of pages) {
    await open(page, 'top', tab);
    await go(page);
    await page.waitForTimeout(700);
    expect(await under(page), name).toEqual([]);
  }
});

test('Island docked bottom: nothing under it at the end of any main page', async ({ page }) => {
  test.setTimeout(90_000);
  for (const [name, tab, go] of pages) {
    await open(page, 'bottom', tab);
    await go(page);
    await page.waitForTimeout(700); // let the page finish growing (pictures, lists) before going to its end
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(700);
    expect(await under(page), name).toEqual([]);
  }
});

test('Side bar: the section names run down the bar and each still opens its section', async ({ page }) => {
  await open(page, 'right', 'discover');
  await page.waitForSelector('.ccard');
  const btn = page.locator('.pillnav .pill button', { hasText: 'COLLECTION' });
  const b = (await btn.boundingBox())!;
  expect(b.height).toBeGreaterThan(b.width); // the name reads down the bar
  // the whole name fits inside the button (measured on the text itself: the 44px tap area around it doesn't count)
  const fit = await btn.evaluate((e) => {
    const r = document.createRange();
    r.selectNodeContents(e);
    const t = r.getBoundingClientRect(), o = e.getBoundingClientRect();
    return t.top >= o.top - 1 && t.bottom <= o.bottom + 1 && t.left >= o.left - 1 && t.right <= o.right + 1;
  });
  expect(fit, 'name is cut').toBe(true);
  await btn.click();
  await expect(page.locator('.timg').first()).toBeVisible();
  await expect(btn).toHaveAttribute('aria-current', 'page');
});

test('While the page moves the island turns see-through, then solid again at rest', async ({ page }) => {
  await open(page, 'top', 'collection');
  await page.waitForSelector('.timg');
  await page.evaluate(() => void ((document.querySelector('.stage') as HTMLElement).style.minHeight = `${innerHeight * 3}px`));
  const bg = () => page.locator('.pillnav').evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(await bg()).toBe('rgb(0, 0, 0)');
  await page.evaluate(() => window.scrollBy(0, 30));
  await expect(page.locator('html.scrolling')).toHaveCount(1);
  await expect.poll(bg).toBe('rgba(0, 0, 0, 0.5)');
  await expect(page.locator('html.scrolling')).toHaveCount(0, { timeout: 2000 });
  await expect.poll(bg).toBe('rgb(0, 0, 0)');
});

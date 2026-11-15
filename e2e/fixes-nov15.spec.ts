import { expect, test } from '@playwright/test';
import { mockWorld, seed, showStats } from './mock';

/** Guillermo's Nov 15 screenshots: overlapping salt list, uneven tiles, loose collection stats, stray diamonds, cut deck name. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const box = (page: import('@playwright/test').Page, sel: string) => page.locator(sel).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));

test('Commander header: equal tiles, and the salt list opens on top of everything', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero .vtile')).toHaveCount(3);
  const tiles = await box(page, '.vhero .vtile > summary');
  for (const t of tiles) {
    expect(Math.abs(t.height - tiles[0].height)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.width - tiles[0].width)).toBeLessThanOrEqual(1);
    expect(Math.abs(t.top - tiles[0].top)).toBeLessThanOrEqual(1);
  }
  await page.locator('.vmeta .scrap.salt summary').click();
  const pop = page.locator('.vmeta .scrap.salt .popnote');
  await expect(pop).toBeVisible();
  // every corner of the list is the list itself, not a link or tile drawn over it
  const covered = () => pop.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [[r.left + 4, r.top + 4], [r.right - 4, r.top + 4], [r.left + 4, r.bottom - 4], [r.right - 4, r.bottom - 4]].filter(([x, y]) => !el.contains(document.elementFromPoint(x, y))).map(([x, y]) => `${x},${y}:${document.elementFromPoint(x, y)?.className}`);
  });
  await expect.poll(covered).toEqual([]); // (it slides on screen first)
});

test('Collection: cards, unique and commanders sit as one even row; no carousel diamonds', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await showStats(page); // the tiles live on the ANALYTICS tab since Nov 15
  await expect(page.locator('.coll .stats > .stat')).toHaveCount(3);
  const s = await box(page, '.coll .stats > .stat');
  for (const t of s) {
    expect(Math.abs(t.top - s[0].top)).toBeLessThanOrEqual(12); // the tiles are tilted a little
    expect(Math.abs(t.height - s[0].height)).toBeLessThanOrEqual(4);
  }
  await expect(page.locator('.twdots')).toHaveCount(0);
});

test('Forge bar: one clean line with no deck name, buttons together, no tab diamonds', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await page.locator('.dstrip .forge').click();
  const bar = page.locator('.forgetop');
  await expect(bar).toBeVisible();
  await expect(bar).not.toContainText('Tatyova'); // the page already says which deck (Guillermo, Nov 15)
  const parts = await box(page, '.forgetop .fstamp, .forgetop > button');
  for (const p of parts) expect(Math.abs(p.top + p.height / 2 - (parts[0].top + parts[0].height / 2))).toBeLessThanOrEqual(4); // one line
  await expect(page.locator('.fcube-dots')).toHaveCount(0);
});

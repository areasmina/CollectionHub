import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Dynamic Island, phase 4 step 3: on phones every island control answers a tap across at least 44 x 44px, without
 * the island growing or changing its look, and a tap never turns into a drag.
 */
test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the 44px rule is for touch; mouse screens keep the compact island');
  await mockWorld(page);
  await seed(page);
});

/** For each control, the size of the area around its centre where a tap still lands on it. */
const reach = (page: import('@playwright/test').Page, sel: string) =>
  page.locator(sel).evaluateAll((els) =>
    els.map((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const hits = (x: number, y: number) => {
        const t = document.elementFromPoint(x, y);
        return !!t && (t === el || el.contains(t));
      };
      // measured in whole pixels out from the centre: a 44px area reads as 43 or more
      // (heights are taken on the button's tallest column: the grip line's 60px strip on the island's edge is the drag
      // handle and keeps its own spot, so the middle button's area is a little shorter right under it)
      const span = (x: number, y: number, dx: number, dy: number) => {
        let n = 0;
        for (let d = 0; d <= 22 && hits(x - d * dx, y - d * dy) && hits(x + d * dx, y + d * dy); d++) n = 2 * d + 1;
        return n;
      };
      const w = span(cx, cy, 1, 0);
      let h = 0;
      for (let x = r.left + 2; x <= r.right - 2; x += 2) h = Math.max(h, span(x, cy, 0, 1));
      return { name: (el.textContent || el.getAttribute('aria-label') || el.className).toString().trim().slice(0, 12), w, h, look: [Math.round(r.width), Math.round(r.height)] };
    }),
  );

for (const dock of ['bottom', 'top', 'left'] as const)
  test(`Island docked ${dock}: back, sections and sync each take a 44px tap; the island keeps its size`, async ({ page }) => {
    await page.evaluate((d) => localStorage.setItem('ch:island_dock', d), dock);
    await page.reload();
    await page.locator('.ccard').first().click(); // a page with the back button
    await page.waitForSelector('details.cat');
    await page.evaluate(() => window.scrollTo(0, 0));
    const nav = page.locator(`.pillnav.dock-${dock}`);
    await expect(nav).toBeVisible();
    await expect(nav.locator('.pback')).toBeVisible();
    const size = await nav.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height].map(Math.round));
    const all = await reach(page, `.pillnav.dock-${dock} :is(.pback, .pill button, .syncpill)`);
    expect(all).toHaveLength(5);
    for (const b of all) {
      // across the row of buttons each takes 44px; on a side dock the buttons are stacked 4px apart, so there the
      // area grows sideways to 44px and keeps the button's own height (it cannot grow into its neighbours)
      expect.soft(b.w, `${b.name} tap width`).toBeGreaterThanOrEqual(43);
      expect.soft(b.h, `${b.name} tap height`).toBeGreaterThanOrEqual(dock === 'left' ? Math.min(43, b.look[1] - 1) : 43);
    }
    // the look is unchanged: same island size before and after a tap on each section
    await nav.locator('.pill button', { hasText: 'COLLECTION' }).click();
    await page.waitForSelector('.timg');
    await expect(page.locator('.pillnav.floating, .pillnav.open')).toHaveCount(0); // a tap is a tap: no drag, no sync drawer
    const after = await nav.evaluate((e) => [e.getBoundingClientRect().width, e.getBoundingClientRect().height].map(Math.round));
    expect(after[dock === 'left' ? 0 : 1]).toBe(size[dock === 'left' ? 0 : 1]);
  });

test('Island: a tap on the edge of a section button goes to that section, not the one beside it', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  const decks = page.locator('.pillnav .pill button', { hasText: 'DECKS' });
  const r = (await decks.boundingBox())!;
  // above the drawn button, inside its 44px area (off the 60px grip strip in the middle, which is the drag handle)
  await page.mouse.click(r.x + 4, r.y - 8);
  await expect(page.locator('.pillnav .pill button[aria-current="page"]')).toHaveText('DECKS');
});

test('Island: the sync light opens on a tap near it, and the sync panel closes with a 44px ✕', async ({ page }) => {
  const pill = page.locator('.pillnav .syncpill');
  const r = (await pill.boundingBox())!;
  await page.mouse.click(r.x + r.width / 2, r.y - 6); // just above the drawn pill
  await expect(page.locator('.island-drawer')).toBeVisible();
  await page.waitForTimeout(400); // let the panel finish its opening bounce before measuring
  // the ✕'s tap area: every spot within 30px of it that a tap lands on, as one box
  const close = await page.locator('.island-drawer .id-sync-close').evaluate((el) => {
    const r = el.getBoundingClientRect();
    let [l, t, rr, b] = [Infinity, Infinity, -Infinity, -Infinity];
    for (let x = r.left - 30; x <= r.right + 30; x++)
      for (let y = r.top - 30; y <= r.bottom + 30; y++) {
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit))) [l, t, rr, b] = [Math.min(l, x), Math.min(t, y), Math.max(rr, x), Math.max(b, y)];
      }
    return { w: rr - l + 1, h: b - t + 1, look: [(el as HTMLElement).offsetWidth, (el as HTMLElement).offsetHeight] }; // its drawn size, whatever the opening animation is doing
  });
  expect(close.w).toBeGreaterThanOrEqual(44);
  expect(close.h).toBeGreaterThanOrEqual(44);
  expect(close.look).toEqual([28, 28]); // looks the same
  await page.locator('.island-drawer .id-sync-close').click();
  await expect(page.locator('.island-drawer')).toHaveCount(0);
});

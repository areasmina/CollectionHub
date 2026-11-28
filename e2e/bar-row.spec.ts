import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Deck and commander pages on phones: ⋮ and the search share the bar's first row; view and SIZE sit on the second. */
test('Phone tool bar: ⋮ and search on one row, view controls under them', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the two-row bar is the phone shape');
  await mockWorld(page);
  await seed(page);
  await page.locator('.ccard').first().click();
  const bar = page.locator('.lists > .tbar');
  await bar.scrollIntoViewIfNeeded();
  const top = (sel: string) => bar.locator(sel).first().evaluate((e) => Math.round(e.getBoundingClientRect().top));
  expect(Math.abs((await top('.tbmore')) - (await top('.tsearch')))).toBeLessThanOrEqual(2);
  expect(await top('.tquick')).toBeGreaterThan(await top('.tsearch'));
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(108);
});

/** A saved deck (the Forge) on phones (Guillermo, Nov 27: "clean, concise"): ⋮ · search · view · SIZE · + MY on one row,
 *  nothing past the screen's edge; ONLY lives in ⋮; the deck's tools are behind TOOLS on the strip. */
test('Phone, saved deck: ⋮, search and the view controls on one row', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the one-row bar is the phone shape');
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  const bar = page.locator('.forgemain .lists > .tbar');
  await bar.scrollIntoViewIfNeeded();
  // read every part in the same frame, once the page has stopped scrolling (the bar pins while it scrolls)
  const offsets = () =>
    bar.evaluate((b) => {
      const mid = (sel: string) => { const r = b.querySelector(sel)!.getBoundingClientRect(); return r.top + r.height / 2; };
      const s = mid('.tsearch');
      return Math.round(Math.max(...['.tbmore > summary', '.qview-btn', '.qzoom-btn', '.qadd-btn'].map((sel) => Math.abs(mid(sel) - s))));
    });
  await expect.poll(offsets, { message: 'a bar control sits off the search row' }).toBeLessThanOrEqual(6);
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(60);
  expect((await bar.locator('.tsearch').boundingBox())!.width).toBeGreaterThanOrEqual(100);
  const vw = page.viewportSize()!.width;
  for (const sel of ['.tbmore > summary', '.tsearch', '.qview-btn', '.qzoom-btn', '.qadd-btn']) {
    const r = (await bar.locator(sel).first().boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(vw + 1);
  }
  await expect(bar.locator('.qonly-btn')).toBeHidden();
});

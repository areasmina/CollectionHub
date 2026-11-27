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
 *  nothing past the screen's edge; ONLY lives in ⋮, and so do the deck's tools (its DECK row). */
test('Phone, saved deck: ⋮, search and the view controls on one row; the deck tools are in ⋮', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the one-row bar is the phone shape');
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  const bar = page.locator('.forgemain .lists > .tbar');
  await bar.scrollIntoViewIfNeeded();
  const mid = (sel: string) => bar.locator(sel).first().evaluate((e) => { const r = e.getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  for (const sel of ['.tbmore > summary', '.qview-btn', '.qzoom-btn', '.qadd-btn']) expect(Math.abs((await mid(sel)) - (await mid('.tsearch')))).toBeLessThanOrEqual(6);
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(60);
  expect((await bar.locator('.tsearch').boundingBox())!.width).toBeGreaterThanOrEqual(100);
  const vw = page.viewportSize()!.width;
  for (const sel of ['.tbmore > summary', '.tsearch', '.qview-btn', '.qzoom-btn', '.qadd-btn']) {
    const r = (await bar.locator(sel).first().boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(vw + 1);
  }
  await expect(bar.locator('.qonly-btn')).toBeHidden();
  await expect(page.locator('.forgemain > .dstrip > .dacts')).toHaveCount(0);
  await bar.locator('.tbmore > summary').click();
  await expect(page.locator('.deck-tools-row').getByRole('button', { name: 'BALANCE' })).toBeVisible();
});

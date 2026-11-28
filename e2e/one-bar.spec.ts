import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

// THE ONE BAR (Guillermo, Nov 28, "Search · FILTER · DISPLAY"): every list screen gets one slim row — FILTER first
// (where ⋮ was), the search, then DISPLAY, which names the view and size that are on ("GRID · M") and holds the view,
// card size, sort and group. Chips show under the bar only while a filter is on. Both sheets close with ✕, Escape, the
// dimmed page, and on phones a swipe down. Collection is the first screen on it.

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.coll .onebar')).toBeVisible();
});

const bar = (page: Page) => page.locator('.coll .onebar');
const tiles = (page: Page) => page.locator('.coll .ctile');
const firstName = (page: Page) => page.locator('.coll .cgrid2 > li, .coll ul.crows > li').first();

test('Collection: one row, FILTER · search · DISPLAY in that order, nothing else, each a 44px target inside the screen', async ({ page }, info) => {
  const kids = await bar(page).evaluate((el) => [...el.children].map((c) => (c.classList.contains('ob-filter') ? 'filter' : c.classList.contains('tsearch') ? 'search' : c.classList.contains('ob-display') ? 'display' : c.className)));
  expect(kids).toEqual(['filter', 'search', 'display']);
  await fits(page, ['.coll .onebar', '.coll .onebar > *']);
  const boxes = await bar(page).locator('> *').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: r.top, h: r.height, w: r.width })));
  for (const b of boxes) {
    expect(Math.abs(b.top - boxes[0].top), 'all three on one row').toBeLessThan(2);
    expect(Math.min(b.h, b.w)).toBeGreaterThanOrEqual(44);
  }
  // the search keeps most of the row
  expect(boxes[1].w).toBeGreaterThan(Math.max(boxes[0].w, boxes[2].w));
  // nothing else sits on the bar: no ⋮, no sort list, no view pills, no folder row on the page at rest
  await expect(page.locator('.coll .tbmore, .coll .sortsel, .coll .qviews, .coll .qzoom-btn')).toHaveCount(0);
  await expect(page.locator('.coll .coll-listbar')).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(0);
  await page.screenshot({ path: `test-results/one-bar-collection-${info.project.name}.png` });
});

test('DISPLAY names the view and size, and its sheet changes view, size, sort and group', async ({ page }) => {
  const disp = page.getByRole('button', { name: /^Display:/ });
  await expect(disp).toHaveText(/GRID · M/);
  await expect(disp.locator('.ob-dot')).toHaveCount(0); // usual sort, no grouping: no dot
  await disp.click();
  const sheet = page.getByRole('dialog', { name: 'Display' });
  await expect(sheet).toBeVisible();
  await fits(page, ['.fsheet2']);
  // size L, live behind the sheet, and the button says so
  await sheet.getByRole('group', { name: 'Card size' }).getByRole('button', { name: 'L', exact: true }).click();
  await expect(page.locator('.coll .collbar')).toHaveAttribute('data-zoom', 'l');
  // sort by price: the dearest card first
  await sheet.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'PRICE, HIGH FIRST' }).click();
  await sheet.getByRole('button', { name: 'DONE' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(disp).toHaveText(/GRID · L/);
  await expect(firstName(page)).toContainText('Rhystic Study');
  // a sort that is not the usual one shows as a dot on DISPLAY, and is named for screen readers
  await expect(disp.locator('.ob-dot')).toBeVisible();
  await expect(disp).toHaveAttribute('aria-label', /sorted price, high first/);
  // list view: the button says LIST, and card size leaves the sheet (it is a grid setting)
  await disp.click();
  await sheet.getByRole('group', { name: 'View' }).getByRole('button', { name: /LIST/ }).click();
  await expect(page.locator('.coll ul.crows')).toBeVisible();
  await expect(sheet.getByRole('group', { name: 'Card size' })).toHaveCount(0);
  // group by set, and the option that goes with it
  await sheet.getByRole('group', { name: 'Group' }).getByRole('button', { name: 'BY SET' }).click();
  await expect(sheet.getByLabel('Hide sets with no cards')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
  await expect(disp).toHaveText(/LIST/);
  await expect(page.locator('.coll .setgroups')).toBeVisible();
});

test('FILTER counts what is on; chips appear only then, with Clear all and N of M; folders live in the sheet at every width', async ({ page }) => {
  await expect(tiles(page).first()).toBeVisible();
  const before = await tiles(page).count();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter cards' });
  await expect(sheet.locator('.fs-folders')).toBeVisible(); // ALL · UNLISTED · + NEW FOLDER
  await sheet.getByRole('button', { name: 'Instant' }).click();
  await sheet.getByRole('button', { name: /^SHOW/ }).click();
  await expect(page.getByRole('button', { name: 'Filter, 1 active' })).toBeVisible();
  const chips = page.getByRole('group', { name: 'Active filters' });
  await expect(chips).toContainText('Instants');
  await expect(chips.getByRole('status')).toContainText(/\d+ of \d+ cards shown/);
  await expect.poll(() => tiles(page).count()).toBeLessThan(before);
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect(chips).toHaveCount(0);
  await expect.poll(() => tiles(page).count()).toBe(before);
});

test('the sheets close with Escape and the dimmed page, and focus goes back to the button', async ({ page }) => {
  const btn = page.getByRole('button', { name: /^Display:/ });
  await btn.click();
  await expect(page.getByRole('dialog', { name: 'Display' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Display' })).toHaveCount(0);
  await expect(btn).toBeFocused();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.locator('.fbackdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('dialog', { name: 'Filter cards' })).toHaveCount(0);
});

async function drag(page: Page, dy: number, steps: number) {
  const grab = page.locator('.ob-sheet .ob-grab');
  const b = (await grab.boundingBox())!;
  const x = b.x + b.width / 3;
  const y = b.y + 10;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + dy, { steps });
  await page.mouse.up();
}

test('Phone: swipe the sheet down to close it; a short drag springs back', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'swipe-down is the phone bottom sheet');
  await page.getByRole('button', { name: /^Display:/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Display' });
  await expect(sheet.locator('.ob-handle')).toBeVisible();
  await drag(page, 30, 30); // slow and short: stays
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate((e) => getComputedStyle(e).transform)).toMatch(/none|matrix\(1, 0, 0, 1, 0, 0\)/);
  await drag(page, 200, 8); // far enough: closes
  await expect(sheet).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await drag(page, 200, 8);
  await expect(page.getByRole('dialog', { name: 'Filter cards' })).toHaveCount(0);
});

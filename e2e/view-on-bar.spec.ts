import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

// Owner's call, Nov 13: cards open as a grid at every screen size, and the view (grid / list / compact) and SIZE controls
// sit on the bar itself, on phones too. Twice they were moved into a menu on phones, and twice they read as lost.

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const cols = (page: Page, sel: string) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
/** Every control in the list is on screen, inside the screen, and at least 44px tall and wide on a phone. */
async function reachable(page: Page, sel: string, phone: boolean) {
  await fits(page, [sel]);
  for (const b of await page.locator(sel).all()) {
    await expect(b).toBeVisible();
    const box = (await b.boundingBox())!;
    if (phone) expect(Math.min(box.width, box.height), `${sel} is ${Math.round(box.width)}×${Math.round(box.height)}px`).toBeGreaterThanOrEqual(44);
  }
}

test('Commander page: opens as a grid; view and SIZE are on the bar and work', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.locator('.ccard').first().click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  await expect(page.locator('ul.zlist')).toHaveCount(0);
  await reachable(page, '.dpage .lists > .tbar .qviews button', phone);
  await reachable(page, '.dpage .lists > .tbar .qzoom-btn', phone);
  await expect(page.locator('.dpage .lists > .tbar .qviews button')).toHaveCount(3);
  await fits(page, ['.dpage .lists > .tbar', '.dpage .lists > .tbar input']);
  // SIZE steps the grid: on phones M = 3 across (ManaBox), L = 2, S = 4
  const size = page.locator('.dpage .lists > .tbar .qzoom-btn');
  await expect(size).toHaveText('SIZE M');
  if (phone) expect(await cols(page, 'ul.zgrid')).toBe(3);
  await size.click();
  await expect(size).toHaveText('SIZE L');
  if (phone) expect(await cols(page, 'ul.zgrid')).toBe(2);
  await size.click();
  await expect(size).toHaveText('SIZE S');
  if (phone) expect(await cols(page, 'ul.zgrid')).toBe(4);
  // the view pills switch and remember the choice
  await page.getByRole('button', { name: 'Compact list' }).click();
  await expect(page.locator('ul.zcompact').first()).toBeVisible();
  await expect(size).toHaveCount(0); // SIZE is a grid control
  await reachable(page, '.dpage .lists > .tbar .qviews button', phone);
  expect(await page.evaluate(() => localStorage.getItem('ch:cardview'))).toBe('compact'); // remembered on this device
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.zlist:not(.zcompact)').first()).toBeVisible();
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  await page.screenshot({ path: `test-results/view-on-bar-cmdr-${info.project.name}.png` });
});

test('Saved deck (Forge): opens as a grid; view and SIZE are on the bar', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  await reachable(page, '.lists > .tbar .qviews button', phone);
  await reachable(page, '.lists > .tbar .qzoom-btn', phone);
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.zlist:not(.zcompact)').first()).toBeVisible();
  await page.screenshot({ path: `test-results/view-on-bar-deck-${info.project.name}.png` });
});

test('A phone that had picked a view under the old setting still starts on the grid once', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:view', 'compact'));
  await page.reload();
  await page.locator('.ccard').first().click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
});

test('Collection: opens as a grid; list / grid and SIZE are on the bar; phones show 3 across like ManaBox', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.cgrid2').first()).toBeVisible();
  await reachable(page, '.coll .tbar .qviews button', phone);
  await reachable(page, '.coll .tbar .qzoom-btn', phone);
  await fits(page, ['.coll .tbar', '.coll .tbar .sortsel']);
  const size = page.locator('.coll .tbar .qzoom-btn');
  if (phone) {
    expect(await cols(page, '.cgrid2')).toBe(3);
    await size.click(); // L
    expect(await cols(page, '.cgrid2')).toBe(2);
    await size.click(); // S
    expect(await cols(page, '.cgrid2')).toBe(4);
    await size.click(); // back to M
    // a card picture keeps its shape at every size (never squeezed or cropped)
    const img = (await page.locator('.cgrid2 li').first().boundingBox())!;
    expect(img.width).toBeGreaterThan(100);
  }
  await page.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('.cgrid2')).toHaveCount(0);
  await page.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('.cgrid2').first()).toBeVisible();
  await page.screenshot({ path: `test-results/view-on-bar-coll-${info.project.name}.png` });
});

test('Card sections: each one is its own full-width block, and cards wrap to the width without being squeezed', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  const boxes = await page.locator('.deckgrid > .lists > details.cat').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; }));
  expect(boxes.length).toBeGreaterThan(2);
  // no two sections share a row: every one starts at the same left edge, has the same width, and sits lower than the one before
  for (let i = 1; i < boxes.length; i++) {
    expect(boxes[i][0]).toBe(boxes[0][0]);
    expect(boxes[i][2]).toBe(boxes[0][2]);
    expect(boxes[i][1]).toBeGreaterThan(boxes[i - 1][1]);
  }
  // a card picture keeps the shape of a Magic card (63 × 88) at every SIZE
  const size = page.locator('.dpage .lists > .tbar .qzoom-btn');
  for (let i = 0; i < 3; i++) {
    const img = (await page.locator('ul.zgrid > li .timg').first().boundingBox())!;
    expect(img.width / img.height).toBeGreaterThan(0.68);
    expect(img.width / img.height).toBeLessThan(0.75);
    if (info.project.name !== 'phone') expect(img.width).toBeGreaterThanOrEqual(110); // readable, never squeezed thin
    await size.click();
  }
});

for (const w of [320, 360]) {
  test(`Small phones (${w}px): the view pills, SIZE, ⋮ and the search all stay on screen`, async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'small phone widths');
    await page.setViewportSize({ width: w, height: 640 });
    await page.locator('.ccard').first().click();
    await expect(page.locator('ul.zgrid').first()).toBeVisible();
    await reachable(page, '.dpage .lists > .tbar .qviews button', true);
    await reachable(page, '.dpage .lists > .tbar .qzoom-btn', true);
    await fits(page, ['.dpage .lists > .tbar', '.dpage .lists > .tbar input', '.dpage .lists > .tbar .tbmore > summary']);
    await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
    await page.reload();
    await expect(page.locator('.cgrid2').first()).toBeVisible();
    await reachable(page, '.coll .tbar .qviews button', true);
    await reachable(page, '.coll .tbar .qzoom-btn', true);
    await fits(page, ['.coll .tbar', '.coll .tbar .sortsel', '.coll .tbar .tbmore > summary', '.cgrid2 > li']);
    await page.screenshot({ path: `test-results/view-on-bar-coll-${w}.png` });
  });
}

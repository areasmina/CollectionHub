import { expect, test } from '@playwright/test';
import { mockWorld, opts, seed } from './mock';

/**
 * Guillermo, Nov 15 (round 5): "that filter is redundant as we already have there in the buttons… the apply button is
 * positioned awkwardly… it should feel efficient and easy to read and use. Snappy!"
 *
 * The options sheet is one panel in one language: every setting is a line of chips, no dropdowns, SHOW only where the
 * bar has no room for its own buttons, and the sheet's one commit button on a footer that stays on screen.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('The options sheet speaks one language: chips, no dropdowns, APPLY on a footer that stays on screen', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const d = await opts(page, '.lists');
  // nothing in the panel is a dropdown any more
  await expect(d.locator('.pickgrid')).toHaveCount(0);
  await expect(d.locator('.sbox.pick')).toHaveCount(0);
  // SORT and ONLY are chip rows, and each row is one line
  for (const label of ['SORT', 'ONLY']) {
    const row = d.locator('.optrow:has(.chiprow)').filter({ has: page.locator('.lbl', { hasText: new RegExp(`^${label.replace('$', '\\$')}$`) }) });
    await expect(row).toBeVisible();
    const tops = await row.locator('.chiprow .u-chip').evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().top)))]);
    expect(tops.length, `${label} chips wrap to more than one line`).toBe(1);
  }
  // SHOW repeats the bar's ALL / OWNED / MISSING buttons, so it only shows where those are hidden
  const show = d.locator('.sheetshow');
  const quick = page.locator('.lists .tquick .qsegs:not(.qviews)');
  const quickShown = await quick.first().isVisible();
  expect(await show.isVisible(), 'SHOW is in the sheet and on the bar at the same time').toBe(!quickShown);

  // APPLY: on the footer, the width of the panel, and inside the screen without scrolling the sheet
  const apply = d.locator('.sheetfoot .cf-apply-btn');
  await expect(apply).toBeVisible();
  await page.waitForTimeout(600); // a panel that would run off the screen glides into place first
  const box = (await apply.boundingBox())!;
  const panel = (await d.boundingBox())!;
  expect(box.width).toBeGreaterThan(panel.width * 0.6);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  expect(box.x).toBeGreaterThanOrEqual(0);
  if (info.project.name === 'phone') expect(box.height).toBeGreaterThanOrEqual(43.5);
  await page.screenshot({ path: `test-results/one-panel-sheet-${info.project.name}.png` });

  // and it still applies a pin
  await d.getByLabel('Pin card in deck').fill('Sol Ring');
  await apply.click();
  await expect(page.locator('.cf-pins .pinchip.in')).toContainText('Sol Ring');
});

test('Deck page: the sheet lost its dropdowns too', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  const d = await opts(page, '.lists');
  await expect(d.locator('.sbox.pick')).toHaveCount(0);
  await expect(d.locator('.optrow:has(.chiprow)').filter({ has: page.locator('.lbl', { hasText: /^SORT$/ }) })).toBeVisible();
  await expect(d.locator('.optrow:has(.chiprow)').filter({ has: page.locator('.lbl', { hasText: /^GROUP$/ }) })).toBeVisible();
});

test('Collection opens as one block: four lanes, no gaps between them, cards near the top', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  // Since Nov 15 the tabs ride the ransom title band above 700px, so there the block is the list ribbon and the tools
  const phone = info.project.name === 'phone';
  if (!phone) await expect(page.locator('.coll .titleacts .ctab').first()).toBeVisible();
  const lanes = phone ? ['.coll .ctabs', '.coll .coll-listbar', '.coll .collbar'] : ['.coll .coll-listbar', '.coll .collbar'];
  const boxes = [];
  for (const sel of lanes) {
    const b = (await page.locator(sel).boundingBox())!;
    expect(b, `${sel} is missing`).toBeTruthy();
    boxes.push(b);
  }
  // the lanes touch: no empty band between the tabs, the list ribbon and the tools
  // (neighbouring lanes share their 2px rule, so a 2px overlap is that rule, not a gap)
  for (let i = 1; i < boxes.length; i++) expect(Math.abs(boxes[i].y - (boxes[i - 1].y + boxes[i - 1].height)), 'a gap opened between the lanes').toBeLessThanOrEqual(3);
  // the binder starts near the top, not a third of the way down
  const first = (await page.locator('#cpane-cards .zgrid, #cpane-cards .clist').first().boundingBox())!;
  // a phone's ransom title is small, so the cards sit right under it; wider screens keep the big title's full height
  const limit = phone ? 340 : 460;
  expect(first.y, 'the cards start too far down the screen').toBeLessThanOrEqual(limit);
  // and nothing of the block hangs off the side
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'the page scrolls sideways').toBe(true);
  await page.screenshot({ path: `test-results/one-panel-collection-${info.project.name}.png` });
});

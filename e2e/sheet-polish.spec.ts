import { expect, test } from '@playwright/test';
import { closeOpts, mockWorld, opts, seed } from './mock';

/**
 * Phase 2 follow-up (found on the live site with the real collection): on phones nothing in the options sheet or the
 * chip strip reads cut off. The PIN and WITHOUT hints show in full, the ⋮ button names the gear only (theme, pins and
 * filters are chips under the bar), chips are 44px to tap and sit on one row, and tick boxes are a full size.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Commander page: hints read in full, ⋮ is not cut, chips are one 44px row', async ({ page }, info) => {
  const phone = info.project.name === 'phone';
  await page.locator('.ccard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  const d = await opts(page, '.lists');
  // each hint fits inside its box
  const hints = await d.locator('.cf-row input').evaluateAll((els) =>
    els.map((el) => {
      const i = el as HTMLInputElement;
      const cs = getComputedStyle(i);
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const letter = parseFloat(cs.letterSpacing) || 0;
      const need = ctx.measureText(i.placeholder).width + letter * i.placeholder.length;
      return { hint: i.placeholder, need: Math.ceil(need), room: Math.floor(i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)) };
    }),
  );
  expect(hints).toHaveLength(2);
  if (phone) for (const h of hints) expect(h.room, `"${h.hint}" needs ${h.need}px`).toBeGreaterThanOrEqual(h.need);
  // APPLY stays in reach and inside the screen
  const apply = (await d.locator('.cf-apply-btn').boundingBox())!;
  expect(apply.x + apply.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  if (phone) await page.screenshot({ path: 'test-results/sheet-polish-sheet-phone.png' });

  // pick a theme: it shows as a chip, and the ⋮ button is not cut short
  await d.locator('.themes button').first().click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tbmore[open]')).toHaveCount(0);
  const chips = page.getByRole('group', { name: 'Active settings' });
  await expect(chips.locator('.fchip')).toHaveText(['THEME LANDFALL ✕']);
  const now = page.locator('.lists > .tbar .fnow');
  await expect(now).toContainText('#LANDFALL'); // the label still carries it for wider screens and screen readers
  if (phone) {
    await expect(now.locator('.fnchip').first()).toBeHidden();
    expect(await now.evaluate((e) => e.scrollWidth <= e.clientWidth + 1), '⋮ label is cut').toBe(true);
    await expect(now).toBeVisible();
  }

  // more chips: still one row on a phone, each 44px, Clear all on screen
  for (const [sel, value] of [['.show-pick select', 'owned'], ['select:has(option[value="under5"])', 'under5']] as const) {
    const dd = await opts(page, '.lists');
    const box = dd.locator(sel).first();
    if (await box.isVisible()) await box.selectOption(value);
    else await page.locator('.lists .tquick').getByRole('button', { name: value === 'owned' ? 'OWNED' : 'UNDER CA$5', exact: true }).click();
    await closeOpts(page);
  }
  await expect(chips.locator('.fchip')).toHaveCount(3);
  if (phone) {
    const boxes = await chips.locator('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ y: Math.round(r.y), h: Math.round(r.height) })));
    expect(new Set(boxes.map((b) => b.y)).size, 'chips wrap to more than one row').toBe(1);
    for (const b of boxes) expect(b.h).toBeGreaterThanOrEqual(44);
    const clear = (await chips.getByRole('button', { name: 'Clear all' }).boundingBox())!;
    expect(clear.x + clear.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'page scrolls sideways').toBe(true);
    await page.screenshot({ path: 'test-results/sheet-polish-chips-phone.png' });
  }
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect(chips).toHaveCount(0);
});

test('Collection: the "Group by set" tick box is a full size on a 44px row on phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'touch rule; mouse screens keep the compact box');
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await page.waitForSelector('.timg');
  const d = await opts(page);
  const row = d.locator('label.check', { hasText: 'Group by set' });
  await expect(row).toBeVisible();
  expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const tick = (await row.locator('input').boundingBox())!;
  expect(tick.width).toBeGreaterThanOrEqual(24);
  expect(tick.height).toBeGreaterThanOrEqual(24);
  await row.locator('input').check();
  await expect(row.locator('input')).toBeChecked();
});

import { expect, test, type Page } from '@playwright/test';
import { mockWorld, opts, seed } from './mock';

/**
 * Active settings as chips (audit roadmap, phase 2): whatever narrows a commander page or a deck page shows under the
 * bar as a removable chip, with "Clear all", the same strip Collection and Discover use for their filters.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

/** Sets SHOW or ONLY the way that screen offers it: the box inside ⋮, or the quick buttons on the bar when the box is hidden. */
const pick = async (page: Page, value: string, quick: string) => {
  const d = await opts(page, '.lists');
  // every setting inside the sheet is a chip (Nov 15 round 5); SHOW is there only where the bar has no room for it
  const chip = d.getByRole('radio', { name: value === 'owned' ? 'OWNED ONLY' : 'UNDER CA$5', exact: true }).first();
  const inSheet = await chip.isVisible();
  if (inSheet) await chip.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tbmore[open]')).toHaveCount(0);
  // The quick buttons live on the bar, under the ⋮ sheet, so the sheet closes before they are pressed.
  if (!inSheet) await page.locator('.lists .tquick').getByRole('button', { name: quick, exact: true }).click();
};

test('Commander page: SHOW and ONLY appear as chips; each chip removes its setting, Clear all removes them all', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  const chips = page.getByRole('group', { name: 'Active settings' });
  await expect(chips).toHaveCount(0); // nothing on: no strip
  await pick(page, 'owned', 'OWNED');
  await expect(chips.locator('.fchip')).toHaveText(['OWNED ONLY ✕']);
  await expect(chips.locator('.fclear')).toHaveCount(0); // one chip needs no "Clear all"
  await pick(page, 'under5', 'UNDER CA$5');
  await expect(chips.locator('.fchip')).toHaveCount(2);
  await expect(chips.getByRole('button', { name: 'Remove UNDER CA$5' })).toBeVisible();
  // the strip stays inside the screen and the chips are tappable
  const box = (await chips.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ path: `test-results/active-chips-commander-${info.project.name}.png` });
  await chips.getByRole('button', { name: 'Remove OWNED ONLY' }).click();
  await expect(chips.locator('.fchip')).toHaveText(['UNDER CA$5 ✕']);
  await pick(page, 'owned', 'OWNED');
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect(chips).toHaveCount(0);
  // the settings really went back, not just the chips
  const d = await opts(page, '.lists');
  await expect(d.getByRole('radio', { name: 'EVERY CARD', exact: true }).first()).toHaveAttribute('aria-checked', 'true');
  const showRow = d.locator('.sheetshow').getByRole('radio', { name: 'ALL CARDS', exact: true });
  if (await showRow.isVisible()) await expect(showRow).toHaveAttribute('aria-checked', 'true');
  else await expect(page.locator('.lists .tquick').getByRole('button', { name: 'ALL', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('Deck page: ONLY appears as a chip and the chip removes it', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  const chips = page.getByRole('group', { name: 'Active settings' });
  await expect(chips).toHaveCount(0);
  await pick(page, 'under5', 'UNDER CA$5');
  await expect(chips.locator('.fchip')).toHaveText(['UNDER CA$5 ✕']);
  await chips.locator('.fchip').click();
  await expect(chips).toHaveCount(0);
  await expect(page.locator('details.cat').first()).toBeVisible();
});

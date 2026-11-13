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
  const box = d.locator(value === 'owned' ? '.show-pick select' : 'select:has(option[value="under5"])').first();
  if (await box.isVisible()) await box.selectOption(value);
  else await page.locator('.lists .tquick').getByRole('button', { name: quick, exact: true }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tbmore[open]')).toHaveCount(0);
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
  await expect(d.locator('.show-pick select').first()).toHaveValue('all');
  await expect(d.locator('select:has(option[value="under5"])').first()).toHaveValue('all');
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

import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** The same control bar on Discover and on a deck page: sort sits in the bar, active filters show as chips with a reset. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Discover: sort in the bar; a colour filter shows as a chip and Clear all brings the commanders back', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await fits(page, ['.dfind .tbar', '.dfind .sortsel']);
  await expect(page.getByLabel('Sort commanders')).toHaveValue('match');
  await page.getByLabel('Sort commanders').selectOption('name');
  const bar = page.locator('.dfind .tbar');
  await bar.locator('summary').click();
  await expect(bar.getByRole('radio', { name: 'NAME A→Z' })).toHaveAttribute('aria-checked', 'true'); // the bar and the ⋮ options agree
  await bar.getByRole('button', { name: 'Red' }).click();
  await page.keyboard.press('Escape');
  const chips = page.getByRole('group', { name: 'Active filters' });
  await expect(chips.getByRole('button', { name: 'Remove filter Red' })).toBeVisible();
  await expect(chips.getByRole('status')).toHaveText('0 of 1 commanders shown');
  await fits(page, ['.fchips']);
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect(chips).toHaveCount(0);
  await expect(page.locator('.ccard')).toHaveCount(1);
});

test('Deck page: sort sits in the bar and fits the screen (tablet and desktop; phones keep it in ⋮)', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'phones keep the slim bar: sort stays in the ⋮ options');
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const sel = page.locator('.lists .tbar').getByLabel('Sort cards');
  await expect(sel).toBeVisible();
  await fits(page, ['.lists .tbar', '.lists .tbar .sortsel']);
  await sel.selectOption({ index: 1 });
  await expect(sel).not.toHaveValue('');
});

import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Collection control strip: Search | Filter | Sort in one bar, active filters as chips with an easy reset. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.tbar')).toBeVisible();
});

test('the strip fits the screen and the Filter sheet opens inside it', async ({ page }) => {
  await fits(page, ['.tbar', '.tbar .fbtn', '.tbar .sortsel']);
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter cards' });
  await expect(sheet).toBeVisible();
  await fits(page, ['.fsheet2']);
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('picking a type narrows the list, shows a chip and a count; Clear all brings everything back', async ({ page }) => {
  const rows = page.locator('.cgrid2 > li, ul.crows > li');
  await expect(rows.first()).toBeVisible();
  const before = await rows.count();
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  await page.getByRole('dialog', { name: 'Filter cards' }).getByRole('button', { name: 'Instant' }).click();
  await page.getByRole('dialog', { name: 'Filter cards' }).getByRole('button', { name: /^SHOW/ }).click();
  const chips = page.getByRole('group', { name: 'Active filters' });
  await expect(chips).toContainText('Instants');
  await expect(chips.getByRole('status')).toContainText('cards shown');
  await expect(page.getByRole('button', { name: /Filter, 1 active/ })).toBeVisible();
  await expect.poll(() => rows.count()).toBeLessThan(before);
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect(chips).toHaveCount(0);
  await expect.poll(() => rows.count()).toBe(before);
});

test('sorting by price puts the dearest card first', async ({ page }) => {
  await page.getByLabel('Sort cards').selectOption('price-desc');
  await expect(page.locator('.cgrid2 > li, ul.crows > li').first()).toContainText('Rhystic Study');
});

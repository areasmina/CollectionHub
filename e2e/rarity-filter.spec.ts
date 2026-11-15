import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Rarity filter (Guillermo, Nov 15): pick a rarity in the Collection filter sheet and the binder narrows to it. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.tbar')).toBeVisible();
});

const names = async (page: import('@playwright/test').Page) =>
  (await page.locator('.coll .ctile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).sort();

const pick = async (page: import('@playwright/test').Page, label: string) => {
  await page.getByRole('button', { name: /^Filter/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter cards' });
  await fits(page, ['.fsheet2', '.fsheet2 .fs-row.rarities']);
  const b = sheet.getByRole('button', { name: label, exact: true });
  await b.scrollIntoViewIfNeeded();
  await b.click();
  const go = sheet.getByRole('button', { name: /^SHOW/ });
  await go.scrollIntoViewIfNeeded();
  await go.click();
  await expect(sheet).toHaveCount(0);
};

test('one rarity narrows the binder and shows a chip you can clear', async ({ page }) => {
  const before = await names(page);
  expect(before.length).toBeGreaterThan(1);
  await pick(page, 'Mythic');
  await expect.poll(() => names(page)).toEqual(['Lotus Cobra']); // the only mythic in the sample binder
  const chips = page.getByRole('group', { name: 'Active filters' });
  await expect(chips).toContainText('Mythic');
  await chips.getByRole('button', { name: 'Clear all' }).click();
  await expect.poll(() => names(page)).toEqual(before);
});

test('two rarities show both, and the filter button counts the choice once', async ({ page }) => {
  await pick(page, 'Rare');
  await pick(page, 'Mythic');
  await expect.poll(() => names(page)).toEqual(['Lotus Cobra', 'Rhystic Study', 'Tatyova, Benthic Druid']);
  await expect(page.getByRole('button', { name: /Filter, 1 active/ })).toBeVisible();
});

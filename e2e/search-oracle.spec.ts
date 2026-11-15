import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Search by name, type line and rules text — reminder text included — everywhere (Guillermo, Nov 15:
 * "when searching card in my overall website we should be able to find cards by name and oracle text and reminder text").
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Discover: a commander is found by its rules text, not only by its name', async ({ page }) => {
  const find = page.getByLabel('Search commander');
  const tatyova = page.locator('.ccard', { hasText: 'Tatyova' });
  await expect(tatyova).toHaveCount(1);
  await find.fill('benthic'); // the name still works
  await expect(tatyova).toHaveCount(1);
  await find.fill('gain 1 life'); // only in the rules text
  await expect(tatyova).toHaveCount(1);
  await find.fill('legendary merfolk'); // the type line, in any order
  await expect(tatyova).toHaveCount(1);
  await find.fill('wurmcoil'); // a word that is nowhere
  await expect(tatyova).toHaveCount(0);
});

test('Collection: a card is found by the reminder text in brackets', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const box = page.getByLabel('Search cards by name or rules text');
  const forest = page.locator('.coll .ctile[aria-label="Forest"]');
  await expect(forest).toHaveCount(1);
  await box.fill('add {g}'); // Forest's whole rules line is reminder text
  await expect(forest).toHaveCount(1);
  await expect(page.locator('.coll .ctile[aria-label="Island"]')).toHaveCount(0);
  await box.fill('counter target'); // another card's rules text, not the Forest's
  await expect(forest).toHaveCount(0);
  await expect(page.locator('.coll .ctile[aria-label="Counterspell"]')).toHaveCount(1);
});

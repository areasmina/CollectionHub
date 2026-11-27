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

// Round 2 (Nov 14): mana value, price per copy and finish in the same sheet, each with its own chip.
const names = async (page: import('@playwright/test').Page) =>
  (await page.locator('.coll .ctile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''))).sort();
const sheetPick = async (page: import('@playwright/test').Page, label: string | RegExp) => {
  await page.getByRole('button', { name: /^Filter/ }).click();
  const sheet = page.getByRole('dialog', { name: 'Filter cards' });
  await fits(page, ['.fsheet2', '.fsheet2 .fs-row.mvs']);
  const b = sheet.getByRole('button', { name: label, exact: typeof label === 'string' });
  await b.scrollIntoViewIfNeeded();
  await b.click();
  const go = sheet.getByRole('button', { name: /^SHOW/ });
  await go.scrollIntoViewIfNeeded();
  await go.click();
  await expect(sheet).toHaveCount(0);
};

test('mana value, price and foil filters narrow the binder, each with a removable chip', async ({ page }) => {
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
  // mana value 3: Cultivate and Rhystic Study
  await sheetPick(page, 'Mana value 3');
  await expect.poll(() => names(page)).toEqual(['Cultivate', 'Rhystic Study']);
  const chips = page.getByRole('group', { name: 'Active filters' });
  await expect(chips).toContainText('MV 3');
  await chips.getByRole('button', { name: 'Remove filter MV 3' }).click();
  // CA$20 and up, at your own printing: only Rhystic Study (38 USD)
  await sheetPick(page, 'CA$20 and up');
  await expect.poll(() => names(page)).toEqual(['Rhystic Study']);
  await chips.getByRole('button', { name: 'Clear all' }).click();
  // under CA$1: the four cheap cards
  await sheetPick(page, 'Under CA$1');
  await expect.poll(() => names(page)).toEqual(['Cultivate', 'Forest', 'Island', 'Tatyova, Benthic Druid']);
  await chips.getByRole('button', { name: /Remove filter/ }).click();
  // foil copies: the seeded binder has one (Rhystic Study)
  await sheetPick(page, 'Foil');
  await expect.poll(() => names(page)).toEqual(['Rhystic Study']);
  await expect(page.getByRole('button', { name: /Filter, 1 active/ })).toBeVisible();
  await chips.getByRole('button', { name: /Remove filter Foil/ }).click();
  await expect(chips).toHaveCount(0);
  await expect.poll(async () => (await names(page)).length).toBe(8);
});

import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

// Tester round 1 bugs (A1, A3, A7)
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Swap window: Esc closes it and the backdrop goes with it', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dlg).toHaveCount(0);
  await expect(page.locator('.backdrop')).toHaveCount(0);
});

test('FORGE IT: a double tap saves one deck, not two', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await page.locator('.forgecell .btn.forge').dblclick();
  await expect(page.locator('.dhero h1')).toBeVisible();
  const n = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('decks').objectStore('decks').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  expect(n).toBe(2); // the seeded deck + one new
});

test('Import: when Scryfall stops answering, it says so, saves the rest and keeps only the unlooked-up cards', async ({ page }) => {
  await page.route(/api\.scryfall\.com\/cards\/collection/, (r) => r.abort());
  await page.clock.install();
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const box = page.locator('.importbox');
  if (!(await box.evaluate((e) => (e as HTMLDetailsElement).open))) await box.locator('summary').click();
  await box.locator('textarea').fill('1 Sol Ring\n1 Brand New Card');
  await box.getByRole('button', { name: 'ADD TO BINDER' }).click();
  // three waits (5 + 10 + 20 s), run on the fake clock in steps so each failed request gets to land first
  await expect
    .poll(async () => (await page.clock.runFor(6_000), await box.locator('.report').count()), { timeout: 20_000 })
    .toBe(1);
  await expect(box.locator('.report')).toContainText('not looked up yet');
  await expect(box.locator('textarea')).toHaveValue('1 Brand New Card');
});

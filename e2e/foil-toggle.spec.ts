import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Collection: the card menu marks a copy foil or non-foil, and the foil shine follows (nothing added or lost). */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Collection card menu: MARK AS FOIL turns the card foil, MARK AS NON-FOIL turns it back, copies never change', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  // Counterspell: one non-foil copy in the mock binder
  const tile = page.locator('.ctile', { hasText: 'Counterspell' }).first();
  await expect(tile).toBeVisible();
  const art = tile.locator('.timg');
  await expect(art).not.toHaveClass(/\bfoil\b/);
  await tile.click({ button: 'right' });
  // house rule: no emoji or dingbat symbols in the card menu
  const menuText = await page.locator('.cardmenu').innerText();
  expect(menuText.match(/[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu) ?? []).toEqual([]);
  await page.locator('.cardmenu').getByRole('button', { name: /MARK AS FOIL/ }).click();
  await expect(art).toHaveClass(/\bfoil\b/);
  await tile.click({ button: 'right' });
  await expect(page.locator('.cardmenu').getByRole('button', { name: /MARK AS FOIL/ })).toHaveCount(0);
  await page.locator('.cardmenu').getByRole('button', { name: /MARK AS NON-FOIL/ }).click();
  await expect(art).not.toHaveClass(/\bfoil\b/);
  // the count of copies never changes
  const qty = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const rows: any[] = await new Promise((ok) => (db.transaction('entries').objectStore('entries').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return rows.filter((r) => r.name === 'Counterspell').reduce((n, r) => n + r.qty, 0);
  });
  expect(qty).toBe(1);
});

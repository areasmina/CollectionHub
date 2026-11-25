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

test('Collection card menu: MARK AS FOIL on a card with several copies turns every copy foil, and it stays one tile', async ({ page }) => {
  // Guillermo, Nov 24: "when you make a card foil it duplicates". Sol Ring has two non-foil copies in the mock binder;
  // it used to split into a plain tile and a foil tile.
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tiles = page.locator('.ctile', { hasText: 'Sol Ring' });
  await expect(tiles.first()).toBeVisible();
  await expect(tiles).toHaveCount(1);
  const rows = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
      const all: any[] = await new Promise((ok) => (db.transaction('entries').objectStore('entries').getAll().onsuccess = (e: any) => ok(e.target.result)));
      return all.filter((r) => r.name === 'Sol Ring').map((r) => ({ qty: r.qty, foil: !!r.foil }));
    });
  await tiles.first().click({ button: 'right' });
  const foilBtn = page.locator('.cardmenu').getByRole('button', { name: /MARK AS FOIL/ });
  await expect(foilBtn).toContainText('all 2 copies');
  await foilBtn.click();
  await expect(tiles.first().locator('.timg')).toHaveClass(/\bfoil\b/);
  await expect(tiles).toHaveCount(1);
  await expect.poll(rows).toEqual([{ qty: 2, foil: true }]);
  // and back: one non-foil row of two, still one tile
  await tiles.first().click({ button: 'right' });
  await expect(page.locator('.cardmenu').getByRole('button', { name: /MARK AS FOIL/ })).toHaveCount(0);
  await page.locator('.cardmenu').getByRole('button', { name: /MARK AS NON-FOIL/ }).click();
  await expect(tiles.first().locator('.timg')).not.toHaveClass(/\bfoil\b/);
  await expect(tiles).toHaveCount(1);
  await expect.poll(rows).toEqual([{ qty: 2, foil: false }]);
});

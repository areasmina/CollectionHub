import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

/** One Arcane Signet in the binder, already in another active deck: the Forge says so on the suggestion and ranks it
 *  below what is still free; a second copy (or the other deck's light off) clears the mark. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await addSignet(page);
});

const otherDeck = (page: import('@playwright/test').Page, extra: Record<string, unknown> = {}) =>
  page.evaluate(async (x) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok((e.target as any).result)));
    const tx = db.transaction('decks', 'readwrite');
    tx.objectStore('decks').put({ profile: 1, name: 'Other Deck', commander: 'Some Other Commander', cards: [{ name: 'Arcane Signet', qty: 1 }], updated: 1, ...x });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, extra);

const open = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const sugg = page.locator('.fsugg');
  if (await sugg.locator('.fgrab').isVisible()) await sugg.locator('.fgrab').click();
  return sugg.locator('.frows li', { hasText: 'Arcane Signet' });
};

test('Forge: a suggested card whose every copy is in another deck says which deck', async ({ page }) => {
  await otherDeck(page);
  const row = await open(page);
  await expect(row.locator('.whys')).toContainText('all 1 copy is in Other Deck');
});

test('Forge: no mark while the other deck rests (light off)', async ({ page }) => {
  await otherDeck(page, { inactive: true });
  const row = await open(page);
  await expect(row).toHaveCount(1);
  await expect(row.locator('.whys')).not.toContainText('copy is in');
});

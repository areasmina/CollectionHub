import { expect, test } from '@playwright/test';
import { cards, mockWorld, seed } from './mock';

// One owned copy, two decks that both want it: the older deck gets the copy, the newer deck shows it missing.
test('Decks list: a shared copy counts for the older deck only', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  const one = cards[0];
  await page.evaluate(async (c) => {
    const db: IDBDatabase = await new Promise((ok, no) => {
      const q = indexedDB.open('collectionhub');
      q.onsuccess = () => ok(q.result);
      q.onerror = no;
    });
    const tx = db.transaction(['entries', 'decks'], 'readwrite');
    tx.objectStore('entries').clear();
    tx.objectStore('entries').put({ profile: 1, cardId: c.id, name: c.name, qty: 1, set: 'tst', cn: '0' });
    tx.objectStore('decks').clear();
    tx.objectStore('decks').put({ id: 1, profile: 1, name: 'Older deck', cards: [{ name: c.name, qty: 1 }], updated: Date.now() });
    tx.objectStore('decks').put({ id: 2, profile: 1, name: 'Newer deck', cards: [{ name: c.name, qty: 1 }], updated: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, one);

  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();

  const older = page.locator('.dtile', { hasText: 'Older deck' });
  const newer = page.locator('.dtile', { hasText: 'Newer deck' });
  await expect(older.locator('.cstate')).toHaveText('READY');
  await expect(newer.locator('.cstate')).toHaveText('1 MISSING');
  await expect(newer.locator('.cmatch b')).toHaveText('0%');
});

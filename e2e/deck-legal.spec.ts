import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** My Decks: a saved deck that breaks a Commander rule says so on its tile (same rules as the deck page's READINESS). */
test('My Decks tiles flag decks that are not legal yet, and leave legal ones alone', async ({ page }) => {
  await mockWorld(page);
  await seed(page); // "Tatyova Lands": 46 cards
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    const lead = { name: 'Tatyova, Benthic Druid', qty: 1 };
    tx.objectStore('decks').put({ profile: 1, name: 'Legal Hundred', commander: lead.name, cards: [lead, { name: 'Forest', qty: 50 }, { name: 'Island', qty: 49 }], updated: Date.now() - 5 });
    tx.objectStore('decks').put({ profile: 1, name: 'Two Rings', commander: lead.name, cards: [lead, { name: 'Sol Ring', qty: 2 }, { name: 'Forest', qty: 97 }], updated: Date.now() - 9 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  const tile = (name: string) => page.locator('.dtile').filter({ has: page.getByText(name, { exact: true }) });
  await expect(tile('Tatyova Lands').locator('.dlegal')).toContainText('NOT LEGAL · 46/100 CARDS');
  await expect(tile('Tatyova Lands').locator('.dlegal')).toHaveAttribute('title', /exactly 100/);
  await expect(tile('Two Rings').locator('.dlegal')).toContainText('NOT LEGAL · 1 DOUBLED');
  await expect(tile('Two Rings').locator('.dlegal')).toHaveAttribute('title', /More than one copy of Sol Ring/);
  await expect(tile('Legal Hundred')).toBeVisible();
  await expect(tile('Legal Hundred').locator('.dlegal')).toHaveCount(0);
  await fits(page, ['.dtile .dlegal']);
  // the deck page agrees: the same deck reads NOT LEGAL there
  await tile('Tatyova Lands').locator('.dcard').click();
  await expect(page.getByText('NOT LEGAL', { exact: true })).toBeVisible();
});

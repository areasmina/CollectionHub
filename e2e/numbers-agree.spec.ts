import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** One fact, one number: the same thing is counted the same way on every screen that shows it. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Collection: the list tabs count copies, like the "cards" tile (not printings)', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tile = page.locator('.stats .stat', { hasText: /^\s*[\d,]+\s*cards/ }).first().locator('b');
  await expect(tile).toHaveText('20'); // 8 printings, 20 copies
  await expect(page.getByRole('tab', { name: /^ALL/ }).locator('.tab-count')).toHaveText('20');
  await expect(page.getByRole('tab', { name: /^UNLISTED/ }).locator('.tab-count')).toHaveText('20');
});

test('My Decks: "avg power" uses the Game Changers list, so it agrees with the bracket on the deck page', async ({ page }) => {
  // four Game Changers in the deck: more than three means bracket IV
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['edhrec'], 'readwrite');
    tx.objectStore('edhrec').put({ path: 'scryfall:gamechangers', data: ['sol ring', 'cultivate', 'rhystic study', 'counterspell'], at: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
    localStorage.setItem('ch:tab', 'decks');
  });
  await page.reload();
  await expect(page.locator('.dstats .stat', { hasText: 'avg power' }).locator('b')).toHaveText('B4');
  await page.locator('.dcard, .dtile button').filter({ hasText: 'Tatyova Lands' }).first().click();
  await expect(page.locator('details.scrap.bracket > summary, .vtile.fit, .vtiles').first()).toContainText(/IV|4/);
});

test('Ownership is one count everywhere: copies you own out of the deck, commander included', async ({ page }) => {
  // Discover tile and the page it opens say the same %
  const tile = page.locator('.ccard').first();
  await expect(tile.locator('.cmatch b')).toHaveText('100%');
  await expect(tile.locator('.cstate')).toHaveText('ALL OWNED'); // READY is kept for the build checks
  await tile.click();
  // 5 spells + 10 Forest + 10 Island + the commander = 26 copies (it used to say "8 of 8" next to "25 from your binder")
  await expect(page.locator('.vmatch small')).toContainText('you own 26 of 26');
  await expect(page.locator('.vmatch .num')).toHaveText('100%');
  await expect(page.locator('.dstrip .dstatus')).not.toContainText('from your binder');
  // the word READY now only belongs to the build checks
  await expect(page.locator('.vtile.ready summary')).toContainText(/READY|ALMOST|NOT READY|NOT LEGAL/);
});

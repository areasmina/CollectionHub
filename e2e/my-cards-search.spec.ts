import { expect, test, type Page } from '@playwright/test';
import { addSignet, fits, mockWorld, seed } from './mock';

// Owner's ask, Nov 13: while building a deck, look through your own collection and add your own cards, not only the
// app's suggestions. + MY CARDS on the deck bar opens the Forge's search of your cards; it looks past the suggestion
// filters, and says why a card of yours that matches can't go in (already in the deck, outside the colours).

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

/** A card of yours the app never suggests: owned, in Tatyova's colours, not in EDHREC's list, not in the deck. */
async function addOwned(page: Page, name: string, ci: string[], type = 'Instant', text = 'Draw two cards.') {
  await page.evaluate(
    async ({ name, ci, type, text }) => {
      const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
      const tx = db.transaction(['entries', 'cards'], 'readwrite');
      const id = `abcdef${String(name.length).padStart(2, '0')}-1111-2222-3333-${String(ci.length).padStart(12, '0')}${name.length}`;
      tx.objectStore('cards').put({ id, name, key: name.toLowerCase(), type, text, ci, img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: '0.50', mana: '{1}{U}', cmc: 2, legal: true, pv: 2, at: Date.now() });
      tx.objectStore('entries').put({ profile: 1, cardId: id, name, qty: 1, set: 'tst', cn: '77' });
      await new Promise((ok) => (tx.oncomplete = ok));
    },
    { name, ci, type, text },
  );
}

const openSearch = async (page: Page) => {
  const btn = page.locator('.lists > .tbar .qadd-btn');
  await expect(btn).toBeVisible();
  await fits(page, ['.lists > .tbar .qadd-btn']);
  await btn.click();
  const q = page.locator('.fsugg').getByRole('searchbox', { name: /Search my cards/ });
  await expect(q).toBeFocused();
  return q;
};

test('Saved deck: + MY CARDS finds a card of yours the app does not suggest, past the filters, and + ADD puts it in', async ({ page }, info) => {
  await addOwned(page, 'Opt Thoughts', ['U']);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  const sugg = page.locator('.fsugg');
  // narrow the suggestions first: NOT OWNED hides every card of yours
  if (await sugg.locator('.fgrab').isVisible()) await sugg.locator('.fgrab').click();
  await sugg.locator('.ftabs button', { hasText: 'NOT OWNED' }).click();
  if (await sugg.locator('.fgrab[aria-expanded="true"]').isVisible()) await sugg.locator('.fgrab').click(); // lower it again: the bar is under it
  const q = await openSearch(page);
  await q.fill('opt thou');
  const row = sugg.locator('.frows li', { hasText: 'Opt Thoughts' });
  await expect(row).toHaveCount(1);
  await expect(sugg.locator('.fqnote')).toContainText('past the filters');
  // rules text works too
  await q.fill('draw two');
  await expect(row).toHaveCount(1);
  await page.screenshot({ path: `test-results/my-cards-${info.project.name}.png` });
  await row.getByRole('button', { name: 'Add Opt Thoughts to the deck' }).click();
  await expect(page.locator('.toast')).toContainText('Added Opt Thoughts');
  await expect(page.locator('.lists [data-card="Opt Thoughts"]')).toHaveCount(1);
  // now in the deck: the search says so instead of silently dropping it
  await q.fill('opt thou');
  await expect(row).toHaveCount(0);
  await expect(sugg.locator('.fwhynot')).toContainText('Already in this deck: Opt Thoughts');
});

test('A card of yours outside the commander colours is named, never offered', async ({ page }) => {
  await addOwned(page, 'Lightning Strike', ['R'], 'Instant', 'deals 3 damage to any target');
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  const q = await openSearch(page);
  await q.fill('lightning');
  const sugg = page.locator('.fsugg');
  await expect(sugg.locator('.frows li', { hasText: 'Lightning Strike' })).toHaveCount(0);
  await expect(sugg.locator('.fwhynot')).toContainText("outside this commander's colours");
  await expect(sugg.locator('.fwhynot')).toContainText('Lightning Strike');
});

test('Commander page: + MY CARDS opens the Forge on the search; a found card swaps into a slot', async ({ page }) => {
  await addSignet(page);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
  const q = await openSearch(page);
  await expect(page.locator('.forgetop')).toBeVisible();
  await q.fill('signet');
  const row = page.locator('.fsugg .frows li', { hasText: 'Arcane Signet' });
  await expect(row).toHaveCount(1);
  await row.locator('.frow').click();
  await expect(page.locator('.fsugg .fplace')).toContainText('Arcane Signet');
  await page.locator('.lists [data-card="Sol Ring"]').first().evaluate((el) => (el as HTMLElement).click());
  await expect(page.locator('.forgetop')).toContainText('1 swap');
  await expect(page.locator('.lists [data-card="Arcane Signet"]')).toHaveCount(1);
});

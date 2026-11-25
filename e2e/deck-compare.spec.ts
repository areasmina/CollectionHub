import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** My Decks COMPARE (Nov 24): two of your decks side by side, each difference said in words, nothing saved. */

/** A second deck: the same commander, fewer lands and no blue spells. */
const addSecondDeck = async (page: Page) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({
      profile: 1,
      name: 'Cobra Ramp',
      commander: 'Tatyova, Benthic Druid',
      cards: [
        { name: 'Tatyova, Benthic Druid', qty: 1 },
        { name: 'Sol Ring', qty: 1 },
        { name: 'Cultivate', qty: 1 },
        { name: 'Lotus Cobra', qty: 1 },
        { name: 'Forest', qty: 30 },
      ],
      updated: Date.now() - 1000,
    });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
};

const openDecks = async (page: Page) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await expect(page.locator('.dlist')).toBeVisible();
};

/** What the app keeps: every deck as stored, and every localStorage key the app uses. */
const kept = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const decks: any[] = await new Promise((ok) => {
      const r = db.transaction(['decks']).objectStore('decks').getAll();
      r.onsuccess = () => ok(r.result);
    });
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith('ch:') && k !== 'ch:tab')
      .sort();
    return { decks: JSON.stringify(decks), keys };
  });

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('COMPARE shows only from two decks up', async ({ page }) => {
  await openDecks(page);
  await expect(page.locator('.dlist .ctab', { hasText: 'DECKS' })).toBeVisible();
  await expect(page.locator('.dlist .ctab', { hasText: 'COMPARE' })).toHaveCount(0);
  await addSecondDeck(page);
  await openDecks(page);
  await expect(page.locator('.dlist .ctab', { hasText: 'COMPARE' })).toBeVisible();
});

test('COMPARE puts two decks side by side, says each difference in words, and saves nothing', async ({ page }) => {
  await addSecondDeck(page);
  await openDecks(page);
  const before = await kept(page);

  await page.locator('.dlist .ctab', { hasText: 'COMPARE' }).click();
  const pane = page.locator('.dcompare');
  await expect(pane).toBeVisible();
  await expect(page.locator('.dlist .decktoolbar')).toHaveCount(0); // the deck list waits on DECKS

  await pane.getByLabel('Baseline deck').selectOption({ label: 'Tatyova Lands' });
  await pane.getByLabel('Deck to compare').selectOption({ label: 'Cobra Ramp' });

  // Tatyova Lands: 20 Forest + 20 Island; Cobra Ramp: 30 Forest
  const lands = pane.locator('.dcmp-row[data-row="lands"]');
  await expect(lands.locator('.dcmp-val').nth(0)).toHaveText('40');
  await expect(lands.locator('.dcmp-val').nth(1)).toHaveText('30');
  await expect(lands.locator('.dcmp-delta')).toHaveText('−10');
  await expect(lands.locator('.dcmp-says')).toHaveText('Cobra Ramp runs 10 fewer lands than Tatyova Lands.');
  await expect(pane.locator('.dcmp-row[data-row="cards"] .dcmp-says')).toHaveText('Cobra Ramp has 12 fewer cards than Tatyova Lands.');

  // the bracket is always an estimate; main deck only, nothing saved: said on the page
  await expect(pane.locator('.dcmp-row[data-row="bracket"] .dcmp-label')).toHaveText('Bracket estimate');
  await expect(pane.locator('.dcmp-row[data-row="bracket"] .dcmp-val').first()).toContainText('(est.)');
  await expect(pane.locator('.dcmp-note')).toContainText('Main deck only');
  await expect(pane.locator('.dcmp-note')).toContainText('Nothing here is saved');

  // the swap button turns the comparison round
  await pane.getByRole('button', { name: 'Swap the two decks' }).click();
  await expect(lands.locator('.dcmp-delta')).toHaveText('+10');
  await expect(lands.locator('.dcmp-says')).toHaveText('Tatyova Lands runs 10 more lands than Cobra Ramp.');
  // picking the other side's deck swaps them rather than comparing a deck with itself
  await pane.getByLabel('Baseline deck').selectOption({ label: 'Tatyova Lands' });
  expect(await pane.getByLabel('Deck to compare').inputValue()).not.toBe(await pane.getByLabel('Baseline deck').inputValue());
  await expect(lands.locator('.dcmp-val').nth(0)).toHaveText('40');
  await expect(lands.locator('.dcmp-val').nth(1)).toHaveText('30');

  await fits(page, ['.dcompare', '.dcmp-picks', '.dcmp-row']);

  // nothing was written: the decks and the app's stored settings are exactly as before
  expect(await kept(page)).toEqual(before);

  // and leaving forgets the picks: the tab row brings the decks back
  await page.locator('.dlist .ctab', { hasText: 'DECKS' }).click();
  await expect(pane).toHaveCount(0);
  await expect(page.locator('.dlist .decktoolbar')).toBeVisible();
});

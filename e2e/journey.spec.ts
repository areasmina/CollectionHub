import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/**
 * The deckbuilding journey, step 1 (Guillermo, Nov 27): START (Guided) · EXPLORE (tag graph) · TUNE (the deck's Forge)
 * sit on one bar on all three, and a tap moves between them with the commander's colours carried along.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const bar = (page: Page) => page.getByRole('navigation', { name: 'Deckbuilding journey' });
const stepBtn = (page: Page, name: 'START' | 'EXPLORE' | 'TUNE') => bar(page).getByRole('button', { name, exact: true });

test('Deck page sits at TUNE; EXPLORE opens the tag graph in the deck’s colours; START opens Guided', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dtile .dcard').first().click();
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/TUNE/);
  await fits(page, ['nav[aria-label="Deckbuilding journey"]']);
  for (const b of await bar(page).getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/journey-deck-${info.project.name}.png` });

  await stepBtn(page, 'EXPLORE').click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/EXPLORE/);
  // Tatyova is blue-green: the graph's colour filter opens on exactly U and G
  await expect(page.locator('[aria-label^="Filter colour"][aria-pressed="true"]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Filter colour U' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Filter colour G' })).toHaveAttribute('aria-pressed', 'true');

  await stepBtn(page, 'START').click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/START/);
  await expect(page.getByText('Step 1 of 9', { exact: false })).toBeVisible();
});

test('Guided: TUNE waits for a commander, then saves the build as a deck and opens it at TUNE', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();
  await page.getByRole('tab', { name: 'GUIDED BUILDER' }).click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/START/);
  // no commander yet: TUNE says why and does nothing
  const tune = bar(page).getByRole('button', { name: /^TUNE/ });
  await expect(tune).toHaveAttribute('aria-disabled', 'true');
  await expect(tune).toHaveAttribute('title', /Pick a commander first/);
  await tune.dispatchEvent('click'); // a greyed stop does nothing (Playwright would wait for it to enable)
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/START/);

  await page.getByRole('button', { name: 'CHOOSE' }).first().click();
  await expect(stepBtn(page, 'TUNE')).not.toHaveAttribute('aria-disabled', 'true');
  const before = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('decks').objectStore('decks').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  await stepBtn(page, 'TUNE').click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/TUNE/);
  await expect(page.locator('.forgemain')).toBeVisible();
  const after = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('decks').objectStore('decks').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  expect(after).toBe(before + 1);
});

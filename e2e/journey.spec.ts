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

test('EXPLORE from a deck adds your cards into that deck (+ ADD, with UNDO), then TUNE goes back to it', async ({ page }, info) => {
  // the deck without Rhystic Study, so the graph's starter tag (draw) shows a card of yours to add
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    const store = tx.objectStore('decks');
    store.getAll().onsuccess = (e: any) => {
      for (const d of e.target.result) store.put({ ...d, cards: d.cards.filter((c: any) => c.name !== 'Rhystic Study') });
    };
    await new Promise((ok) => (tx.oncomplete = ok));
    localStorage.setItem('ch:tab', 'decks');
  });
  await page.reload();
  await page.locator('.dtile .dcard').first().click();
  await stepBtn(page, 'EXPLORE').click();
  await expect(page.getByRole('status').filter({ hasText: 'ADDING TO' })).toContainText('Tatyova Lands');
  await expect(stepBtn(page, 'TUNE')).not.toHaveAttribute('aria-disabled', 'true');
  const add = page.getByRole('button', { name: 'Add Rhystic Study to Tatyova Lands' });
  await expect(add).toBeVisible();
  if (info.project.name === 'phone') expect((await add.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await add.click();
  await expect(page.locator('li', { hasText: 'Rhystic Study' }).getByText('✓ IN DECK')).toBeVisible();
  await page.screenshot({ path: `test-results/journey-explore-${info.project.name}.png` });

  await stepBtn(page, 'TUNE').click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/TUNE/);
  const saved = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const all: any[] = await new Promise((ok) => (db.transaction('decks').objectStore('decks').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return all.find((d) => d.name === 'Tatyova Lands').cards.some((c: any) => c.name === 'Rhystic Study');
  });
  expect(saved).toBe(true);
});

test('NEXT tips quote the deck’s own checks, and a tip opens EXPLORE on that tag, adding into the deck', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dtile .dcard').first().click();
  const tips = page.getByRole('list', { name: 'Next steps for this deck' });
  await expect(tips).toBeVisible();
  await expect(tips.getByRole('listitem')).toHaveCount(info.project.name === 'phone' ? 1 : 2); // one on a phone, never more than two
  // the mock deck is short on removal: the tip says so with the Readiness check's own numbers
  await expect(tips.getByRole('listitem').first()).toContainText('Find more removal of yours');
  await expect(tips.getByRole('listitem').first()).toContainText(/why: \d+ removal/);
  await fits(page, ['ul[aria-label="Next steps for this deck"]']);
  if (info.project.name === 'phone') for (const b of await tips.getByRole('button').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);

  await tips.getByRole('button', { name: /Find more removal/ }).click();
  await expect(bar(page).locator('[aria-current="step"]')).toHaveText(/EXPLORE/);
  await expect(page.getByRole('status').filter({ hasText: 'ADDING TO' })).toContainText('Tatyova Lands');
  await expect(page.getByRole('button', { name: 'removal', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

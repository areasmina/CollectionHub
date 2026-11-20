import { expect, test, type Page } from '@playwright/test';
import { mockWorld, openImport, seed } from './mock';
// @ts-expect-error plain JS build script module
import { cardListFile } from '../scripts/cardlist-format.mjs';

/**
 * The app's own card list (Phase 5C): kept on the device on a good connection, used when Scryfall can't answer, so an
 * import on a plane still knows every card. Runs at phone, tablet and desktop.
 */
const NEW = {
  name: 'Brand New Card',
  layout: 'normal',
  games: ['paper'],
  type_line: 'Creature — Goblin',
  mana_cost: '{R}',
  cmc: 1,
  color_identity: ['R'],
  rarity: 'rare',
  legalities: { commander: 'legal' },
  oracle_text: 'Haste',
  id: 'dddd0000-0000-4000-8000-000000000004',
  set: 'tst',
  collector_number: '9',
};
const listed = (page: Page) => page.evaluate(async () => !!(await (await caches.open('ch-cardlist')).match('/cards/oracle.json')));

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await page.route(/\/cards\/oracle\.json$/, (r) => r.fulfill({ contentType: 'application/json', body: cardListFile([NEW], '2026-11-20T00:00:00Z') }));
  await seed(page);
});

test('Card list: kept on a good connection, then an import with Scryfall down still finds every card', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await expect.poll(() => listed(page)).toBe(true);

  // Scryfall stops answering
  await page.route(/api\.scryfall\.com\/cards\/collection/, (r) => r.abort());
  await page.clock.install();
  await page.reload();
  const box = await openImport(page);
  await box.locator('textarea').fill('2 Brand New Card');
  await box.getByRole('button', { name: '+ ADD' }).click();
  await expect
    .poll(async () => (await page.clock.runFor(15_000), await box.locator('.report').count()), { timeout: 40_000 })
    .toBe(1);
  await expect(box.locator('.report')).not.toContainText('not looked up');
  const saved = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const all = (s: string) => new Promise<any[]>((ok) => (db.transaction(s).objectStore(s).getAll().onsuccess = (e: any) => ok(e.target.result)));
    const [entries, cards] = await Promise.all([all('entries'), all('cards')]);
    return { entry: entries.find((e) => e.name === 'Brand New Card'), card: cards.find((c) => c.name === 'Brand New Card') };
  });
  expect(saved.entry).toMatchObject({ qty: 2, cardId: NEW.id });
  // known from the list: type and colours, no price yet, marked to be fetched again once Scryfall answers
  expect(saved.card).toMatchObject({ type: 'Creature — Goblin', ci: ['R'], pv: 0 });
  expect(saved.card.usd).toBeUndefined();
});

test('Card list: the sync drawer says when the list was saved', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect.poll(() => listed(page)).toBe(true);
  await page.locator('.syncpill .sdot').click();
  await expect(page.locator('.island-drawer .id-sync-cardlist')).toContainText('Card list saved');
});

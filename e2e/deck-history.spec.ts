import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Deck history step 0 (Nov 25): versions live in the app database under the deck's own uid, the old on-device
 *  versions move in, saving or restoring never touches binder copies, and deleting a deck deletes its versions. */
const read = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const all = (s: string): Promise<any[]> => new Promise((ok) => (db.transaction(s).objectStore(s).getAll().onsuccess = (e: any) => ok(e.target.result)));
    const [decks, entries, cache] = await Promise.all([all('decks'), all('entries'), all('edhrec')]);
    db.close();
    return {
      decks: decks.map((d) => ({ id: d.id, name: d.name, uid: d.uid as string | undefined, cards: d.cards.length })),
      entries: JSON.stringify(entries.map((e) => [e.id, e.cardId, e.qty, !!e.foil]).sort()),
      versions: cache.filter((r) => String(r.path).startsWith('deckver:')).map((r) => ({ path: r.path as string, label: r.data.label, kind: r.data.kind, uid: r.data.uid })),
    };
  });

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('old on-device versions move in under the deck uid; a named version, a restore and a delete keep the binder as it was', async ({ page }) => {
  // an older device: two versions of deck number 1 in localStorage (the store before this change)
  await page.evaluate(() => {
    localStorage.setItem('hub_deck_snapshots_1', JSON.stringify([{ id: 'a', at: Date.now() - 86_400_000, label: 'Manual save (10:00)', cardCount: 3, cards: [{ name: 'Lotus Cobra', qty: 1 }, { name: 'Counterspell', qty: 1 }, { name: 'Forest', qty: 20 }] }]));
    localStorage.setItem('ch:tab', 'decks');
  });
  await page.reload();
  await expect.poll(async () => (await read(page)).versions.length, { message: 'the old version moved in' }).toBe(1);
  const start = await read(page);
  const uid = start.decks[0].uid!;
  expect(uid).toBeTruthy(); // the older deck got its uid when its history moved in
  expect(start.versions[0]).toMatchObject({ uid, kind: 'named', label: 'Manual save (10:00)' });
  expect(start.versions[0].path.startsWith(`deckver:${uid}:`)).toBe(true);

  // a named version from the deck menu
  const tile = page.locator('.dcard', { hasText: 'Tatyova Lands' }).first();
  await tile.click({ button: 'right' });
  const menu = page.locator('.cardmenu.deckmenu');
  await expect(menu.getByRole('menuitem', { name: /RESTORE VERSION/ })).toContainText('1 saved snapshots');
  await menu.getByRole('menuitem', { name: /CREATE SNAPSHOT/ }).click();
  await expect.poll(async () => (await read(page)).versions.length).toBe(2);

  // restore the old version: the deck's list changes, the binder does not
  page.on('dialog', (d) => void (d.type() === 'prompt' ? d.accept('2') : d.accept())); // 2 = the older one (newest first)
  await tile.click({ button: 'right' });
  await expect(menu.getByRole('menuitem', { name: /RESTORE VERSION/ })).toContainText('2 saved snapshots');
  await menu.getByRole('menuitem', { name: /RESTORE VERSION/ }).click();
  await expect.poll(async () => (await read(page)).decks[0].cards, { message: 'the 3-card version is back' }).toBe(3);
  const after = await read(page);
  expect(after.entries).toBe(start.entries); // binder copies, counts and foils untouched
  expect(after.decks[0].uid).toBe(uid);
  expect(after.versions.map((v) => v.kind).sort()).toEqual(['named', 'named', 'restore']); // "Before restore" kept

  // deleting the deck deletes its versions
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).first().click({ button: 'right' });
  await menu.getByRole('menuitem', { name: /DELETE DECK/ }).click();
  await expect.poll(async () => (await read(page)).decks.length).toBe(0);
  await expect.poll(async () => (await read(page)).versions.length, { message: 'its versions went with it' }).toBe(0);
  expect((await read(page)).entries).toBe(start.entries);
});

test('a new deck gets its own uid, and DUPLICATE gives the copy a new one (its own history)', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).first().click({ button: 'right' });
  await page.locator('.cardmenu.deckmenu').getByRole('menuitem', { name: /DUPLICATE/ }).click();
  await expect.poll(async () => (await read(page)).decks.length).toBe(2);
  const { decks } = await read(page);
  const copy = decks.find((d) => d.name.includes('(copy)'))!;
  expect(copy.uid).toBeTruthy();
  expect(copy.uid).not.toBe(decks.find((d) => d !== copy)!.uid);
});

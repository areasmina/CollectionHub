import { expect, test, type Download, type Page } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/**
 * Collection export and binder sharing, from the binder menu (the BINDER tag under COLLECTION): EXPORT THIS BINDER
 * (one binder, CSV), EXPORT ALL BINDERS (every binder in one CSV, a Binder Name column) and SHARE THIS BINDER (the
 * share sheet on touch screens, the clipboard elsewhere). Each file is read back with the app's own importer rules.
 * Runs at phone, tablet and desktop.
 */
const text = async (d: Download) => Buffer.concat(await (await d.createReadStream()).toArray()).toString('utf8');

/** Names the seeded binder "My Cards" and opens it; with `more`, adds a second binder with two cards and one card in
 *  Unassigned Cards. */
async function binders(page: Page, more = true) {
  await page.evaluate(async (more) => {
    localStorage.setItem('ch:profile', '1');
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['profiles', 'entries'], 'readwrite');
    tx.objectStore('profiles').put({ id: 1, name: 'My Cards' });
    if (!more) return void (await new Promise((ok) => (tx.oncomplete = ok)));
    tx.objectStore('profiles').put({ id: 2, name: 'Trade Box' });
    tx.objectStore('entries').put({ profile: 2, cardId: '00000002-1111-2222-3333-000000000001', name: 'Sol Ring', qty: 3, set: 'tst', cn: '9' });
    tx.objectStore('entries').put({ profile: 2, cardId: '00000005-1111-2222-3333-000000000004', name: 'Counterspell', qty: 1, set: 'tst', cn: '8', foil: true });
    tx.objectStore('entries').put({ profile: 0, cardId: '00000007-1111-2222-3333-000000000006', name: 'Forest', qty: 5 });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, more);
}

async function openMenu(page: Page) {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await page.locator('.bmbtn').click();
  const menu = page.getByRole('menu', { name: 'Binders' });
  await expect(menu).toBeVisible();
  return menu;
}

const binderCopies = (page: Page, profile: number) =>
  page.evaluate(async (p) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const all = await new Promise<any[]>((ok) => (db.transaction('entries').objectStore('entries').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return all.filter((e) => p < 0 || e.profile === p).reduce((n, e) => [n[0] + 1, n[1] + e.qty], [0, 0]);
  }, profile);

test('Binder menu: EXPORT THIS BINDER saves the open binder as a CSV the importer reads back', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await binders(page);
  const menu = await openMenu(page);
  await fits(page, ['.bmenu']);
  const [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: /EXPORT THIS BINDER/ }).click()]);
  expect(file.suggestedFilename()).toBe('My_Cards.csv');
  const lines = (await text(file)).split('\n');
  expect(lines[0]).toBe('Name,Quantity,Set code,Collector number,Foil,Scryfall ID');
  const [rows, copies] = await binderCopies(page, 1);
  expect(lines).toHaveLength(rows + 1);
  expect(lines.slice(1).reduce((n, l) => n + Number(l.match(/^(?:"[^"]*"|[^,]*),(\d+)/)![1]), 0)).toBe(copies);
  // Only this binder: the second binder's foil Counterspell is not in it.
  expect(lines.some((l) => l.startsWith('Counterspell,1,tst,8,foil'))).toBe(false);
});

test('Binder menu: EXPORT ALL BINDERS saves every binder in one CSV, each row naming its binder', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await binders(page);
  const menu = await openMenu(page);
  const [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: /EXPORT ALL BINDERS/ }).click()]);
  expect(file.suggestedFilename()).toMatch(/^collectionhub-all-binders-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await text(file)).split('\n');
  expect(lines[0]).toBe('Binder Name,Name,Quantity,Set code,Collector number,Foil,Scryfall ID,List');
  const [rows, copies] = await binderCopies(page, -1);
  expect(lines).toHaveLength(rows + 1);
  const names = new Set(lines.slice(1).map((l) => l.split(',')[0]));
  expect([...names]).toEqual(['My Cards', 'Trade Box', 'Unassigned Cards']);
  expect(lines).toContain('Trade Box,Counterspell,1,tst,8,foil,00000005-1111-2222-3333-000000000004,');
  await expect(menu.getByRole('status')).toContainText(`3 binders, ${copies} cards`);
});

test('Binder menu: SHARE THIS BINDER hands over the card list (share sheet on touch, clipboard elsewhere)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as any).__shared = [];
    // Stand-ins for the system share sheet and the clipboard, which a headless browser doesn't have.
    Object.defineProperty(navigator, 'share', { configurable: true, value: async (d: any) => (window as any).__shared.push({ how: 'share', title: d.title, text: d.text ?? (d.files ? await d.files[0].text() : '') }) });
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: (d: any) => !!d.files });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (t: string) => (window as any).__shared.push({ how: 'clipboard', text: t }) } });
  });
  await mockWorld(page);
  await seed(page);
  await binders(page, false);
  const menu = await openMenu(page);
  await menu.getByRole('menuitem', { name: /SHARE THIS BINDER/ }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
  const got = await page.evaluate(() => (window as any).__shared[0]);
  const touch = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
  expect(got.how).toBe(touch ? 'share' : 'clipboard');
  const [rows, copies] = await binderCopies(page, 1);
  const lines = got.text.split('\n');
  expect(lines[0]).toBe(`# My Cards: ${copies} cards, ${rows} unique`);
  expect(lines).toContain('4 Rhystic Study (TST) 3 *F*');
  if (!touch) await expect(menu.getByRole('status')).toContainText('Copied My Cards');
});

test('Binder menu: FILE picks the export type (CSV, TXT, CollectionHub), remembered for next time', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await binders(page);
  let menu = await openMenu(page);
  const pick = menu.getByRole('group', { name: 'Export file type' });
  await expect(pick.getByRole('menuitemradio', { name: 'CSV' })).toHaveAttribute('aria-checked', 'true');
  await fits(page, ['.bmenu', '.bmfmt']);

  // TXT, this binder: the plain list, one card a line.
  await pick.getByRole('menuitemradio', { name: 'TXT' }).click();
  await expect(menu.getByRole('menuitem', { name: /EXPORT THIS BINDER/ })).toContainText('TXT');
  let [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: /EXPORT THIS BINDER/ }).click()]);
  expect(file.suggestedFilename()).toBe('My_Cards.txt');
  const [rows] = await binderCopies(page, 1);
  const lines = (await text(file)).split('\n');
  expect(lines).toHaveLength(rows);
  expect(lines).toContain('4 Rhystic Study (TST) 3 *F*');

  // CollectionHub, this binder: the backup shape with only this binder, its cards and its deck.
  menu = await openMenu(page);
  await menu.getByRole('group', { name: 'Export file type' }).getByRole('menuitemradio', { name: 'CollectionHub' }).click();
  [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: /EXPORT THIS BINDER/ }).click()]);
  expect(file.suggestedFilename()).toBe('My_Cards.collectionhub.json');
  let body = JSON.parse(await text(file));
  expect(body.app).toBe('collectionhub');
  expect(body.profiles).toEqual([{ id: 1, name: 'My Cards' }]);
  expect(body.entries).toHaveLength(rows);
  expect(new Set(body.entries.map((e: any) => e.profile))).toEqual(new Set([1]));
  expect(body.decks.map((d: any) => d.name)).toEqual(['Tatyova Lands']);

  // The choice is remembered: reopened after a reload, CollectionHub is still picked; all binders go in one file.
  menu = await openMenu(page);
  await expect(menu.getByRole('menuitemradio', { name: 'CollectionHub' })).toHaveAttribute('aria-checked', 'true');
  [file] = await Promise.all([page.waitForEvent('download'), menu.getByRole('menuitem', { name: /EXPORT ALL BINDERS/ }).click()]);
  expect(file.suggestedFilename()).toMatch(/^collectionhub-all-binders-\d{4}-\d{2}-\d{2}\.json$/);
  body = JSON.parse(await text(file));
  const [all] = await binderCopies(page, -1);
  expect(body.entries).toHaveLength(all);
  expect(body.profiles.map((p: any) => p.name).sort()).toEqual(['My Cards', 'Trade Box']);
  await expect(menu.getByRole('status')).toContainText('one CollectionHub file');
});

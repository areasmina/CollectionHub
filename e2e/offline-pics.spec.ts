import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

// Chromium routes a service worker's own requests through context.route only with this switch (Playwright 1.56).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = '1';

/**
 * Offline card pictures (Phase 5B). These checks run the real service worker (the other checks block it):
 * a picture you have seen shows with no connection, SAVE MY DECKS NOW keeps the small picture of every card in your
 * decks (moving one already seen, never a second copy), and a big picture never seen falls back to that small one.
 */
test.use({ serviceWorkers: 'allow' });

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGcAAAIEAQAhVzR2AAAAAElFTkSuQmCC', 'base64');

/** Scryfall's picture server, as measured on Nov 20: every picture answers with Access-Control-Allow-Origin: *.
 *  Routed on the context, so the service worker's own requests are answered too. */
async function picServer(context: BrowserContext) {
  const asked: string[] = [];
  await context.route(/cards\.scryfall\.io|svgs\.scryfall\.io/, (r) => {
    asked.push(r.request().url());
    return r.fulfill({ body: PNG, contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' } });
  });
  return asked;
}

/** No connection: Playwright still answers routed requests while "offline", so the picture server is cut as well. */
async function offline(context: BrowserContext) {
  await context.setOffline(true);
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  await context.route(/scryfall\.io/, (r) => r.abort('internetdisconnected'));
}

async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
}

const drawn = (page: Page) =>
  page.locator('.cgrid2 > .ctile .timg img').evaluateAll((imgs) => (imgs as HTMLImageElement[]).slice(0, 6).map((i) => i.complete && i.naturalWidth > 0));
const cacheSize = (page: Page, name: string) => page.evaluate(async (n) => (await (await caches.open(n)).keys()).length, name);

async function openCollection(page: Page) {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
}

async function saveMine(page: Page) {
  await page.locator('.syncpill .sdot').click();
  const box = page.locator('.island-drawer .id-sync-offline');
  await expect(box).toBeVisible();
  await box.getByRole('button', { name: 'SAVE MY DECKS NOW' }).click();
  await expect(box.getByRole('status')).toContainText('every card in your decks shows offline');
  await expect(box).toContainText(/\d+ saved/);
  return box;
}

test('Offline pictures: a picture you have seen shows again with no connection', async ({ page, context }) => {
  await picServer(context);
  await mockWorld(page);
  await seed(page);
  await controlled(page);
  await openCollection(page);
  await expect.poll(async () => (await drawn(page)).every(Boolean)).toBe(true);
  await expect.poll(() => cacheSize(page, 'ch-pics-big')).toBeGreaterThan(0);

  await offline(context);
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await expect.poll(async () => (await drawn(page)).every(Boolean)).toBe(true);
  // back online, a picture already kept is not downloaded again
  await context.setOffline(false);
  await context.unrouteAll({ behavior: 'ignoreErrors' });
  const again = await picServer(context);
  await mockWorld(page);
  await page.reload();
  await expect.poll(async () => (await drawn(page)).every(Boolean)).toBe(true);
  expect(again.filter((u) => u.includes('/normal/'))).toEqual([]);
});

/** Takes `name` out of the seeded deck (the seed's deck holds every seeded card). */
const dropFromDeck = (page: Page, name: string) =>
  page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction('decks', 'readwrite');
    const st = tx.objectStore('decks');
    const all: any[] = await new Promise((ok) => (st.getAll().onsuccess = (e: any) => ok(e.target.result)));
    for (const d of all) st.put({ ...d, cards: d.cards.filter((c: any) => c.name !== name) });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, name);
const cacheUrls = (page: Page, name: string) => page.evaluate(async (n) => (await (await caches.open(n)).keys()).map((r) => r.url), name);

test('Offline pictures: SAVE MY DECKS NOW keeps every deck card, and a never-seen big picture falls back to it', async ({ page, context }, info) => {
  await picServer(context);
  await mockWorld(page);
  await seed(page);
  await controlled(page);
  await openCollection(page);
  const box = await saveMine(page);
  const inDeck = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const decks: any[] = await new Promise((ok) => (db.transaction('decks').objectStore('decks').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return new Set(decks.flatMap((d) => [d.commander, ...d.cards.map((c: any) => c.name)]).filter(Boolean)).size;
  });
  expect(inDeck).toBeGreaterThan(2);
  expect(await cacheSize(page, 'ch-pics-owned')).toBe(inDeck);
  // a picture kept from looking at it was moved, not stored twice
  const ahead = new Set(await cacheUrls(page, 'ch-pics-owned'));
  expect((await cacheUrls(page, 'ch-pics')).filter((u) => ahead.has(u))).toEqual([]);
  await page.screenshot({ path: `test-results/offline-pics-drawer-${info.project.name}.png` });
  await box.page().keyboard.press('Escape');

  // forget every big picture, go offline: the grid shows the saved small pictures instead of blank cards
  // (a fresh tab, so nothing is left in the open page's own memory)
  await page.evaluate(() => caches.delete('ch-pics-big'));
  await offline(context);
  await page.close();
  const tab = await context.newPage();
  await tab.goto('/');
  await expect(tab.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await expect.poll(async () => (await drawn(tab)).every(Boolean)).toBe(true);
  // Read the pictures' addresses in one go with "drawn": the grid can re-render between two separate reads (a fresh
  // <img> has no address yet), which made this check fail now and then on CI (Nov 23) while the pictures were fine.
  // The check itself is unchanged: the first three cards must end up drawn from the saved small pictures.
  const small = () =>
    tab.locator('.cgrid2 > .ctile .timg img').evaluateAll((imgs) =>
      (imgs as HTMLImageElement[]).slice(0, 3).map((i) => (i.complete && i.naturalWidth > 0 ? i.currentSrc : '(not drawn)')),
    );
  await expect.poll(async () => (await small()).every((s) => s.includes('/small/')), { message: 'the first three cards are drawn from the saved small pictures' }).toBe(true);
  await context.setOffline(false);
});

test('Offline pictures: an owned card in no deck is not saved ahead (it is kept only once looked at)', async ({ page, context }) => {
  await picServer(context);
  await mockWorld(page);
  await seed(page);
  const name = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const decks: any[] = await new Promise((ok) => (db.transaction('decks').objectStore('decks').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return decks[0].cards.find((c: any) => c.name !== decks[0].commander).name as string;
  });
  await dropFromDeck(page, name);
  const id = await page.evaluate(async (name) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const cards: any[] = await new Promise((ok) => (db.transaction('cards').objectStore('cards').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return cards.find((c) => c.name === name).id as string;
  }, name);
  await controlled(page);
  await openCollection(page);
  await saveMine(page);
  const ahead = await cacheUrls(page, 'ch-pics-owned');
  expect(ahead.length).toBeGreaterThan(1);
  expect(ahead.some((u) => u.includes(id))).toBe(false);
});

test('Offline pictures: CLEAR removes the pictures only; binders stay', async ({ page, context }) => {
  await picServer(context);
  await mockWorld(page);
  await seed(page);
  await controlled(page);
  await openCollection(page);
  const box = await saveMine(page);
  const entries = () =>
    page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
      return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
    });
  const n = await entries();
  page.once('dialog', (d) => d.accept());
  await box.getByRole('button', { name: 'CLEAR' }).click();
  await expect(box.getByRole('status')).toContainText('Saved pictures removed');
  expect(await cacheSize(page, 'ch-pics-owned')).toBe(0);
  expect(await entries()).toBe(n);
});

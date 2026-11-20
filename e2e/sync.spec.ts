import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';
// @ts-expect-error plain JS worker module
import worker, { SyncBox } from '../worker/sync.js';

// Two devices (browser contexts) syncing through the real Worker code, run in memory (no network, no Cloudflare).
function fakeCloud() {
  const boxes = new Map<string, SyncBox>();
  const storage = () => {
    const m = new Map<string, unknown>();
    const s: any = {
      get: async (k: string | string[]) => (Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, m.get(x)])) : m.get(k)),
      put: async (k: any, v?: unknown) => (typeof k === 'string' ? m.set(k, v) : Object.entries(k).forEach(([a, b]) => m.set(a, b))),
      delete: async (k: string | string[]) => (Array.isArray(k) ? k : [k]).forEach((x) => m.delete(x)),
      deleteAll: async () => m.clear(),
      transaction: async (f: (tx: unknown) => Promise<void>) => f(s),
    };
    return s;
  };
  const env = { BOX: { idFromName: (n: string) => n, get: (n: string) => (boxes.has(n) || boxes.set(n, new SyncBox({ storage: storage() })), boxes.get(n)!) } };
  return async (ctx: BrowserContext) =>
    ctx.route(/collectionhub-sync\.areasmina\.workers\.dev/, async (route) => {
      const q = route.request();
      const body = q.postDataBuffer();
      const res: Response = await worker.fetch(new Request(q.url(), { method: q.method(), headers: q.headers(), body: body && q.method() !== 'GET' ? body : undefined }), env);
      await route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: Buffer.from(await res.arrayBuffer()) });
    });
}
const openSync = async (page: Page) => {
  await page.locator('.pillnav').getByRole('button', { name: /collection/i }).first().click();
  await page.locator('.bmbtn').click(); // SYNC lives in the binder menu
  await page.getByRole('menuitem', { name: /SYNC/ }).click();
  await expect(page.getByRole('heading', { name: 'SYNC BETWEEN DEVICES' })).toBeVisible();
};
const entries = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const c = q.result.transaction('entries').objectStore('entries').count();
          c.onsuccess = () => ok(c.result);
        };
      }),
  );

test('sync code: turn on, link a second device by link, change the code', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one size is enough for the sync flow');
  const cloud = fakeCloud();
  const [ca, cb] = [await browser.newContext({ viewport: { width: 1280, height: 900 } }), await browser.newContext({ viewport: { width: 400, height: 860 } })];
  await Promise.all([cloud(ca), cloud(cb)]);
  const a = await ca.newPage();
  const b = await cb.newPage();
  await mockWorld(a);
  await mockWorld(b);
  await seed(a);
  const owned = await entries(a);
  expect(owned).toBeGreaterThan(0);

  await openSync(a);
  await a.getByRole('button', { name: 'TURN ON SYNC' }).click();
  const code = (await a.locator('.synccode').innerText()).replace(/-/g, '');
  expect(code).toMatch(/^[a-z2-9]{20}$/);
  await expect(a.locator('.syncstate')).toContainText('Up to date');

  // Second device: opens the link, confirms, gets the binders.
  await b.goto('/#sync/' + code);
  await expect(b.getByRole('button', { name: 'LINK THIS DEVICE' })).toBeVisible();
  expect(new URL(b.url()).hash).toBe(''); // the code leaves the address bar
  await b.getByRole('button', { name: 'LINK THIS DEVICE' }).click();
  await expect.poll(() => entries(b), { timeout: 15_000 }).toBe(owned);
  await expect(b.locator('.synccode')).toHaveText(await a.locator('.synccode').innerText());

  // A new code on the first device retires the old one: the second device is told to link again.
  a.on('dialog', (d) => d.accept());
  await a.getByRole('button', { name: 'CHANGE CODE' }).click();
  await expect(a.locator('[role=status]').last()).toContainText('New code made');
  expect((await a.locator('.synccode').innerText()).replace(/-/g, '')).not.toBe(code);
  await b.getByRole('button', { name: 'sync now' }).click();
  await expect(b.locator('.syncstate')).toContainText('changed on another device');
  await ca.close();
  await cb.close();
});

// Phase 5D: both devices change between syncs. Before, sync stopped and asked which whole side to keep; now it merges
// card by card against the copy both last held, and the device that merged keeps a backup of its own copy.
const qtyOf = (page: Page, id: number) =>
  page.evaluate(
    (id) =>
      new Promise<number>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const g = q.result.transaction('entries').objectStore('entries').get(id);
          g.onsuccess = () => ok(g.result?.qty ?? 0);
        };
      }),
    id,
  );
/** Changes one card's count the way an edit does (and marks the device as changed), without starting a sync. */
const recount = (page: Page, id: number, by: number) =>
  page.evaluate(
    ([id, by]) =>
      new Promise<void>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const s = q.result.transaction('entries', 'readwrite').objectStore('entries');
          const g = s.get(id);
          g.onsuccess = () => {
            s.put({ ...g.result, qty: g.result.qty + by }).onsuccess = () => {
              localStorage.setItem('ch:sync:dirty', String(Date.now()));
              ok();
            };
          };
        };
      }),
    [id, by] as const,
  );
const firstIds = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<number[]>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const k = q.result.transaction('entries').objectStore('entries').getAllKeys();
          k.onsuccess = () => ok((k.result as number[]).slice(0, 2));
        };
      }),
  );
const backups = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string[]>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const k = q.result.transaction('edhrec').objectStore('edhrec').getAllKeys();
          k.onsuccess = () => ok((k.result as string[]).filter((p) => p.startsWith('backup:')));
        };
      }),
  );

test('sync merge: both devices changed, each keeps the other one\'s change, and a backup is kept', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one size is enough for the sync flow');
  const cloud = fakeCloud();
  const [ca, cb] = [await browser.newContext({ viewport: { width: 1280, height: 900 } }), await browser.newContext({ viewport: { width: 400, height: 860 } })];
  await Promise.all([cloud(ca), cloud(cb)]);
  const a = await ca.newPage();
  const b = await cb.newPage();
  await mockWorld(a);
  await mockWorld(b);
  await seed(a);
  const owned = await entries(a);
  await openSync(a);
  await a.getByRole('button', { name: 'TURN ON SYNC' }).click();
  const code = (await a.locator('.synccode').innerText()).replace(/-/g, '');
  await b.goto('/#sync/' + code);
  await b.getByRole('button', { name: 'LINK THIS DEVICE' }).click();
  await expect.poll(() => entries(b), { timeout: 15_000 }).toBe(owned);
  await expect(b.locator('.syncstate')).toContainText('Up to date');

  const [x, y] = await firstIds(a);
  const [x0, y0] = [await qtyOf(a, x), await qtyOf(a, y)];
  // Each device changes a different card while the other doesn't know yet; and both recount the same card x.
  await recount(a, x, 1);
  await recount(b, y, 5);
  await recount(b, x, 2);
  await a.getByRole('button', { name: 'sync now' }).click(); // A saves first (the cloud hadn't moved)
  await expect(a.locator('.syncstate')).toContainText('Up to date');
  await b.getByRole('button', { name: 'sync now' }).click(); // B: both changed → merged, not "pick a side"
  await expect(b.locator('.syncstate')).toContainText('Up to date');
  await expect(b.locator('.syncstate')).not.toContainText(/pick/i);
  expect([await qtyOf(b, x), await qtyOf(b, y)]).toEqual([x0 + 3, y0 + 5]);
  expect(await entries(b)).toBe(owned);
  expect((await backups(b)).length).toBe(1);
  // A fetches the merged copy: both devices hold every change
  await a.getByRole('button', { name: 'sync now' }).click();
  await expect.poll(() => qtyOf(a, y), { timeout: 15_000 }).toBe(y0 + 5);
  expect(await qtyOf(a, x)).toBe(x0 + 3);
  await ca.close();
  await cb.close();
});

test('sync merge: linking a device that already has its own binders offers MERGE BOTH, and nothing is lost', async ({ browser }, info) => {
  test.skip(info.project.name !== 'desktop', 'one size is enough for the sync flow');
  const cloud = fakeCloud();
  const [ca, cb] = [await browser.newContext({ viewport: { width: 1280, height: 900 } }), await browser.newContext({ viewport: { width: 400, height: 860 } })];
  await Promise.all([cloud(ca), cloud(cb)]);
  const a = await ca.newPage();
  const b = await cb.newPage();
  await mockWorld(a);
  await mockWorld(b);
  await seed(a);
  await seed(b);
  const owned = await entries(a);
  const [x] = await firstIds(b);
  const x0 = await qtyOf(b, x);
  await recount(b, x, 10); // this device holds more copies of one card
  await b.evaluate(
    () =>
      new Promise<void>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const tx = q.result.transaction('decks', 'readwrite');
          tx.objectStore('decks').put({ profile: 1, name: 'Only On B', cards: [], updated: Date.now() });
          tx.oncomplete = () => ok();
        };
      }),
  );
  await openSync(a);
  await a.getByRole('button', { name: 'TURN ON SYNC' }).click();
  const code = (await a.locator('.synccode').innerText()).replace(/-/g, '');
  await b.goto('about:blank'); // a fresh load, as when the link is opened
  await b.goto('/#sync/' + code);
  await b.getByRole('button', { name: 'LINK THIS DEVICE' }).click();
  await expect(b.getByRole('button', { name: 'MERGE BOTH' })).toBeVisible({ timeout: 15_000 });
  // The same choice in the sync drawer, at phone width: three buttons that wrap inside the box, none cut off.
  await b.getByRole('button', { name: 'Close' }).first().click();
  await b.locator('.syncpill .sdot').click();
  const box = b.locator('.island-drawer .id-sync-conflict-box');
  // opening the drawer checks the cloud again; the box comes back once that check ends in the same question
  await expect(b.locator('.island-drawer .id-sync-status-title')).toHaveText('NEEDS RESOLUTION', { timeout: 15_000 });
  await expect(box).toBeVisible();
  await expect(async () => {
    const out = await box.evaluate((el) => {
      const e = el.getBoundingClientRect();
      return [...el.querySelectorAll('button')].filter((x) => { const r = x.getBoundingClientRect(); return r.left < e.left - 1 || r.right > e.right + 1; }).map((x) => x.textContent);
    });
    expect(out, 'buttons cut off at the side of the box').toEqual([]);
    expect(await box.getByRole('button').count()).toBe(3);
    await box.screenshot({ path: 'test-results/sync-merge-both-phone.png', timeout: 2000 });
  }).toPass();
  await box.getByRole('button', { name: 'MERGE BOTH' }).click();
  await expect(b.locator('.island-drawer .id-sync-msg-bar')).toContainText('Merged both');
  await expect.poll(() => b.evaluate(() => document.querySelector('.island-drawer .id-sync-status-title')?.textContent ?? '')).toContain('UP TO DATE');
  expect(await entries(b)).toBe(owned); // the same cards once, not twice
  expect(await qtyOf(b, x)).toBe(x0 + 10); // the larger count
  expect((await backups(b)).length).toBe(1);
  // the first device gets B's extra copies and B's deck
  await a.getByRole('button', { name: 'sync now' }).click();
  await expect.poll(() => qtyOf(a, x), { timeout: 15_000 }).toBe(x0 + 10);
  const decks = await a.evaluate(
    () =>
      new Promise<string[]>((ok) => {
        const q = indexedDB.open('collectionhub');
        q.onsuccess = () => {
          const g = q.result.transaction('decks').objectStore('decks').getAll();
          g.onsuccess = () => ok(g.result.map((d: { name: string }) => d.name).sort());
        };
      }),
  );
  expect(decks).toEqual(['Only On B', 'Tatyova Lands']);
  await ca.close();
  await cb.close();
});

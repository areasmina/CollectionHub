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

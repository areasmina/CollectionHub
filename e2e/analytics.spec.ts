import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Collection analytics (roadmap P2.5): what the binder is made of, and what it has been worth. */
const open = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await page.locator('.coll .ctab', { hasText: 'ANALYTICS' }).click();
  return page.locator('.apanel');
};

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('the ANALYTICS tab shows what the binder is made of', async ({ page }) => {
  const a = await open(page);
  await expect(a).toBeVisible();
  for (const h of ['WORTH OVER TIME', 'AT A GLANCE', 'IN YOUR DECKS', 'COLOURS', 'MANA CURVE', 'CARD TYPES', 'RARITY', 'BIGGEST SETS']) await expect(a.getByRole('heading', { name: new RegExp(h) })).toBeVisible();
  // the seeded binder: every mock card, the Lands bar the tallest, and the commander's colours present
  await expect(a.locator('.acard', { hasText: 'CARD TYPES' }).locator('.abar').first().locator('.alabel')).toHaveText('Lands');
  const colours = a.locator('.acard', { hasText: 'COLOURS' });
  await expect(colours.locator('.abar', { hasText: 'Green' })).toBeVisible();
  await expect(colours.locator('.abar', { hasText: 'Multicolour' })).toBeVisible();
  // no history until a day has been recorded, and the panel says so rather than drawing an empty chart
  await expect(a.locator('.anone')).toContainText('saved once a day');
  await fits(page, ['.apanel', '.apanel .abar']);
  // the tab is the only way in and out: CARDS brings the binder back, with no second close button inside the panel
  await expect(a.getByRole('button', { name: /close/i })).toHaveCount(0);
  await page.locator('.coll .ctab', { hasText: 'CARDS' }).click();
  await expect(a).toHaveCount(0);
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
});

test('Analytics draws the line once days have been recorded', async ({ page }) => {
  // The two saved days are counted back from today: the app drops snapshots older than two weeks (lib/pricewatch KEEP),
  // so fixed dates (this used to say Nov 9 and 10) stop working once they are more than 14 days old.
  const first = await page.evaluate(async () => {
    const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
    const days = [dayOf(Date.now() - 2 * 864e5), dayOf(Date.now() - 864e5)];
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const ids: string[] = await new Promise((ok) => {
      const r = db.transaction(['cards']).objectStore('cards').getAll();
      r.onsuccess = () => ok(r.result.map((c: any) => c.id));
    });
    const tx = db.transaction(['edhrec'], 'readwrite');
    for (const [day, mul] of [[days[0], 1], [days[1], 2]] as [string, number][])
      tx.objectStore('edhrec').put({ path: `pricesnap:${day}`, data: ids.map((id) => [id, mul, null]), at: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
    // the label as the panel writes it (views/Analytics.tsx day())
    return new Date(days[0] + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  });
  const a = await open(page);
  await expect(a.locator('.aline .apath')).toBeVisible();
  await expect(a.locator('.ahistory .areads .up')).toContainText(`since ${first}`); // today's prices are above both saved days
  await expect(a.locator('.ahistory .afoot')).toContainText('The first 2 days are estimated'); // the two snapshot days
  await expect(a.locator('.anone')).toHaveCount(0);
});

test('At a glance and rarity: the facts the stat tiles don’t already say', async ({ page }) => {
  const a = await open(page);
  const g = a.locator('.aglance');
  await expect(g.locator('.areads > div', { hasText: 'sets' }).locator('dd')).toHaveText('1'); // every mock card is from TST
  await expect(g.locator('.areads > div', { hasText: 'dearest copy' })).toContainText('Rhystic Study · foil'); // the seeded foil copy
  await expect(g.locator('.areads > div', { hasText: 'average copy' }).locator('dd')).toContainText('CA$');
  // cards, unique cards and worth are said once, by the tiles above, not again here
  await expect(g).not.toContainText(/unique|worth about/i);
  const r = a.locator('.acard', { hasText: 'RARITY' });
  const bar = (name: string) => r.locator('.abar').filter({ has: page.locator('.alabel', { hasText: new RegExp(`^${name}$`) }) });
  for (const name of ['Common', 'Uncommon', 'Rare', 'Mythic']) await expect(bar(name)).toBeVisible();
  await expect(bar('Mythic').locator('.avalue')).toContainText('CA$'); // each bar carries its worth // each bar carries its worth
  await fits(page, ['.apanel', '.apanel .areads', '.apanel .abar']);
});

test('Worth over time reaches back months from the daily worth log, with today, the change and the best day', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['edhrec'], 'readwrite');
    const days: [string, number][] = [['2026-06-01', 40], ['2026-08-15', 900], ['2026-10-01', 60]];
    for (const [day, usd] of days) tx.objectStore('edhrec').put({ path: `worthlog:1:${day}`, data: { usd }, at: Date.now() });
    tx.objectStore('edhrec').put({ path: 'worthlog:2:2026-01-01', data: { usd: 9999 }, at: Date.now() }); // another binder's
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  const a = await open(page);
  const h = a.locator('.ahistory');
  await expect(h.locator('h3 small')).toContainText(/since Jun 1/);
  await expect(h.locator('.areads > div', { hasText: 'best day' })).toContainText(/Aug 15/); // 900 is the high, above today's worth
  await expect(h.locator('.areads .up')).toContainText('since Jun 1'); // today is above the 40 it started at
  await expect(h).not.toContainText('9,999'); // the other binder's line stays out
  await expect(h.locator('.afoot')).not.toContainText('estimated'); // logged days need no estimate before them
  await fits(page, ['.apanel .ahistory', '.apanel .areads']);
});

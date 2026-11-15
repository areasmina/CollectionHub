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
  for (const h of ['WORTH OVER TIME', 'IN YOUR DECKS', 'COLOURS', 'MANA CURVE', 'CARD TYPES', 'BIGGEST SETS']) await expect(a.getByRole('heading', { name: new RegExp(h) })).toBeVisible();
  // the seeded binder: every mock card, the Lands bar the tallest, and the commander's colours present
  await expect(a.locator('.acard', { hasText: 'CARD TYPES' }).locator('.abar').first().locator('.alabel')).toHaveText('Lands');
  const colours = a.locator('.acard', { hasText: 'COLOURS' });
  await expect(colours.locator('.abar', { hasText: 'Green' })).toBeVisible();
  await expect(colours.locator('.abar', { hasText: 'Multicolour' })).toBeVisible();
  // no history until a day has been recorded, and the panel says so rather than drawing an empty chart
  await expect(a.locator('.anone')).toContainText('Prices are saved once a day');
  await fits(page, ['.apanel', '.apanel .abar']);
  // the tab is the only way in and out: CARDS brings the binder back, with no second close button inside the panel
  await expect(a.getByRole('button', { name: /close/i })).toHaveCount(0);
  await page.locator('.coll .ctab', { hasText: 'CARDS' }).click();
  await expect(a).toHaveCount(0);
  await expect(page.locator('.coll .ctile').first()).toBeVisible();
});

test('Analytics draws the line once days have been recorded', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const ids: string[] = await new Promise((ok) => {
      const r = db.transaction(['cards']).objectStore('cards').getAll();
      r.onsuccess = () => ok(r.result.map((c: any) => c.id));
    });
    const tx = db.transaction(['edhrec'], 'readwrite');
    for (const [day, mul] of [['2026-11-09', 1], ['2026-11-10', 2]] as [string, number][])
      tx.objectStore('edhrec').put({ path: `pricesnap:${day}`, data: ids.map((id) => [id, mul, null]), at: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  const a = await open(page);
  await expect(a.locator('.aline .apath')).toBeVisible();
  await expect(a.locator('.atrend.up')).toContainText('since Nov 9'); // prices doubled between the two days
  await expect(a.locator('.anone')).toHaveCount(0);
});

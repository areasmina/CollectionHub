import { expect, test } from '@playwright/test';
import { fits, mockWorld } from './mock';

/** A whole-collection file: big enough to be held aside from the text box, with Scryfall refusing part-way through. */
const N = 1500;
const idOf = (i: number) => `${i.toString(16).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(i).padStart(12, '0')}`;
const csv = ['Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency']
  .concat(Array.from({ length: N }, (_, i) => `"Test Card Number ${i}",tst,Test Set For Big Imports,${i + 1},normal,common,1,${i},${idOf(i)},0.25,false,false,near_mint,en,CAD`))
  .join('\n');

test('Import: a big collection file goes in in one go, even when Scryfall refuses requests on the way', async ({ page }) => {
  test.setTimeout(120_000);
  await mockWorld(page);
  let calls = 0;
  await page.route(/api\.scryfall\.com\/cards\/collection/, async (r) => {
    calls++;
    // the 3rd request is refused for going too fast, the 6th never arrives (as when the connection drops)
    if (calls === 3) return r.fulfill({ status: 429, headers: { 'Retry-After': '2', 'Access-Control-Expose-Headers': 'Retry-After' }, json: { object: 'error', status: 429 } });
    if (calls === 6) return r.abort('connectionreset');
    const ids = JSON.parse(r.request().postData() ?? '{}').identifiers ?? [];
    const data = ids
      .filter((x: any) => x.id)
      .map((x: any) => {
        const i = parseInt(String(x.id).slice(0, 8), 16);
        return { object: 'card', id: x.id, name: `Test Card Number ${i}`, type_line: 'Creature — Test', oracle_text: '', color_identity: [], mana_cost: '{1}', cmc: 1, set: 'tst', collector_number: String(i + 1), image_uris: { small: `https://cards.scryfall.io/small/front/0/0/${x.id}.jpg` }, prices: { usd: '0.25', usd_foil: '0.50' }, legalities: { commander: 'legal' } };
      });
    return r.fulfill({ json: { data, not_found: [] } });
  });
  await page.goto('/');
  await page.waitForSelector('.pillnav', { state: 'attached' });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const pop = page.locator('.importbox-pop');
  await expect(pop).toBeVisible();
  await pop.locator('input[type=file]').setInputFiles({ name: 'my-collection.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  // a big file is held aside (not poured into the text box) and says what it holds
  await expect(pop.locator('.ibig')).toContainText('my-collection.csv');
  await expect(pop.locator('.ibig')).toContainText('1,501 lines');
  await expect(pop.locator('textarea')).toHaveCount(0);
  await fits(page, ['.importbox-pop']);
  await pop.getByRole('button', { name: '+ ADD' }).click();
  // while Scryfall makes us wait, the screen says so and that it carries on by itself
  await expect(pop.locator('.pwait')).toBeVisible({ timeout: 30_000 });
  await fits(page, ['.importbox-pop']);
  // every card arrives: nothing is left "not looked up"
  await expect(pop.locator('.report')).toContainText('1,500 cards added', { timeout: 90_000 });
  await expect(pop.locator('.report .error')).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  expect(saved).toBe(N);
  // the exact printings were kept (not swapped for a by-name guess) after the dropped connection
  expect(calls).toBeGreaterThanOrEqual(N / 75 + 2);
});

import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Owner's notes (Nov 15): the deck strip's buttons and the saved deck's hero should "look and fit better". */
test('Deck strip: on phones the actions sit on a clean grid (TO BUY full row, BEST FOR MY CARDS beside FORGE)', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  // lose a few cards so the page has something TO BUY
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['entries'], 'readwrite');
    const st = tx.objectStore('entries');
    const all: any[] = await new Promise((ok) => { const r = st.getAll(); r.onsuccess = () => ok(r.result); });
    for (const e of all) if (['Rhystic Study', 'Lotus Cobra'].includes(e.name)) st.delete(e.id);
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await page.locator('.ccard').first().click();
  const buy = page.locator('.dstrip .tobuy');
  const best = page.locator('.dstrip .bestfit');
  const forge = page.locator('.dstrip .forge');
  await expect(buy).toContainText('TO BUY');
  await fits(page, ['.dstrip .dacts > *']);
  if (info.project.name !== 'phone') return;
  const [b, s, f, row] = await Promise.all([buy.boundingBox(), best.boundingBox(), forge.boundingBox(), page.locator('.dstrip .dacts').boundingBox()]);
  expect(Math.abs(b!.width - row!.width)).toBeLessThan(2); // TO BUY takes the whole row
  expect(Math.abs(s!.y - f!.y)).toBeLessThan(2); // BEST FOR MY CARDS and FORGE share the next row
  expect(s!.y).toBeGreaterThan(b!.y + b!.height - 1);
  expect(Math.abs(s!.width - f!.width)).toBeLessThan(2); // as equals
});

test('Saved deck hero: a long file-style name wraps by word beside the card, and ACTIVE sits under it, off the slash', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({ profile: 1, name: 'Obeka_B_Max_Power', commander: 'Tatyova, Benthic Druid', cards: [{ name: 'Tatyova, Benthic Druid', qty: 1 }, { name: 'Forest', qty: 40 }], updated: Date.now() + 1000 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dtile').filter({ has: page.getByText('Obeka_B_Max_Power', { exact: true }) }).locator('.dcard').click();
  const h1 = page.locator('.dhero .vname h1');
  await expect(h1).toHaveAttribute('aria-label', 'Obeka_B_Max_Power'); // read out as saved
  await fits(page, ['.dhero .vname h1', '.dhero .vname .dlight']);
  const [name, light, slash] = await Promise.all([h1.boundingBox(), page.locator('.dhero .vname .dlight').boundingBox(), page.locator('.dhero .vname .vslash').boundingBox()]);
  expect(light!.y).toBeGreaterThanOrEqual(name!.y + name!.height - 1); // under the name
  expect(slash!.y + slash!.height).toBeLessThanOrEqual(light!.y + 2); // the slash ends before the light
});

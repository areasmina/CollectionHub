import { expect, test, type Page } from '@playwright/test';
import { cards, fits, mockWorld, seed } from './mock';

/**
 * YOUR COPIES (hand of cards, step 1): a card picture in Collection opens every copy of that card, one card each, and
 * each copy changes on its own (finish, artwork, one more / fewer like it). Scryfall is a button inside. The total
 * number of copies only changes with − / +, and every change can be undone.
 */
const sol = cards.find((c) => c.name === 'Sol Ring')!;
const ALT = 'bbbbbbbb-1111-2222-3333-000000000777';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  // a second printing of Sol Ring, so one copy can change its artwork (registered last: it answers first)
  await page.route(/api\.scryfall\.com\/cards\/search/, (r) => {
    const u = new URL(r.request().url());
    if (u.searchParams.get('unique') !== 'prints') return r.fallback();
    const p = (id: string, set: string, setName: string, cn: string, usd: string) => ({
      object: 'card', id, name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', color_identity: [], mana_cost: '{1}', cmc: 1, rarity: 'uncommon',
      set, set_name: setName, collector_number: cn, image_uris: { small: `https://cards.scryfall.io/small/front/0/0/${id}.jpg` }, prices: { usd, usd_foil: usd }, legalities: { commander: 'legal' },
    });
    return r.fulfill({ json: { data: [p(sol.id, 'tst', 'Test Set', '1', '1.50'), p(ALT, 'alt', 'Alt Set', '7', '3.00')], has_more: false } });
  });
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
});

/** Sol Ring's binder rows, as saved: [set, foil, qty], sorted. */
const solRows = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const rows: any[] = await new Promise((ok) => (db.transaction('entries').objectStore('entries').getAll().onsuccess = (e: any) => ok(e.target.result)));
    return rows.filter((r) => r.name === 'Sol Ring').map((r) => [r.set, !!r.foil, r.qty]).sort();
  });

const open = async (page: Page) => {
  const tile = page.locator('.ctile', { hasText: 'Sol Ring' }).first();
  await tile.scrollIntoViewIfNeeded();
  await tile.locator('.timg img').click();
  const sheet = page.getByRole('dialog', { name: 'Your copies of Sol Ring' });
  await expect(sheet).toBeVisible();
  return sheet;
};

test('A card picture opens YOUR COPIES: one card per copy, Scryfall inside, fits the screen, closes with ✕ and Escape', async ({ page }, info) => {
  const sheet = await open(page);
  // the mock binder holds two copies of Sol Ring (one row, ×2)
  await expect(sheet.getByRole('option')).toHaveCount(2);
  await expect(sheet.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.locator('.yc-n')).toHaveText('2');
  await expect(sheet.getByRole('link', { name: /SCRYFALL/ })).toHaveAttribute('href', /scryfall\.com\/search/);
  await fits(page, ['.yourcopies', '.yourcopies .yc-acts .u-btn']);
  // every control is a full thumb target
  for (const b of await sheet.locator('.yc-acts .u-btn, .close, .yc-scry').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  // sacred card rule: the copies stand straight, not tilted
  const tilt = await sheet.locator('.yc-img').first().evaluate((el) => getComputedStyle(el).transform);
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(tilt);
  await page.screenshot({ path: `test-results/your-copies-${info.project.name}.png` });
  await sheet.getByRole('button', { name: 'Close your copies' }).click();
  await expect(sheet).toHaveCount(0);
  await open(page);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Your copies of Sol Ring' })).toHaveCount(0);
});

test('YOUR COPIES: one copy turns foil, the other stays; UNDO puts it back; copies never change', async ({ page }) => {
  const sheet = await open(page);
  expect(await solRows(page)).toEqual([['tst', false, 2]]);
  await sheet.getByRole('option').nth(1).click();
  await expect(sheet.locator('.yc-which')).toContainText('COPY 2 OF 2');
  await sheet.getByRole('button', { name: 'MAKE FOIL' }).click();
  await expect.poll(() => solRows(page)).toEqual([['tst', false, 1], ['tst', true, 1]]);
  // the chosen copy follows the change: it is the foil one now
  await expect(sheet.locator('.yc-which')).toContainText('foil');
  await expect(sheet.getByRole('button', { name: 'MAKE NON-FOIL' })).toBeVisible();
  await expect(sheet.locator('.yc-img.foil')).toHaveCount(1);
  await page.locator('.toast').getByRole('button', { name: 'UNDO' }).click();
  await expect.poll(() => solRows(page)).toEqual([['tst', false, 2]]);
});

test('YOUR COPIES: one more and one fewer like this copy, with UNDO', async ({ page }) => {
  const sheet = await open(page);
  await sheet.getByRole('button', { name: /One more like this/ }).click();
  await expect.poll(() => solRows(page)).toEqual([['tst', false, 3]]);
  await expect(sheet.getByRole('option')).toHaveCount(3);
  await sheet.getByRole('button', { name: /One fewer like this/ }).click();
  await expect.poll(() => solRows(page)).toEqual([['tst', false, 2]]);
  await page.locator('.toast').getByRole('button', { name: 'UNDO' }).click();
  await expect.poll(() => solRows(page)).toEqual([['tst', false, 3]]);
});

test('YOUR COPIES: CHANGE ARTWORK moves only the chosen copy to the new printing', async ({ page }) => {
  const sheet = await open(page);
  await sheet.getByRole('button', { name: /CHANGE ARTWORK/ }).click();
  const arts = sheet.getByRole('list', { name: 'Printings for this copy' });
  await expect(arts.getByRole('button')).toHaveCount(2);
  await expect(arts.getByRole('button', { pressed: true })).toHaveCount(1); // the printing this copy is now
  await arts.getByRole('button', { name: /Alt Set/ }).click();
  await expect.poll(() => solRows(page)).toEqual([['alt', false, 1], ['tst', false, 1]]);
  await expect(sheet.locator('.yc-which')).toContainText('ALT #7');
  await expect(sheet.getByRole('option')).toHaveCount(2);
});

test('YOUR COPIES: arrow keys move between copies', async ({ page }, info) => {
  test.skip(info.project.name === 'phone', 'keyboard check: computers');
  const sheet = await open(page);
  await sheet.getByRole('option').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(sheet.getByRole('option').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect(sheet.getByRole('option').nth(1)).toBeFocused();
  await page.keyboard.press('Home');
  await expect(sheet.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
});

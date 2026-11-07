import { expect, test } from '@playwright/test';
import { addSignet, edhJson, mockWorld, opts, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const openDeck = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
};

test('Forge on a saved deck: focus mode, sorts, theme chips, own-card search, tap then tap to swap, undo', async ({ page }, info) => {
  await addSignet(page);
  await openDeck(page);
  const top = page.locator('.forgetop');
  await expect(top).toContainText('Tatyova Lands');
  await expect(page.locator('.pillnav')).toBeHidden(); // the rest of the app steps back
  const sugg = page.locator('.fsugg');
  await expect(sugg.getByRole('radio')).toHaveText(['OUR PICK', 'EDHREC LIFT', 'POPULAR']);
  await expect(page.locator('.fmeters')).toBeVisible();
  // the suggestion: an owned card EDHREC plays here, with its reasons
  const row = sugg.locator('.frows li', { hasText: 'Arcane Signet' });
  await expect(row).toHaveClass(/own/);
  await expect(row.locator('.whys')).toContainText('owned');
  // phones: pull the sheet up to see the filters
  if (await sugg.locator('.fgrab').isVisible()) await sugg.locator('.fgrab').click();
  // themes are EDHREC's tags read as rules-text tests: Landfall filters the list to cards whose text fits
  await sugg.getByRole('button', { name: '#landfall' }).click();
  await expect(sugg.getByRole('button', { name: '#landfall' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toHaveCount(0);
  await sugg.getByRole('button', { name: '#landfall' }).click();
  await expect(row).toHaveCount(1);
  // sorts switch
  await sugg.getByRole('radio', { name: 'EDHREC LIFT' }).click();
  await expect(sugg.getByRole('radio', { name: 'EDHREC LIFT' })).toHaveAttribute('aria-checked', 'true');
  // search covers your own cards' text
  await sugg.getByRole('searchbox').fill('signet');
  await expect(sugg.locator('.frows li')).toHaveCount(1);
  await sugg.getByRole('searchbox').fill('');
  await page.screenshot({ path: `test-results/forge-deck-${info.project.name}.png` });
  // tap the suggestion, then tap a deck card: swapped, with UNDO in the Forge bar
  await row.locator('.frow').click();
  await expect(sugg.locator('.fplace')).toContainText('Arcane Signet');
  await page.locator('.lists [data-card="Sol Ring"]').first().click();
  await expect(page.locator('.toast')).toContainText('Swapped Sol Ring for Arcane Signet');
  await expect(page.locator('.lists [data-card="Arcane Signet"]')).toHaveCount(1);
  await top.locator('.fundo').click();
  await expect(page.locator('.lists [data-card="Sol Ring"]')).toHaveCount(1);
  // ✕ LEAVE goes back to the decks, and the nav comes back
  await top.locator('.fleave').click();
  await expect(page.locator('.pillnav')).toBeVisible();
});

test('Forge on the commander page: the first swap opens it, with SUGGESTIONS and TO BUY panes', async ({ page }, info) => {
  await addSignet(page);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
  await expect(page.locator('.forgetop')).toContainText('1 swap');
  const sugg = page.locator('.fsugg');
  await expect(sugg.getByRole('tab', { name: /SUGGESTIONS/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.fmeters')).toBeVisible();
  await page.screenshot({ path: `test-results/forge-cmdr-${info.project.name}.png` });
  await sugg.getByRole('tab', { name: 'TO BUY' }).click();
  await expect(sugg.locator('.fbuy .receipt')).toBeVisible();
  // undo the swap from the Forge bar
  await page.locator('.forgetop .fundo').click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
});

test('Pins drive EDHREC: suggestions come from decks with your 📌 cards and without your 💀 ones', async ({ page }) => {
  const asked: string[] = [];
  await page.route(/json\.edhrec\.com\/pages\/commanders\/.*\?f=/, (r) => {
    asked.push(decodeURIComponent(r.request().url()));
    return r.fulfill({ json: edhJson(312) });
  });
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).getByRole('button', { name: /NEVER USE/ }).click();
  await expect(page.locator('.dstrip .dstatus')).toContainText('suggestions from 312 EDHREC decks that fit your pins');
  expect(asked.some((u) => u.includes('f=out=Sol Ring'))).toBe(true);
});

test('ONLY: price bands and Game Changers filter the deck', async ({ page }) => {
  await openDeck(page);
  const o = await opts(page);
  await o.locator('select:has(option[value="over20"])').selectOption('over20');
  await expect(page.locator('.lists [data-card]')).toHaveCount(1);
  await expect(page.locator('.lists [data-card="Rhystic Study"]')).toHaveCount(1);
  await expect(page.locator('.lists > .tbar .fnow')).toContainText('CA$20 AND UP');
  await o.locator('select:has(option[value="over20"])').selectOption('all');
  await expect(page.locator('.lists [data-card="Sol Ring"]')).toHaveCount(1);
});

test('Phones start on the compact list; grid and list stay one tap away', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const narrow = info.project.name === 'phone';
  await expect(page.locator('ul.zcompact')).toHaveCount(narrow ? await page.locator('details.cat').count() : 0);
  const o = await opts(page);
  await o.getByRole('button', { name: 'Compact list' }).click();
  await expect(page.locator('ul.zcompact').first()).toBeVisible();
  await expect(page.locator('ul.zcompact li.zrow .thumb').first()).toBeHidden();
  await (await opts(page)).getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.zcompact')).toHaveCount(0);
});

test('TO BUY groups by EDHREC play rate, cheapest first, with subtotals', async ({ page }, info) => {
  // give away Rhystic Study and Counterspell, so the deck has cards to buy
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction('entries', 'readwrite');
    const st = tx.objectStore('entries');
    st.openCursor().onsuccess = (e: any) => {
      const c = e.target.result;
      if (!c) return;
      if (['Rhystic Study', 'Counterspell'].includes(c.value.name)) c.delete();
      c.continue();
    };
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await page.locator('.ccard').first().click();
  await expect(page.locator('.dstrip .tobuy')).toContainText('TO BUY 2');
  await page.locator('.dstrip .tobuy').click();
  const r = page.getByRole('dialog', { name: 'To buy' }).locator('aside.receipt');
  // EDHREC plays both in 25% of decks: one band, cheapest first (Counterspell before Rhystic Study)
  await expect(r.locator('.rgroup .rgh').first()).toContainText('IN 25–50% OF DECKS');
  await expect(r.locator('.rgroup li .nm')).toHaveText([/Counterspell/, /Rhystic Study/]);
  await page.screenshot({ path: `test-results/tobuy-groups-${info.project.name}.png` });
});

test('Compact list: names stay readable on a phone', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:view', 'compact'));
  await page.reload();
  await page.locator('.ccard').first().click();
  const nm = page.locator('ul.zcompact li.zrow .nm', { hasText: 'Lotus Cobra' }).first();
  await nm.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/compact-${info.project.name}.png` });
  expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true); // not cut off
  await page.screenshot({ path: `test-results/compact-${info.project.name}.png` });
});

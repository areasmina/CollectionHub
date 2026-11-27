import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/**
 * My Decks filters, one home (Guillermo, Nov 26: "clean like ManaBox"). Search, sort, FILTER, the status chips and SIZE
 * sit on the page bar; FILTER opens a sheet with the tags and folders. The Dynamic Island carries no filters anymore.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  // a second deck with its own tag, so a tag can narrow the list
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({ profile: 1, name: 'Cobra Ramp', commander: 'Tatyova, Benthic Druid', tags: ['Budget'], cards: [{ name: 'Sol Ring', qty: 1 }], updated: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
    localStorage.setItem('ch:tab', 'decks');
  });
  await page.reload();
  await expect(page.locator('.decktoolbar')).toBeVisible();
});

test('My Decks: FILTER sits beside search and sort; its sheet holds tags and folders; a tag narrows the decks with a removable chip', async ({ page }, info) => {
  // the Island has no filter button on any page
  await expect(page.locator('.pillnav .island-filter-btn')).toHaveCount(0);
  await expect(page.locator('.island-filter-drawer')).toHaveCount(0);

  const row = page.locator('.decktoolbar .dsearchrow');
  const btn = row.getByRole('button', { name: 'Filter decks' });
  await expect(btn).toBeVisible();
  await fits(page, ['.decktoolbar .dsearchrow', '.decktoolbar .dsearchrow > *']);
  const b = (await btn.boundingBox())!;
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.width).toBeGreaterThanOrEqual(44);
  // status chips and SIZE stay on the page bar
  await expect(page.locator('.decktoolbar .dstatuspick .u-chip')).toHaveCount(4);

  await btn.click();
  const sheet = page.getByRole('dialog', { name: 'Filter decks' });
  await expect(sheet).toBeVisible();
  await fits(page, ['.dfsheet']);
  await expect(sheet.getByText('Tags', { exact: true })).toBeVisible();
  await expect(sheet.getByLabel('Deck folders')).toBeVisible();
  await page.screenshot({ path: `test-results/deck-filters-${info.project.name}.png` });

  await expect(page.locator('.dgrid > li')).toHaveCount(2);
  await sheet.getByRole('button', { name: '#Budget' }).click();
  await expect(sheet.getByRole('button', { name: '#Budget' })).toHaveAttribute('aria-pressed', 'true');
  await sheet.getByRole('button', { name: 'DONE' }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator('.dgrid > li')).toHaveCount(1);
  await expect(page.locator('.dgrid > li')).toContainText(/COBRA RAMP/i);
  await expect(page.getByRole('button', { name: 'Filter decks, 1 active' })).toBeVisible();

  // the chip under the bar takes the tag off again
  await page.locator('.dactive-chips').getByRole('button', { name: /#Budget/ }).click();
  await expect(page.locator('.dgrid > li')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Filter decks' })).toBeVisible();
});

test('My Decks FILTER sheet closes with Escape and with the backdrop', async ({ page }) => {
  await page.getByRole('button', { name: 'Filter decks' }).click();
  await expect(page.getByRole('dialog', { name: 'Filter decks' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Filter decks' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Filter decks' }).click();
  await page.locator('.fbackdrop').click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole('dialog', { name: 'Filter decks' })).toHaveCount(0);
});

test('Phone: nothing under 44px in the My Decks FILTER sheet', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', '44px is the touch rule');
  await page.getByRole('button', { name: 'Filter decks' }).click();
  await expect(page.locator('.dfsheet')).toBeVisible();
  await page.waitForTimeout(500);
  const small = await page.locator('.dfsheet').evaluate((root) => {
    const out: string[] = [];
    for (const e of root.querySelectorAll('button, input, label')) {
      const r = e.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${(e.textContent || '').trim().slice(0, 16)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
  expect(small).toEqual([]);
});

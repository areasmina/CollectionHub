import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('TO BUY receipt: total cost only at the top, single prices on items, heartfelt thank-you at bottom', async ({ page }, info) => {
  // Give away Rhystic Study and Counterspell, so the deck has cards to buy
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

  // Open TO BUY receipt
  const toBuyBtn = page.locator('.dstrip .tobuy');
  await expect(toBuyBtn).toBeVisible();
  await toBuyBtn.click();

  const receipt = page.locator('aside.receipt').first();
  await expect(receipt).toBeVisible();

  // 1. Verify total cost is displayed at the top
  const topTotal = receipt.locator('.rtop-total');
  await expect(topTotal).toBeVisible();
  await expect(topTotal).toContainText('TO BUY');
  await expect(topTotal).toContainText('CA$');

  // 2. Verify single card prices are visible on items
  const priceLinks = receipt.locator('li .pr a');
  await expect(priceLinks.first()).toBeVisible();
  const priceCount = await priceLinks.count();
  expect(priceCount).toBeGreaterThan(0);

  // 3. Verify total is NOT displayed at the bottom of TO BUY
  const bottomTotals = receipt.locator('.total');
  await expect(bottomTotals).toHaveCount(0);

  // 4. Verify heartfelt thank-you message at the bottom
  const heartfelt = receipt.locator('.thanks.heartfelt');
  await expect(heartfelt).toBeVisible();
  await expect(heartfelt.locator('.thanks-lead')).toContainText('THANK YOU FOR BUILDING WITH WHAT YOU OWN');
  await expect(heartfelt.locator('.thanks-body')).toContainText('reward');
  await expect(heartfelt.locator('.thanks-body')).toContainText('sleeves');

  // 5. Screenshot verification
  await page.waitForTimeout(400);
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/receipt-heartfelt-${info.project.name}.png` });
});

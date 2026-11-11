import { expect, test } from '@playwright/test';
import { fits, mockWorld } from './mock';

test('First visit: an empty binder offers a sample collection that only fills the import box', async ({ page }) => {
  await mockWorld(page);
  await page.goto('/');
  await page.waitForSelector('.pillnav', { state: 'attached' });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  // the import pop-up opens by itself on an empty binder
  const pop = page.locator('.importbox-pop');
  await expect(pop).toBeVisible();
  await expect(pop.getByRole('button', { name: '+ ADD' })).toBeDisabled();
  await pop.getByRole('button', { name: 'TRY A SAMPLE COLLECTION' }).click();
  await expect(pop.locator('textarea')).toHaveValue(/1 Sol Ring/);
  await expect(pop.getByRole('button', { name: '+ ADD' })).toBeEnabled();
  // the offer steps aside once there is a list in the box; nothing was saved yet
  await expect(pop.getByRole('button', { name: 'TRY A SAMPLE COLLECTION' })).toHaveCount(0);
  const saved = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  expect(saved).toBe(0);
  await fits(page, ['.importbox-pop']);
});

import { expect, test, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * BACKUPS in the sync drawer (Phase 5D): this device's binders and decks from before each of the last 5 pulls or
 * merges, each restorable, plus DOWNLOAD BACKUP (everything on this device as a file). Runs at phone, tablet, desktop.
 */
const count = (page: Page) =>
  page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
  });
/** Puts backups in this device's store as sync would before a pull: a copy of the binders with `keep` cards. */
const addBackups = (page: Page, keeps: number[]) =>
  page.evaluate(async (keeps) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const all = (store: string) => new Promise<any[]>((ok) => (db.transaction(store).objectStore(store).getAll().onsuccess = (e: any) => ok(e.target.result)));
    const [profiles, entries, decks] = await Promise.all([all('profiles'), all('entries'), all('decks')]);
    const tx = db.transaction('edhrec', 'readwrite');
    keeps.forEach((keep, i) => {
      const at = Date.now() - (i + 1) * 3_600_000;
      tx.objectStore('edhrec').put({ path: `backup:${String(at).padStart(15, '0')}`, at, data: { profiles, entries: entries.slice(0, keep), decks, why: 'pull' } });
    });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, keeps);

async function openDrawer(page: Page) {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await page.locator('.syncpill .sdot').click();
  const box = page.locator('.island-drawer .id-sync-backups');
  await expect(box).toBeVisible();
  return box;
}

test('Backups: DOWNLOAD BACKUP saves every card and deck on this device as a file', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  const box = await openDrawer(page);
  await expect(box).toContainText('none yet');
  const [file] = await Promise.all([page.waitForEvent('download'), box.getByRole('button', { name: 'DOWNLOAD BACKUP' }).click()]);
  expect(file.suggestedFilename()).toMatch(/^collectionhub-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const body = JSON.parse(await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString('utf8')));
  expect(body.app).toBe('collectionhub');
  expect(body.entries).toHaveLength(await count(page));
  expect(Array.isArray(body.decks) && Array.isArray(body.profiles)).toBe(true);
  await expect(box.getByRole('status')).toContainText('Keep it somewhere safe');
});

test('Backups: each backup is listed and restorable; the copy replaced becomes a backup too', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  const n = await count(page);
  expect(n).toBeGreaterThan(2);
  await addBackups(page, [2, 1]);
  const box = await openDrawer(page);
  const rows = box.locator('.id-sync-backup-list li');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('2 cards');
  // each row fits the drawer: its RESTORE stays inside, nothing runs off the side
  await box.scrollIntoViewIfNeeded();
  for (const r of await rows.all()) {
    const [li, btn] = [await r.boundingBox(), await r.getByRole('button', { name: 'RESTORE' }).boundingBox()];
    expect(btn!.x + btn!.width).toBeLessThanOrEqual(li!.x + li!.width + 1);
  }
  page.once('dialog', (d) => d.accept());
  await rows.first().getByRole('button', { name: 'RESTORE' }).click();
  await expect(box.getByRole('status')).toContainText('Restored: 2 cards');
  expect(await count(page)).toBe(2);
  // what was here before the restore is now the newest backup: the restore can be undone
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText(`${n} cards`);
  await expect(rows.first()).toContainText('before a restore');
  await page.screenshot({ path: `test-results/sync-backups-${info.project.name}.png` });
});

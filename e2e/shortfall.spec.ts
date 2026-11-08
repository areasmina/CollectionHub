import { expect, test } from '@playwright/test';
import { cards, mockWorld, seed } from './mock';

test('Copies Shortfall Zine Popover in Forge and Decks overview', async ({ page }) => {
  await mockWorld(page);
  await seed(page);

  // Clear entries and re-insert exactly 1 copy of each card so shortfalls are triggered
  await page.evaluate(async (cs) => {
    const db: IDBDatabase = await new Promise((ok, no) => {
      const q = indexedDB.open('collectionhub');
      q.onsuccess = () => ok(q.result);
      q.onerror = no;
    });
    const tx = db.transaction(['entries', 'decks', 'cards'], 'readwrite');
    tx.objectStore('entries').clear();
    cs.forEach((c, i) => {
      tx.objectStore('entries').put({ profile: 1, cardId: c.id, name: c.name, qty: 1, set: 'tst', cn: String(i) });
    });
    // Extra deck 1
    tx.objectStore('decks').put({
      profile: 1,
      name: 'Neku Wheels',
      commander: 'Nekusar, the Mindrazer',
      cards: cs.map((c) => ({ name: c.name, qty: 1 })),
      updated: Date.now()
    });
    // Extra deck 2
    tx.objectStore('decks').put({
      profile: 1,
      name: 'Doctor Doom, King of Latveria',
      commander: 'Doctor Doom',
      cards: cs.map((c) => ({ name: c.name, qty: 1 })),
      updated: Date.now()
    });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, cards);

  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();

  // Click on "Tatyova Lands" to open the Forge
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();

  // In Forge header, the shortfall button should be visible
  const shortBtn = page.locator('.shortin-btn');
  await expect(shortBtn).toBeVisible();
  await expect(shortBtn).toContainText('SHORT');

  // 1. Desktop Test
  await page.setViewportSize({ width: 1280, height: 800 });
  await shortBtn.click();

  const pop = page.locator('.shortpop');
  await expect(pop).toBeVisible();
  await expect(pop.locator('.shortpop-tape-title')).toContainText('▲ COPIES SHORTFALL');

  // Verify search bar is visible since items > 2
  const searchInput = pop.locator('.shortpop-search-bar input');
  await expect(searchInput).toBeVisible();

  // Capture desktop screenshot with popover open
  await page.screenshot({
    path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/shortfall-popover-desktop.png'
  });

  // Test filter
  await searchInput.fill('Sol Ring');
  await expect(pop.locator('.shortitem')).toHaveCount(1);
  await expect(pop.locator('.shortitem-name')).toContainText('Sol Ring');
  await searchInput.fill('');

  // Close popover via close button
  await pop.locator('.shortpop-close-btn').click();
  await expect(pop).toBeHidden();

  // 2. Mobile Test
  await page.setViewportSize({ width: 400, height: 750 });
  await shortBtn.click();
  await expect(pop).toBeVisible();

  // Capture mobile screenshot with centered modal
  await page.screenshot({
    path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/shortfall-popover-mobile.png'
  });

  // Close via backdrop tap
  await page.locator('.shortback').click({ position: { x: 10, y: 10 } });
  await expect(pop).toBeHidden();
});

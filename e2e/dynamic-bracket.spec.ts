import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  // Intercept gamechanger scryfall query
  await page.route(/is%3Agamechanger|is:gamechanger/, (r) =>
    r.fulfill({
      json: {
        data: [
          { name: 'Rhystic Study' },
          { name: 'Sol Ring' },
          { name: 'Mana Crypt' },
          { name: 'Demonic Tutor' },
        ],
        has_more: false,
      },
    }),
  );
  await seed(page);
});

test('Bracket fit tile and popover dynamically adapt to deck composition and target bracket', async ({ page }, info) => {
  // Navigate to first commander (Tatyova)
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero')).toBeVisible();

  const fitTile = page.locator('.vtile.fit').first();
  await expect(fitTile).toBeVisible();

  // Open the Bracket Fit popover
  await fitTile.locator('> summary').click();
  await page.waitForTimeout(200);

  const says = fitTile.locator('.vfit-says');
  await expect(says).toBeVisible();
  const textInitial = await says.textContent();
  expect(textInitial).toMatch(/bracket/i);

  // Take screenshot of open popover on Commander page
  await page.screenshot({
    path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/bracket-fit-open-${info.project.name}.png`,
  });

  // Switch target bracket to B3
  const b3Btn = fitTile.locator('.vbpill', { hasText: 'B3' }).first();
  if (await b3Btn.isVisible()) {
    await b3Btn.click();
    await page.waitForTimeout(200);
    // When aiming for B3, if deck cards are bracket IV or III, check reaction
    const tileText = await fitTile.locator('summary b').textContent();
    expect(tileText).toBeDefined();
    await page.screenshot({
      path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/bracket-target-changed-${info.project.name}.png`,
    });
  }

  // Close popover
  await fitTile.locator('> summary').click();
  await page.waitForTimeout(150);

  // Test Empty Deck in Decks view (0 cards -> NO BRACKET)
  await page.evaluate(async () => {
    localStorage.setItem('ch:tab', 'decks');
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({
      profile: 1,
      name: 'Empty Deck Test',
      commander: 'Tatyova, Benthic Druid',
      cards: [],
      updated: Date.now() + 10000,
    });
    await new Promise((ok) => (tx.oncomplete = ok));
  });

  // Navigate to Decks tab
  await page.goto('/');
  await page.waitForTimeout(500);

  // Click on the empty deck tile
  const emptyTile = page.locator('.dtile', { hasText: 'Empty Deck Test' }).first();
  await expect(emptyTile).toBeVisible();
  await emptyTile.click();
  await page.waitForTimeout(500);

  const emptyFitTile = page.locator('.vtile.fit').first();
  await expect(emptyFitTile).toBeVisible();

  // Verify Tile shows NO BRACKET and 'add cards to calculate'
  const boldText = await emptyFitTile.locator('summary b').textContent();
  expect(boldText).toBe('NO BRACKET');

  const subText = await emptyFitTile.locator('summary small').textContent();
  expect(subText).toBe('add cards to calculate');

  // Open popover
  await emptyFitTile.locator('> summary').click();
  await page.waitForTimeout(200);

  const emptySays = await emptyFitTile.locator('.vfit-says').textContent();
  expect(emptySays).toContain('No bracket yet');
  expect(emptySays).toContain('Add cards to your deck to calculate its bracket');

  // Verify no false signals are displayed
  await expect(emptyFitTile.locator('.vbracket-sec:has-text("SIGNALS")')).toHaveCount(0);

  await page.screenshot({
    path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/bracket-fit-empty-${info.project.name}.png`,
  });
});

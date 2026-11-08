import { expect, test } from '@playwright/test';
import { cards, mockWorld, seed } from './mock';

test('Detailed list view composition and placing in Forge', async ({ page }) => {
  await mockWorld(page);
  await seed(page);

  // Set view to 'list' (detailed list view)
  await page.evaluate(() => {
    localStorage.setItem('ch:tab', 'decks');
    localStorage.setItem('ch:view', 'list');
  });
  await page.reload();

  // Open "Tatyova Lands" to enter Forge
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();

  // Wait for the detailed list to render
  const listRows = page.locator('ul.zlist:not(.zcompact) > li.zrow');
  await expect(listRows.first()).toBeVisible();

  // Verify Mana pips are rendered (not raw curly braces)
  const pips = page.locator('.manapips .manapip');
  await expect(pips.first()).toBeVisible();

  // Verify type line is rendered
  const typeLine = page.locator('.zrow-type');
  await expect(typeLine.first()).toBeVisible();

  // Verify horizontal actions
  const acts = page.locator('.zrow .acts');
  await expect(acts.first()).toBeVisible();

  // Capture desktop screenshot of the overhauled list view
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({
    path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/detailed-list-overhaul-desktop.png'
  });

  // Capture mobile screenshot
  await page.setViewportSize({ width: 400, height: 750 });
  await page.screenshot({
    path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/detailed-list-overhaul-mobile.png'
  });
});

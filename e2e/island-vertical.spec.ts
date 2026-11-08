import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

test('Dynamic island docked to left edge is oriented vertically', async ({ page }) => {
  await mockWorld(page);
  await seed(page);

  // Set dock to left in localStorage
  await page.evaluate(() => {
    localStorage.setItem('ch:island_dock', 'left');
    localStorage.setItem('ch:tab', 'discover');
  });
  await page.reload();

  const nav = page.locator('.pillnav.dock-left');
  await expect(nav).toBeVisible();

  // Verify vertical orientation of buttons
  const discoverBtn = nav.locator('.pill button', { hasText: 'DISCOVER' });
  const decksBtn = nav.locator('.pill button', { hasText: 'DECKS' });
  const collectionBtn = nav.locator('.pill button', { hasText: 'COLLECTION' });
  const syncBtn = nav.locator('.syncpill');

  await expect(discoverBtn).toBeVisible();
  await expect(decksBtn).toBeVisible();
  await expect(collectionBtn).toBeVisible();
  await expect(syncBtn).toBeVisible();

  const discoverBox = await discoverBtn.boundingBox();
  const decksBox = await decksBtn.boundingBox();
  const collectionBox = await collectionBtn.boundingBox();
  const syncBox = await syncBtn.boundingBox();

  expect(discoverBox).toBeTruthy();
  expect(decksBox).toBeTruthy();
  expect(collectionBox).toBeTruthy();
  expect(syncBox).toBeTruthy();

  // DISCOVER should be above DECKS, DECKS above COLLECTION, COLLECTION above SYNC
  expect(discoverBox!.y + discoverBox!.height).toBeLessThanOrEqual(decksBox!.y + 2);
  expect(decksBox!.y + decksBox!.height).toBeLessThanOrEqual(collectionBox!.y + 2);
  expect(collectionBox!.y + collectionBox!.height).toBeLessThanOrEqual(syncBox!.y + 2);

  // Buttons should be horizontally aligned in a column (similar X coordinates)
  expect(Math.abs(discoverBox!.x - decksBox!.x)).toBeLessThan(5);
  expect(Math.abs(decksBox!.x - collectionBox!.x)).toBeLessThan(5);

  // Capture screenshot of vertical left-docked island
  if ((page.viewportSize()?.width ?? 1280) >= 1000) {
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/island-dock-left-desktop.png'
    });
  } else if ((page.viewportSize()?.width ?? 1280) <= 500) {
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/island-dock-left-mobile.png'
    });
  }

  // Switch to right dock and verify vertical orientation
  await page.evaluate(() => {
    localStorage.setItem('ch:island_dock', 'right');
  });
  await page.reload();

  const navRight = page.locator('.pillnav.dock-right');
  await expect(navRight).toBeVisible();

  const discRight = navRight.locator('.pill button', { hasText: 'DISCOVER' });
  const decksRight = navRight.locator('.pill button', { hasText: 'DECKS' });

  const discRightBox = await discRight.boundingBox();
  const decksRightBox = await decksRight.boundingBox();

  expect(discRightBox!.y + discRightBox!.height).toBeLessThanOrEqual(decksRightBox!.y + 2);

  if ((page.viewportSize()?.width ?? 1280) >= 1000) {
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/island-dock-right-desktop.png'
    });
  }
});

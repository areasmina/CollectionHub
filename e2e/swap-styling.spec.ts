import { expect, test } from '@playwright/test';
import { addSignet, fits, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Swap window: dark neo-brutalist styling, clean composition, refined undo banner and responsive layout', async ({ page }, info) => {
  await addSignet(page);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero')).toBeVisible();

  // 1. Open swap dialog for Sol Ring
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await expect(note).toBeVisible();

  // Verify modal fits within viewport
  await fits(page, ['.swapnote']);

  // Check background color of the swapnote modal (should be dark carbon, not white)
  const bg = await note.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  // #141418 corresponds to rgb(20, 20, 24)
  expect(bg).toMatch(/rgb\(20,\s*20,\s*24\)|rgba\(20,\s*20,\s*24/);

  // Check suggestion item exists and has clean dark styling
  const pickItem = note.locator('.picks button', { hasText: 'Arcane Signet' }).first();
  await expect(pickItem).toBeVisible();

  // Check reason badges are not stark white
  const whys = pickItem.locator('.whys > span');
  await expect(whys.first()).toBeVisible();
  const badgeBg = await whys.first().evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(badgeBg).not.toBe('rgb(255, 255, 255)');

  // Take screenshot of standard swap window
  await page.screenshot({
    path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/swapnote-dark-specimen-${info.project.name}.png`,
  });

  // 2. Perform the swap to Arcane Signet
  await pickItem.click();
  await expect(page.locator('.swapmark', { hasText: '↔ for Sol Ring' })).toBeVisible();

  // 3. Open swap modal on the swapped card to verify the elegant UNDO banner
  await page.getByRole('button', { name: 'Swap Arcane Signet (in place of Sol Ring)' }).click();
  const swappedNote = page.getByRole('dialog', { name: 'Swap Arcane Signet' });
  await expect(swappedNote).toBeVisible();

  const undoBtn = swappedNote.locator('.undo');
  await expect(undoBtn).toBeVisible();
  await expect(undoBtn).toContainText('↺ UNDO');
  await expect(undoBtn).toContainText('back to Sol Ring');

  // Verify undo button is NOT a jarring solid bright yellow block (rgb(255, 212, 0))
  const undoBg = await undoBtn.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(undoBg).not.toBe('rgb(255, 212, 0)');

  // Capture screenshot showing the elegant UNDO banner, left specimen, and right suggestions
  await page.screenshot({
    path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/swapnote-swapped-undo-${info.project.name}.png`,
  });

  // Verify Undo works
  await undoBtn.click();
  await expect(page.locator('.swapmark', { hasText: 'for Sol Ring' })).toHaveCount(0);
});

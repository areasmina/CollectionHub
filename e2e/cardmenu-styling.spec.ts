import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Card context menu: elevated zine aesthetic, zero emojis, clean alignment', async ({ page }, info) => {
  await addSignet(page);
  await page.locator('.ccard').first().click();

  // Wait for hero commander card
  const cmdrCard = page.locator('.vcard').first();
  await expect(cmdrCard).toBeVisible();

  // Open context menu on commander card or a deck card
  const cardMenuBtn = page.locator('.vcard button, .vcard, [data-card]').first();
  await cardMenuBtn.click({ button: 'right' });

  // If right click didn't open menu (some elements have explicit ⋮ button or tap), check if .cardmenu is visible
  let menu = page.locator('.cardmenu');
  if (!(await menu.isVisible())) {
    // Click card menu button (tap for options or ⋮)
    const optBtn = page.locator('.vcard .cmdr-opt-btn, .vcard [aria-label*="options"], .tap-opts, button:has-text("tap for options")').first();
    if (await optBtn.isVisible()) {
      await optBtn.click();
    } else {
      // Click on a grid card
      const c = page.locator('[data-card]').first();
      await c.click({ button: 'right' });
    }
  }

  await expect(menu).toBeVisible();

  // 1. Strict emoji check: verify zero emojis exist in the card menu
  const menuText = await menu.innerText();
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = (menuText.match(emojiRegex) || []).filter(
    (m) => !['→', '←', '↑', '↓', '↗', '↘', '↔', '▲', '▼', '◄', '▸', '✓', '✕', '↺', '↻'].includes(m)
  );
  expect(emojis).toEqual([]);

  // 2. Verify "CHANGE ARTWORK" has NO palette emoji
  const artBtn = menu.locator('button:has-text("CHANGE ARTWORK")');
  if (await artBtn.isVisible()) {
    const artText = await artBtn.innerText();
    expect(artText).not.toContain('🎨');
    expect(artText).toContain('CHANGE ARTWORK');
  }

  // 3. Verify clean typography, dark specimen background, and zero tilt
  const header = menu.locator('.mh');
  await expect(header).toBeVisible();
  const fontSize = await header.evaluate((el) => window.getComputedStyle(el).fontSize);
  expect(parseInt(fontSize, 10)).toBeGreaterThanOrEqual(18);

  const menuBg = await menu.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(menuBg).toBe('rgb(20, 20, 24)');

  const tapeVisible = await menu.locator('.tape').isVisible().catch(() => false);
  expect(tapeVisible).toBe(false);

  // 4. Capture screenshot
  await page.waitForTimeout(300);
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/cardmenu-dark-no-emojis-${info.project.name}.png` });
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/cardmenu-zine-${info.project.name}.png` });
});

test('Deck context menu: unified dark specimen styling, zero emojis', async ({ page }, info) => {
  await addSignet(page);
  // Navigate to DECKS
  await page.locator('.pillnav .pill button', { hasText: 'DECKS' }).first().click();
  await page.waitForTimeout(300);

  // Find a deck card in the grid
  const dcard = page.locator('.dtile .dcard').first();
  await dcard.scrollIntoViewIfNeeded();
  await expect(dcard).toBeVisible();

  // Right-click to open deck menu
  await dcard.click({ button: 'right' });

  const deckMenu = page.locator('.cardmenu.deckmenu');
  await expect(deckMenu).toBeVisible();

  // 1. Strict emoji check: verify zero emojis exist in the deck menu
  const menuText = await deckMenu.innerText();
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojis = (menuText.match(emojiRegex) || []).filter(
    (m) => !['→', '←', '↑', '↓', '↗', '↘', '↔', '▲', '▼', '◄', '▸', '✓', '✕', '↺', '↻'].includes(m)
  );
  expect(emojis).toEqual([]);

  // 2. Verify dark specimen background
  const menuBg = await deckMenu.evaluate((el) => window.getComputedStyle(el).backgroundColor);
  expect(menuBg).toBe('rgb(20, 20, 24)');

  // 3. Verify tape is not visible
  const tapeVisible = await deckMenu.locator('.tape').isVisible().catch(() => false);
  expect(tapeVisible).toBe(false);

  // 4. Capture screenshot
  await page.waitForTimeout(200);
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/deckmenu-dark-no-emojis-${info.project.name}.png` });
});

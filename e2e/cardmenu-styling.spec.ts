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

  // 3. Verify clean typography and layout
  const header = menu.locator('.mh');
  await expect(header).toBeVisible();
  const fontSize = await header.evaluate((el) => window.getComputedStyle(el).fontSize);
  expect(parseInt(fontSize, 10)).toBeGreaterThanOrEqual(18);

  // 4. Capture screenshot
  await page.waitForTimeout(300);
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/cardmenu-zine-${info.project.name}.png` });
});

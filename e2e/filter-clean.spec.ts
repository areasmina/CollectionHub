import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

test('Filter menu without redundant VIEW row in Commander and Deck Forge', async ({ page }) => {
  await mockWorld(page);
  await seed(page);

  // 1. Check Commander view from Discover tab
  await page.evaluate(() => localStorage.setItem('ch:tab', 'discover'));
  await page.reload();

  // Click first commander card on Discover
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero')).toBeVisible();

  // On wide screens, .qviews is visible on the bar
  if ((page.viewportSize()?.width ?? 1280) > 700) {
    const qviews = page.locator('.dpage .qviews button');
    await expect(qviews.first()).toBeVisible();
    await expect(qviews).toHaveCount(3);
  }

  // Click the gear / filter button in Commander view
  const cmdrFilterSummary = page.locator('.dpage .tbmore summary');
  await expect(cmdrFilterSummary).toBeVisible();
  await cmdrFilterSummary.click();

  const cmdrDropdown = page.locator('.dpage .tbmore[open]');
  await expect(cmdrDropdown).toBeVisible();

  // Verify VIEW row is absent in Commander view filter dropdown
  await expect(cmdrDropdown.locator('.optrow', { hasText: 'VIEW' })).toHaveCount(0);

  // Capture screenshot of clean Commander filter dropdown
  if ((page.viewportSize()?.width ?? 1280) >= 1000) {
    const fbody = page.locator('.dtools.tbar > .tbmore > .fbody');
    await fbody.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/filter-menu-no-view.png'
    });
  }

  // 2. Check Deck Forge view
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();

  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  await expect(page.locator('.dpage')).toBeVisible();

  // Wide screen quick view check
  if ((page.viewportSize()?.width ?? 1280) > 700) {
    const qviews = page.locator('.dpage .qviews button');
    await expect(qviews.first()).toBeVisible();
    await expect(qviews).toHaveCount(3);
  }

  const deckFilterBtn = page.locator('.dpage .tbmore summary');
  await deckFilterBtn.click();

  const deckDropdown = page.locator('.dpage .tbmore[open]');
  await expect(deckDropdown).toBeVisible();
  await expect(deckDropdown.locator('.optrow', { hasText: 'VIEW' })).toHaveCount(0);
});

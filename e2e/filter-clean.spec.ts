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

  // .qviews is visible on the bar at every width (phones too, since Nov 13)
  const qviews = page.locator('.dpage .qviews button');
  await expect(qviews.first()).toBeVisible();
  await expect(qviews).toHaveCount(3);

  // Scroll toolbar to top of viewport so entire dropdown is framed inside the window
  const cmdrFilterSummary = page.locator('.dpage .tbmore summary');
  await expect(cmdrFilterSummary).toBeVisible();
  await page.evaluate(() => document.querySelector('.dtools.tbar')?.scrollIntoView(true));
  await cmdrFilterSummary.click();

  const cmdrDropdown = page.locator('.dpage .tbmore[open]');
  await expect(cmdrDropdown).toBeVisible();

  // No VIEW row in the dropdown: the bar has the view pills at every width
  await expect(cmdrDropdown.locator('.optrow:visible', { hasText: 'VIEW' })).toHaveCount(0);

  // Verify new hierarchy: PIN & WITHOUT card selection -> THEME -> the rest
  const fbody = page.locator('.dtools.tbar > .tbmore > .fbody');
  await expect(fbody).toBeVisible();

  // 1. PIN & WITHOUT selection inputs directly below
  const cfRow = fbody.locator('.cfilter .cf-row');
  await expect(cfRow).toBeVisible();
  await expect(cfRow.locator('.tab', { hasText: 'PIN' })).toBeVisible();
  await expect(cfRow.locator('.tab', { hasText: 'WITHOUT' })).toBeVisible();
  await expect(cfRow.locator('.cf-apply-btn')).toBeVisible();

  // 2. THEME chips below
  const themeRow = fbody.locator('.optrow:has(.themes)');
  await expect(themeRow).toBeVisible();

  // 4. GEAR row below
  const gearRow = fbody.locator('.optrow', { hasText: 'GEAR' });
  await expect(gearRow).toBeVisible();

  // 5. Pickgrid (SORT / SHOW / ONLY)
  const pickgrid = fbody.locator('.pickgrid');
  await expect(pickgrid).toBeVisible();

  await page.waitForTimeout(300);

  // Capture screenshot of clean Commander filter dropdown
  if ((page.viewportSize()?.width ?? 1280) >= 1000) {
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/filter-menu-composition-desktop.png'
    });
  } else if ((page.viewportSize()?.width ?? 1280) <= 500) {
    await page.screenshot({
      path: 'C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/filter-menu-composition-mobile.png'
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
  await expect(deckDropdown.locator('.optrow:visible', { hasText: 'VIEW' })).toHaveCount(0);
});

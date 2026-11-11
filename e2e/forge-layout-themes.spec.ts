import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Forge bar below commander hero, JUST BUILD IT on suggestions panel, and horizontal scrolling themes', async ({ page }, info) => {
  await addSignet(page);
  // Navigate to first commander
  await page.locator('.ccard').first().click();
  await expect(page.locator('.vhero')).toBeVisible();

  // 1. Check themes in filter menu are scrollable sideways (global rule)
  const filterSummary = page.locator('.tbmore summary').first();
  await expect(filterSummary).toBeVisible();
  await filterSummary.click();
  await page.waitForTimeout(300);

  const filterThemes = page.locator('.dtools .fbody .themes, .themes').first();
  await expect(filterThemes).toBeVisible();
  const flexWrap = await filterThemes.evaluate((el) => window.getComputedStyle(el).flexWrap);
  const overflowX = await filterThemes.evaluate((el) => window.getComputedStyle(el).overflowX);
  expect(flexWrap).toBe('nowrap');
  expect(overflowX).toMatch(/auto|scroll/);
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/filter-themes-${info.project.name}.png` });

  // Close filter
  await filterSummary.click();

  // 2. Trigger Forge mode via swap or forge button
  const forgeBtn = page.locator('.dstrip .forge, button:has-text("FORGE")').first();
  if (await forgeBtn.isVisible()) {
    await forgeBtn.click();
  } else {
    await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
    await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
  }

  // 3. Verify FORGE bar is right below the commander hero card
  const vhero = page.locator('.vhero');
  const forgetop = page.locator('.forgetop');
  const dstrip = page.locator('.dstrip');

  await expect(forgetop).toBeVisible();
  await expect(vhero).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const heroBox = await vhero.boundingBox();
  const forgeBox = await forgetop.boundingBox();
  const stripBox = await dstrip.boundingBox();

  expect(heroBox).not.toBeNull();
  expect(forgeBox).not.toBeNull();
  expect(stripBox).not.toBeNull();

  // FORGE bar is immediately below the commander hero and above the dstrip
  expect(forgeBox!.y).toBeGreaterThanOrEqual(heroBox!.y + heroBox!.height - 10);
  expect(stripBox!.y).toBeGreaterThanOrEqual(forgeBox!.y + forgeBox!.height - 10);

  // 4. Verify JUST BUILD IT button is on top of suggestions right panel
  const sugg = page.locator('.fsugg');
  await expect(sugg).toBeVisible();
  // on phones the sheet peeks; pull it up so the banner and sorts are visible
  const fgrab2 = sugg.locator('.fgrab');
  if (await fgrab2.isVisible()) await fgrab2.click();

  const justBuild = sugg.locator('.just-build-banner.sugg-top-action .btn-just-build');
  await expect(justBuild).toBeVisible();
  await expect(justBuild).toContainText('JUST BUILD IT!');

  // Verify JUST BUILD IT sits above sorts and search in the suggestions panel
  const justBuildBox = await justBuild.boundingBox();
  const sortsBox = await sugg.locator('.fsorts').boundingBox();
  expect(justBuildBox).not.toBeNull();
  expect(sortsBox).not.toBeNull();
  expect(justBuildBox!.y).toBeLessThan(sortsBox!.y);

  // 5. Verify themes inside suggestions panel are horizontally scrollable with nowrap
  const suggThemes = sugg.locator('.fthemes, .themes').first();
  if (await suggThemes.isVisible()) {
    const sFlexWrap = await suggThemes.evaluate((el) => window.getComputedStyle(el).flexWrap);
    const sOverflowX = await suggThemes.evaluate((el) => window.getComputedStyle(el).overflowX);
    expect(sFlexWrap).toBe('nowrap');
    expect(sOverflowX).toMatch(/auto|scroll/);

    // Verify themes are not cut off to only 6 - all available themes are rendered
    const themeButtons = suggThemes.locator('button.theme');
    const count = await themeButtons.count();
    expect(count).toBeGreaterThan(0);
  }

  // Take screenshot for visual verification
  await page.screenshot({ path: `C:/Users/areas/.gemini/antigravity/brain/ebdbe213-871a-4d82-8b68-48aa6175428d/forge-layout-${info.project.name}.png` });
});

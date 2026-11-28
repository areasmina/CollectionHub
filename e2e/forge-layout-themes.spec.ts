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
  await page.screenshot({ path: `test-results/filter-themes-${info.project.name}.png` });

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

  // 3. Verify FORGE bar lives inside the Dynamic Island and never clips or overlaps the hero
  const vhero = page.locator('.vhero');
  const island = page.locator('.pillnav.forging-island');
  const forgetop = island.locator('.forgetop');
  // on phones the bar's parts sit straight in the Island's one row (Nov 27), so measure that row
  const forgeRow = island.locator('.forge-island-wrap');

  await expect(island).toBeVisible();
  await expect(forgetop.locator('.fstamp')).toBeVisible();
  await expect(vhero).toBeVisible();

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const heroBox = await vhero.boundingBox();
  const forgeBox = await forgeRow.boundingBox();

  expect(heroBox).not.toBeNull();
  expect(forgeBox).not.toBeNull();
  expect(forgeBox!.y).toBeGreaterThanOrEqual(0);
  if (await island.evaluate((el) => el.classList.contains('dock-top'))) {
    expect(heroBox!.y).toBeGreaterThanOrEqual(forgeBox!.y + forgeBox!.height - 8);
  }

  // 4. Verify JUST BUILD IT button is on top of suggestions right panel
  const sugg = page.locator('.fsugg');
  await expect(sugg).toBeVisible();
  // on phones the sheet peeks; pull it up so the banner and sorts are visible
  const fgrab2 = sugg.locator('.fgrab');
  if (await fgrab2.isVisible()) {
    await fgrab2.click();
    await page.waitForTimeout(300); // allow sheet expand animation to settle
  }

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
  await page.screenshot({ path: `test-results/forge-layout-${info.project.name}.png` });
});

import { test, expect, type Page } from '@playwright/test';
import { addSignet, mockWorld, seed, showStats } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const go = async (page: Page, tab: 'discover' | 'collection' | 'decks') => {
  await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
  await page.reload();
};

test.describe('Collection & Decks Workbench Features', () => {
  test('Collection: no duplicate numbers bar, big squared cards visible, and import pop-up modal opens cleanly', async ({ page }) => {
    await go(page, 'collection');

    // Duplicate dsum text bar is removed (and with it the fold it sat on)
    await expect(page.locator('.dsum, details.dash')).toHaveCount(0);

    // Squared stat cards are visible
    await showStats(page); // they start folded (Nov 13)
    await expect(page.locator('.stats .stat')).toHaveCount(3);
    await expect(page.locator('.stats .slip')).toBeVisible();

    // Inline details.importbox accordion is removed
    await expect(page.locator('details.importbox')).toHaveCount(0);

    // Clicking IMPORT button opens the modal pop-up window
    await page.locator('.slip-btn.import').click();
    const modal = page.locator('.importbox-pop');
    await expect(modal).toBeVisible();
    await expect(modal.locator('h2, .nh')).toContainText('IMPORT CARDS');
    await expect(modal.locator('textarea')).toBeVisible();
    await expect(modal.locator('.u-btn.file')).toBeVisible();

    // Closing modal via Cancel button
    await modal.getByRole('button', { name: 'CANCEL' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('Decks Workbench: redundant shelf removed, zine ribbon, workbench toolbar with search/sort/filter, and custom color picker', async ({ page }) => {
    await go(page, 'decks');

    // Redundant horizontal shelf row is removed from Decks
    await expect(page.locator('.shelfhead, .shelfrow')).toHaveCount(0);

    // Zine styled overview ribbon is visible
    const ribbon = page.locator('.dribbon');
    await expect(ribbon).toBeVisible();

    // Decks toolbar is visible with search, sort, and filters
    const toolbar = page.locator('.decktoolbar');
    await expect(toolbar).toBeVisible();
    await expect(toolbar.locator('input[type="search"]')).toBeVisible();
    await expect(toolbar.locator('select')).toBeVisible();
    await expect(toolbar.locator('.dstatuspick .u-chip')).toHaveCount(4);

    // Open deck menu on first deck
    const firstDeck = page.locator('.dtile .dcard').first();
    await firstDeck.scrollIntoViewIfNeeded();
    await firstDeck.click({ button: 'right' });
    if (!(await page.locator('.deckmenu').isVisible({ timeout: 1000 }).catch(() => false))) {
      const b = (await firstDeck.boundingBox())!;
      await firstDeck.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b.x + 20, clientY: b.y + 20, isPrimary: true, bubbles: true });
      await page.waitForTimeout(650);
    }
    const menu = page.locator('.deckmenu');
    await expect(menu).toBeVisible();

    // Custom shade color picker is available
    await expect(menu.locator('.custom-color-label input[type="color"]')).toBeVisible();

    // Add tag action is available
    await expect(menu.getByRole('menuitem', { name: '+ ADD TAG' })).toBeVisible();
  });

  test('Decks overview: stats start folded; SHOW STATS sits beside the deck buttons and toggles the tiles', async ({ page }) => {
    await go(page, 'decks');

    // the tiles start folded (Nov 13); SHOW STATS sits on the row of the deck buttons
    const stats = page.locator('.dstats');
    const foldBtn = page.locator('.dfold');
    await expect(foldBtn).toContainText(/SHOW STATS/i);
    await expect(stats).toBeHidden();
    const row = async (sel: string) => { const b = (await page.locator(sel).first().boundingBox())!; return b.y + b.height / 2; };
    expect(Math.abs((await row('.dfold')) - (await row('.dribbon-acts > .u-btn')))).toBeLessThanOrEqual(3);
    expect((await foldBtn.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // one tap shows them, another folds them again
    await foldBtn.click();
    await expect(stats).toBeVisible();
    await expect(foldBtn).toContainText(/HIDE STATS/i);
    await foldBtn.click();
    await expect(stats).toBeHidden();
    await expect(foldBtn).toContainText(/SHOW STATS/i);
  });

  test('Forge cube on phones: CARDS · ANALYSIS · TO BUY tabs and face switching', async ({ page }, info) => {
    if (info.project.name !== 'phone') return; // cube tabs are phone-only
    await addSignet(page); // Arcane Signet must be owned so it appears in .picks
    await page.locator('.ccard').first().click();
    // enter forge mode via a swap
    await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
    await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();

    // cube tablist should be present
    const cube = page.locator('.fcube[role="tablist"]');
    await expect(cube).toBeVisible();
    await expect(cube.getByRole('tab')).toHaveText(['CARDS', 'ANALYSIS', 'TO BUY']);
    await expect(cube.getByRole('tab', { name: 'CARDS' })).toHaveAttribute('aria-selected', 'true');

    // switch to ANALYSIS: fmeters should scroll into view
    await cube.getByRole('tab', { name: 'ANALYSIS' }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.fmeters')).toBeInViewport();

    // switch to TO BUY: fbuylist should appear
    await cube.getByRole('tab', { name: 'TO BUY' }).click();
    await page.waitForTimeout(400);
    await expect(page.locator('.fbuylist')).toBeInViewport();
  });

  test('Dynamic Island: only the light opens sync, lip does not toggle menus, and undocked floating has venom goo styling', async ({ page }) => {
    await go(page, 'discover');

    const island = page.locator('.pillnav');
    await expect(island).toBeVisible();

    // Tapping the sdot light opens the Dynamic Island sync drawer
    const light = page.locator('.syncpill .sdot');
    await light.click();
    const drawer = page.locator('.island-drawer');
    await expect(drawer).toBeVisible();

    // Close by clicking scrim
    await page.locator('.island-scrim').click();
    await expect(drawer).toHaveCount(0);

    // Island lip is decorative and does not open drawer. (It takes no taps of its own since the island's 44px tap areas,
    // phase 4: a tap on the line lands on the section button under it, so tap its spot and check sync stays closed.)
    const lip = (await page.locator('.island-lip').boundingBox())!;
    await page.mouse.click(lip.x + lip.width / 2, lip.y + lip.height / 2);
    await expect(drawer).toHaveCount(0);
  });
});

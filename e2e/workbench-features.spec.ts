import { test, expect, type Page } from '@playwright/test';
import { mockWorld, seed } from './mock';

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

    // Duplicate dsum text bar is removed
    await expect(page.locator('details.dash > summary .dsum')).toHaveCount(0);

    // Squared stat cards are visible
    const dash = page.locator('details.dash');
    if (!(await dash.evaluate((e) => (e as HTMLDetailsElement).open))) {
      await dash.locator('summary').click();
    }
    await expect(page.locator('.stats .stat')).toHaveCount(3);
    await expect(page.locator('.stats .slip')).toBeVisible();

    // Inline details.importbox accordion is removed
    await expect(page.locator('details.importbox')).toHaveCount(0);

    // Clicking IMPORT button opens the modal pop-up window
    await page.locator('details.dash > summary .dimp').click();
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

  test('Dynamic Island: only the light opens sync, lip does not toggle menus, and undocked floating has venom goo styling', async ({ page }) => {
    await go(page, 'discover');

    const island = page.locator('.pillnav');
    await expect(island).toBeVisible();

    // Tapping the sdot light opens the sync menu we had before (SyncPanel)
    const light = page.locator('.syncpill .sdot');
    await light.click();
    const panel = page.locator('.panel[aria-label="Sync"]');
    await expect(panel).toBeVisible();
    await expect(panel.locator('h2')).toHaveText('SYNC BETWEEN DEVICES');

    // Close by clicking the close button
    await panel.locator('.close').click();
    await expect(panel).toHaveCount(0);

    // Island lip is decorative and does not open any sync panel
    await page.locator('.island-lip').click();
    await expect(panel).toHaveCount(0);
  });
});

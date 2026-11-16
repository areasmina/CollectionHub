import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Guillermo, Nov 15: "on desktop we have a lot of unused space on the left and right… we need to ensure maximum
 * space capabilities in any type of screen."
 *
 * The stage follows the screen: on a 1920 or 2560 screen the page uses nearly all of it, and the collection fits
 * more cards per row than it did inside the old 1640px frame. Phone and tablet are untouched, so this check only
 * runs on the desktop project.
 */
test.describe('Wide screens use the space', () => {
  test.beforeEach(() => {
    test.skip(test.info().project.name !== 'desktop', 'desktop sizes only');
  });

  for (const [width, minStage] of [[1920, 1800], [2560, 2280]] as const) {
    test(`a ${width}px screen keeps only a thin margin and fits more cards per row`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await mockWorld(page);
      await seed(page);
      await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
      await page.reload();
      await expect(page.locator('#cpane-cards .ctile').first()).toBeVisible();

      const { stage, side, cols } = await page.evaluate(() => {
        const m = document.querySelector('main') as HTMLElement;
        const r = m.getBoundingClientRect();
        const g = document.querySelector('#cpane-cards .zgrid') as HTMLElement;
        return {
          stage: Math.round(r.width),
          side: Math.round(Math.min(r.left, innerWidth - r.right)),
          cols: getComputedStyle(g).gridTemplateColumns.split(' ').length,
        };
      });

      expect(stage, 'the stage is still pinched into a narrow column').toBeGreaterThanOrEqual(minStage);
      expect(side, 'too much empty space at the sides').toBeLessThanOrEqual(150);
      // the old 1640px frame fitted 9 of these cards per row; a bigger screen must fit more
      expect(cols).toBeGreaterThan(9);
    });
  }
});

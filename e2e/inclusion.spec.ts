import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * No play rate under a card (Guillermo, Nov 15): "remove bottom text showing a percentage not needed".
 * The number still orders the page and still shows in the swap picker and TO BUY, where it is the point.
 */
test('Average deck cards carry no play rate, in any view; basics keep their count', async ({ page }) => {
  await mockWorld(page); // the commander page: every top card in 1000 of 4000 decks
  await seed(page);
  await page.locator('.ccard').first().click();
  const tile = (n: string) => page.locator('.ztile', { has: page.locator('.tname', { hasText: n }) }).first();
  await expect(tile('Lotus Cobra').locator('.tnote')).toHaveCount(0);
  await expect(tile('Sol Ring').locator('.tnote')).toHaveCount(0);
  await expect(tile('Forest').locator('.tnote')).toHaveText('\u00d710'); // the copies you need are not a play rate
  await expect(page.locator('.ztile .tnote', { hasText: 'of decks' })).toHaveCount(0);
});

for (const view of ['list', 'compact'] as const) {
  test(`${view} view: no play rate under a card either`, async ({ page }) => {
    await mockWorld(page);
    await seed(page);
    await page.evaluate((v) => localStorage.setItem('ch:cardview', v), view);
    await page.reload();
    await page.locator('.ccard').first().click();
    await expect(page.locator('.zrow .nm', { hasText: 'Lotus Cobra' }).first()).toBeVisible();
    await expect(page.getByText('of decks')).toHaveCount(0);
  });
}

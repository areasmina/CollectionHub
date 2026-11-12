import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/** Sacred card rule: nothing sits on top of a card's name, mana cost, rules text or collector line. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Commander and deck pages: the ⋯ OPTIONS tag hangs under the commander card, never on it', async ({ page }) => {
  const check = async () => {
    const btn = page.locator('.cmdrbtn').first();
    await expect(btn).toBeVisible();
    const img = (await btn.locator('img').first().boundingBox())!;
    const tag = (await btn.locator('.cmdrmore').boundingBox())!;
    expect(tag.y).toBeGreaterThanOrEqual(img.y + img.height - 1); // below the card's bottom edge
    await expect(btn.locator('.cmdrhint')).toHaveCount(0); // the old tape over the rules text is gone
  };
  await page.locator('.ccard').first().click();
  await check();
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  await check();
});

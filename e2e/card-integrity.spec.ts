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

test('Collection: a foil card shines on its picture and frame, never over its name, type line or rules text', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const foil = page.locator('.timg.foil').first();
  await expect(foil).toBeVisible();
  const look = await foil.evaluate((e) => {
    const a = getComputedStyle(e, '::after');
    const b = getComputedStyle(e, '::before');
    return { clip: a.clipPath, mask: b.maskImage || (b as unknown as Record<string, string>).webkitMaskImage };
  });
  expect(look.clip).toContain('inset'); // the strong shine is held to the art box
  expect(look.mask).toContain('gradient'); // the frame sheen is masked to the outer border
});

test('Foil shine is animated (sweep + drifting rainbow) and stands still when motion is reduced', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const foil = page.locator('.timg.foil').first();
  await expect(foil).toBeVisible();
  const names = () => foil.evaluate((e) => getComputedStyle(e, '::after').animationName);
  expect(await names()).toContain('foilsweep');
  expect(await names()).toContain('foilwash');
  // the light really moves: the sweep position changes over time
  const pos = () => foil.evaluate((e) => getComputedStyle(e, '::after').getPropertyValue('--sw'));
  const first = await pos();
  await expect.poll(pos, { timeout: 4000 }).not.toBe(first);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(names).toBe('none');
});

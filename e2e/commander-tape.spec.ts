import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Collection grid: a card that can lead a deck is marked by a crown inside its price sticker, and by nothing else
 * (Guillermo, Nov 15: the yellow COMMANDER tape repeated what Discover already tells him, and took a corner of the art
 * to do it).
 */
test('Collection grid: a crown on the price sticker marks a commander, and the old tape is gone', async ({ page }, info) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tile = page.locator('.ctile', { hasText: 'Tatyova, Benthic Druid' });
  await tile.scrollIntoViewIfNeeded();

  // no label anywhere on any card
  await expect(page.locator('.ctile .cmdtape')).toHaveCount(0);

  // the crown rides in the price tape of the one legendary creature in the binder, and nowhere else
  const crown = tile.locator('.cart > .price .pcrown');
  await expect(crown).toHaveCount(1);
  await expect(page.locator('.ctile .cart > .price .pcrown')).toHaveCount(1);
  await expect(page.locator('.ctile', { hasText: 'Sol Ring' }).locator('.pcrown')).toHaveCount(0);

  // it is inside the sticker, so the sticker keeps its place and the art stays clean
  const [inside, small] = await tile.evaluate((li) => {
    const p = li.querySelector('.cart > .price') as HTMLElement;
    const c = li.querySelector('.cart > .price .pcrown') as HTMLElement;
    const pr = p.getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return [cr.left >= pr.left - 0.5 && cr.right <= pr.right + 0.5 && cr.top >= pr.top - 0.5 && cr.bottom <= pr.bottom + 0.5, cr.width];
  });
  expect(inside, 'the crown hangs outside the price sticker').toBe(true);
  expect(small).toBeLessThanOrEqual(16);
  await page.screenshot({ path: `test-results/commander-crown-${info.project.name}.png` });
});

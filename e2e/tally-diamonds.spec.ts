import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Guillermo, Nov 15: "when you click the diamonds on a card to add or remove a card it changed the design. This is a
 * critical error… the design should follow the diamond pattern visual instead."
 *
 * Changing a card's count keeps the card's look: the same ink pill, the same diamonds, with − (or the bin) and +
 * on its ends.
 */
test('Changing a copy count keeps the diamonds and the card\'s own look', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const tile = page.locator('#cpane-cards .ctile').first();
  await tile.scrollIntoViewIfNeeded();
  await tile.focus(); // the tally only shows on hover or focus

  const resting = tile.locator('.tally .marks');
  const look = await resting.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, style: s.borderTopStyle };
  });
  const litBefore = await resting.locator('i.on').count();

  await resting.click({ force: true });
  const step = tile.locator('.tally .tstep');
  await expect(step).toBeVisible();

  // the diamonds are still there, and still show the same number of copies
  await expect(step.locator('.tmarks i')).toHaveCount(4);
  expect(await step.locator('.tmarks i.on').count()).toBe(litBefore);

  // and the pill is the same object: same ink, same round shape, a solid border — not another widget in another palette
  const editing = await step.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, radius: s.borderTopLeftRadius, style: s.borderTopStyle };
  });
  expect(editing.bg).toBe(look.bg);
  expect(editing.radius).toBe(look.radius);
  expect(editing.style).toBe('solid');

  // + really adds a copy, and the diamonds say so
  await step.getByRole('button', { name: /One more/ }).click();
  await expect(step.locator('.tmarks i.on')).toHaveCount(litBefore + 1);
  await expect(step.locator('.u-sr')).toHaveText(/2 copies/);
});

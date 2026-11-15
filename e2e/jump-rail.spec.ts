import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** ManaBox-style jump rail beside a long deck list: one tag per section, tap one to land on that section. */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Deck page: the jump rail lists the sections, fits the screen, and a tap lands on that section', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const rail = page.getByRole('navigation', { name: 'Jump to section' });
  if (info.project.name === 'phone') {
    // On phones the rail is pinned to the screen edge: it stays away while the deck's header (scores, FORGE) fills
    // the screen, and comes in once the card list reaches the top of the screen.
    await expect(page.locator('.dpage .lists').first()).toBeAttached();
    await page.evaluate(() => scrollTo(0, 0));
    await expect(rail).toBeHidden();
    await page.locator('.lists > .tbar').first().evaluate((e) => e.scrollIntoView({ block: 'start' }));
  }
  await expect(rail).toBeVisible();
  await expect(rail.getByRole('button')).toHaveText(['CRE', 'INS', 'SOR', 'ART', 'ENC', 'LND']); // heard, not seen
  // Nov 15: each known section shows an icon, the letters are for screen readers only, and the rail is see-through
  await expect(rail.locator('button > svg.jicon')).toHaveCount(6);
  await expect(rail.locator('button').first().locator('.sr')).toHaveText('CRE');
  expect(await rail.evaluate((el) => getComputedStyle(el).backgroundColor)).toMatch(/rgba\(/);
  expect(await rail.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(28);
  await fits(page, ['.jrail']);
  // Nov 15, round 3: the rail floats over the cards rather than reserving a lane of its own, and it is faint until
  // the list moves, so the width belongs to the cards.
  const railBox = (await rail.boundingBox())!;
  const listBox = (await page.locator('#jump-lands > summary').boundingBox())!;
  expect(railBox.x).toBeLessThan(listBox.x + listBox.width);
  await expect.poll(() => rail.evaluate((el) => Number(getComputedStyle(el).opacity)), { timeout: 4000 }).toBeLessThan(0.3); // dormant once the list stops moving
  expect(await page.locator('.lists').first().evaluate((el) => getComputedStyle(el).paddingRight)).toBe('0px');
  await page.locator('#jump-lands').evaluate((d) => ((d as HTMLDetailsElement).open = false));
  await rail.getByRole('button', { name: 'Jump to Lands' }).click();
  await expect(page.locator('#jump-lands')).toHaveAttribute('open', '');
  await expect(page.locator('#jump-lands > summary')).toBeInViewport();
  await expect(rail.getByRole('button', { name: 'Jump to Lands' })).toHaveAttribute('aria-current', 'true');
});

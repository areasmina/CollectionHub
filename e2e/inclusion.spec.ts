import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** EDHREC inclusion % per card (roadmap P2.1): the average deck shows how many EDHREC decks play each card. */
test('Average deck cards show EDHREC inclusion, basics keep their count', async ({ page }) => {
  await mockWorld(page); // the commander page: every top card in 1000 of 4000 decks
  await seed(page);
  await page.locator('.ccard').first().click();
  const tile = (n: string) => page.locator('.ztile', { has: page.locator('.tname', { hasText: n }) }).first();
  await expect(tile('Lotus Cobra').locator('.tnote')).toHaveText('25% of decks');
  await expect(tile('Sol Ring').locator('.tnote')).toHaveText('25% of decks');
  await expect(tile('Forest').locator('.tnote')).toHaveText('×10'); // not on the commander page: just the copies
  await fits(page, ['.ztile .tnote']);
});

test('Compact list: the inclusion line sits under the name and never squeezes it', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:cardview', 'compact'));
  await page.reload();
  await page.locator('.ccard').first().click();
  const row = page.locator('ul.zcompact li.zrow', { has: page.locator('.nm', { hasText: 'Lotus Cobra' }) }).first();
  await expect(row.locator('.note')).toHaveText('25% of decks');
  const nm = row.locator('.nm');
  expect(await nm.evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBe(true); // the name is not cut off
  await fits(page, ['ul.zcompact li.zrow .note']);
});

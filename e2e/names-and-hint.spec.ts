import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

/** Audit roadmap, phase 3: card and deck names are never under 14px on a phone, and the swap how-to line leaves after the first swap. */
test('Phone: no card or deck name under 14px on Discover, a commander page, Collection and My Decks', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the 14px floor is the phone rule');
  await mockWorld(page);
  await seed(page);
  const tiny = () =>
    page.evaluate(() => {
      const names = ['tatyova', 'lotus cobra', 'counterspell', 'sol ring', 'forest', 'island'];
      const out = new Set<string>();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode as Text;
        const e = t.parentElement!;
        if (!names.some((n) => t.data.toLowerCase().includes(n)) || !e.checkVisibility() || e.closest('.popnote, .vpop, p, small')) continue; // names, not sentences
        const fs = parseFloat(getComputedStyle(e).fontSize);
        if (fs < 14) out.add(`${e.tagName.toLowerCase()}.${e.className} ${fs}`);
      }
      return [...out];
    });
  await page.waitForSelector('.ccard');
  expect(await tiny(), 'Discover').toEqual([]);
  await page.locator('.ccard').first().click();
  await page.waitForSelector('details.cat');
  expect(await tiny(), 'commander page').toEqual([]);
  for (const tab of ['collection', 'decks']) {
    await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
    await page.reload();
    await page.waitForSelector(tab === 'collection' ? '.timg' : '.dcard');
    expect(await tiny(), tab).toEqual([]);
  }
});

test('Saved deck: the swap how-to line shows until the first swap, then stays away', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await addSignet(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  const hint = page.locator('.forgehint');
  await expect(hint).toContainText('tap a card to swap it');
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).first().click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
  await expect(hint).toHaveCount(0);
  await page.reload();
  await page.locator('.dcard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  await expect(hint).toHaveCount(0);
});

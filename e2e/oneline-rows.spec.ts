import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Compact list on phones: one line per card (art chip, name, pips, price, ⋮), so far more cards fit on the screen. */
test('Deck page, compact view on a phone: every card is one line and nothing spills off the screen', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone', 'the one-line layout is for phones; wider screens keep their compact list');
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => (localStorage.setItem('ch:tab', 'decks'), localStorage.setItem('ch:view', 'compact')));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const rows = page.locator('ul.zcompact > li.zrow');
  await expect(rows.first()).toBeVisible();
  await expect.poll(() => rows.evaluateAll((els) => Math.max(...els.map((e) => e.getBoundingClientRect().height)))).toBeLessThanOrEqual(56);
  await fits(page, ['ul.zcompact > li.zrow']);
  // the type line is hidden here, the name stays readable, and the card menu still opens
  await expect(rows.first().locator('.zrow-type')).toBeHidden();
  await expect(rows.first().locator('.nm')).toBeVisible();
  await rows.first().getByRole('button', { name: /^More for / }).click();
  await expect(page.locator('.cardmenu, .deckmenu, [role="menu"]').first()).toBeVisible();
});

import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/**
 * TOOLS (Guillermo, Nov 28): a saved deck's analysis and playtest tools behind one button on the deck strip, in one
 * sheet with a line on what each does: a bottom sheet on phones, a panel on wider screens.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
});

test('TOOLS opens one sheet with BALANCE, HAND & ODDS, RULE ZERO, HISTORY and HEADER, each explained; a row opens its tool', async ({ page }, info) => {
  const strip = page.locator('.forgemain > .dstrip');
  await expect(strip.getByRole('button', { name: 'TOOLS' })).toBeVisible();
  // the five buttons that used to sit under the strip are gone from it
  await expect(strip.getByRole('button', { name: 'BALANCE' })).toHaveCount(0);
  await strip.getByRole('button', { name: 'TOOLS' }).click();
  const sheet = page.getByRole('dialog', { name: 'Deck tools' });
  await expect(sheet).toBeVisible();
  await fits(page, ['.fsheet2']);
  const rows = sheet.locator('ul > li > button');
  await expect(rows).toHaveCount(5);
  for (const [name, line] of [
    ['BALANCE', /Cut Lab/],
    ['HAND & ODDS', /test hand/],
    ['RULE ZERO', /table/],
    ['HISTORY', /Earlier versions/],
    ['HEADER', /header/],
  ] as const) await expect(sheet.getByRole('button', { name: new RegExp(`^${name}`) })).toContainText(line);
  if (info.project.name === 'phone') for (const r of await rows.all()) expect((await r.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: `test-results/deck-tools-${info.project.name}.png` });

  // a row closes the sheet and opens its tool
  await sheet.getByRole('button', { name: /^HAND & ODDS/ }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

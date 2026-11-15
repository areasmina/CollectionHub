import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

/** Roadmap P3.1: Commander Spellbook and Archidekt one tap from the commander page and from a saved deck. */
const combos = 'https://commanderspellbook.com/search/?q=card%3D%22Tatyova%2C%20Benthic%20Druid%22';
const archidekt = 'https://archidekt.com/search/decks?commanders=%22Tatyova%2C%20Benthic%20Druid%22&formats=3';

test('EDHREC, COMBOS and ARCHIDEKT sit together on the commander page and the deck page; OPTIONS wears the price tape', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.locator('.ccard').first().click();
  const meta = page.locator('.vhero .vmeta');
  await expect(meta.getByRole('link', { name: 'EDHREC ↗' })).toBeVisible();
  for (const [name, href] of [['COMBOS ↗', combos], ['ARCHIDEKT ↗', archidekt]]) {
    const a = meta.getByRole('link', { name });
    await expect(a).toBeVisible();
    await expect(a).toHaveAttribute('href', href);
    await expect(a).toHaveAttribute('target', '_blank');
    await expect(a).toHaveAttribute('rel', 'noreferrer');
  }
  await fits(page, ['.vhero .vmeta a']);
  // one group, same order on both pages
  await expect(meta.locator('.vlinks a')).toHaveText(['EDHREC ↗', 'COMBOS ↗', 'ARCHIDEKT ↗']);
  // the OPTIONS tag under the commander card is Collection's price tape: yellow, torn ends, the price tag's type
  const tag = page.locator('.cmdrbtn .cmdrmore').first();
  await page.locator('.cmdrbtn').first().focus(); // the tag shows when the card is selected
  await expect(tag).toHaveCSS('background-color', 'rgb(255, 204, 0)');
  await expect(tag).not.toHaveCSS('clip-path', 'none');
  const priceFont = await page.evaluate(() => {
    const p = document.createElement('span');
    p.className = 'price tapey y0 t0';
    document.body.append(p);
    const f = getComputedStyle(p).fontFamily;
    p.remove();
    return f;
  });
  await expect(tag).toHaveCSS('font-family', priceFont);
  // the saved deck (Tatyova Lands) carries the same two
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dtile').filter({ has: page.getByText('Tatyova Lands', { exact: true }) }).locator('.dcard').click();
  const dmeta = page.locator('.dhero .vmeta');
  await expect(dmeta).toContainText('46 cards');
  await expect(dmeta.locator('.vlinks a')).toHaveText(['EDHREC ↗', 'COMBOS ↗', 'ARCHIDEKT ↗']);
  await expect(dmeta.getByRole('link', { name: 'EDHREC ↗' })).toHaveAttribute('href', 'https://edhrec.com/commanders/tatyova-benthic-druid');
  await expect(dmeta.getByRole('link', { name: 'COMBOS ↗' })).toHaveAttribute('href', combos);
  await expect(dmeta.getByRole('link', { name: 'ARCHIDEKT ↗' })).toHaveAttribute('href', archidekt);
  await fits(page, ['.dhero .vmeta a']);
});

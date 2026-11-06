import { expect, test } from '@playwright/test';
import { addSignet, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const openDeck = async (page: import('@playwright/test').Page) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard').first().click();
};

test('Forge on a saved deck: focus mode, sorts, theme chips, own-card search, tap then tap to swap, undo', async ({ page }, info) => {
  await addSignet(page);
  await openDeck(page);
  const top = page.locator('.forgetop');
  await expect(top).toContainText('Tatyova Lands');
  await expect(page.locator('.pillnav')).toBeHidden(); // the rest of the app steps back
  const sugg = page.locator('.fsugg');
  await expect(sugg.getByRole('radio')).toHaveText(['OUR PICK', 'EDHREC LIFT', 'POPULAR']);
  await expect(page.locator('.fmeters')).toBeVisible();
  // the suggestion: an owned card EDHREC plays here, with its reasons
  const row = sugg.locator('.frows li', { hasText: 'Arcane Signet' });
  await expect(row).toHaveClass(/own/);
  await expect(row.locator('.whys')).toContainText('owned');
  // phones: pull the sheet up to see the filters
  if (await sugg.locator('.fgrab').isVisible()) await sugg.locator('.fgrab').click();
  // themes are EDHREC's tags read as rules-text tests: Landfall filters the list to cards whose text fits
  await sugg.getByRole('button', { name: '#landfall' }).click();
  await expect(sugg.getByRole('button', { name: '#landfall' })).toHaveAttribute('aria-pressed', 'true');
  await expect(row).toHaveCount(0);
  await sugg.getByRole('button', { name: '#landfall' }).click();
  await expect(row).toHaveCount(1);
  // sorts switch
  await sugg.getByRole('radio', { name: 'EDHREC LIFT' }).click();
  await expect(sugg.getByRole('radio', { name: 'EDHREC LIFT' })).toHaveAttribute('aria-checked', 'true');
  // search covers your own cards' text
  await sugg.getByRole('searchbox').fill('signet');
  await expect(sugg.locator('.frows li')).toHaveCount(1);
  await sugg.getByRole('searchbox').fill('');
  await page.screenshot({ path: `test-results/forge-deck-${info.project.name}.png` });
  // tap the suggestion, then tap a deck card: swapped, with UNDO in the Forge bar
  await row.locator('.frow').click();
  await expect(sugg.locator('.fplace')).toContainText('Arcane Signet');
  await page.locator('.lists [data-card="Sol Ring"]').first().click();
  await expect(page.locator('.toast')).toContainText('Swapped Sol Ring for Arcane Signet');
  await expect(page.locator('.lists [data-card="Arcane Signet"]')).toHaveCount(1);
  await top.locator('.fundo').click();
  await expect(page.locator('.lists [data-card="Sol Ring"]')).toHaveCount(1);
  // ✕ LEAVE goes back to the decks, and the nav comes back
  await top.locator('.fleave').click();
  await expect(page.locator('.pillnav')).toBeVisible();
});

test('Forge on the commander page: the first swap opens it, with SUGGESTIONS and TO BUY panes', async ({ page }, info) => {
  await addSignet(page);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
  await expect(page.locator('.forgetop')).toContainText('1 swap');
  const sugg = page.locator('.fsugg');
  await expect(sugg.getByRole('tab', { name: /SUGGESTIONS/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.fmeters')).toBeVisible();
  await page.screenshot({ path: `test-results/forge-cmdr-${info.project.name}.png` });
  await sugg.getByRole('tab', { name: 'TO BUY' }).click();
  await expect(sugg.locator('.fbuy .receipt')).toBeVisible();
  // undo the swap from the Forge bar
  await page.locator('.forgetop .fundo').click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { cards, mockWorld, seed } from './mock';

// IMPORT DECK sits beside NEW BLANK DECK; a pasted list becomes a saved deck; the Collection is left alone.
test('Decks: IMPORT DECK turns a pasted list into a deck and opens it', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();

  await expect(page.getByRole('button', { name: 'IMPORT DECK' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'NEW BLANK DECK' })).toBeVisible();
  await page.getByRole('button', { name: 'IMPORT DECK' }).click();

  const pop = page.getByRole('dialog', { name: 'Import a deck' });
  await expect(pop).toBeVisible();
  await pop.getByLabel('Deck name').fill('Pasted deck');
  await pop.getByLabel('Deck list').fill(`1 ${cards[0].name}`);
  await pop.getByRole('button', { name: 'IMPORT', exact: true }).click();

  // Either it opened the deck straight away, or it reports what it left out and offers OPEN DECK.
  const open = pop.getByRole('button', { name: 'OPEN DECK' });
  if (await open.isVisible().catch(() => false)) await open.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Pasted deck');
});

test('Decks: SIZE button cycles the deck grid', async ({ page }) => {
  await mockWorld(page);
  await seed(page);
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  const size = page.locator('.qzoom-btn').first();
  await expect(size).toBeVisible();
  const before = await size.textContent();
  await size.click();
  await expect(size).not.toHaveText(before ?? '');
});

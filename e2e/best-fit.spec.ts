import { expect, test } from '@playwright/test';
import { edhJson, fits, mockWorld, seed } from './mock';

/** BEST FOR MY CARDS (roadmap 5.1): EDHREC's deck at power 3, 4, 5 and every budget, the most-owned one opened. */
test('Best for my cards checks every power and budget and opens the deck you own most of', async ({ page }) => {
  await mockWorld(page);
  // the seeded binder owns every mock card; only Min power at 1ST gear (budget) avoids two cards it lacks; no Max decks
  const asked: string[] = [];
  const base = { cards: { Creatures: [['Lotus Cobra', 1]], Artifacts: [['Sol Ring', 1]], Sorceries: [['Cultivate', 1]], Enchantments: [['Rhystic Study', 1]], Instants: [['Counterspell', 1]], Lands: [['Forest', 10], ['Island', 10]] } };
  await page.route(/json\.edhrec\.com\/pages\/average-decks\//, async (r) => {
    const path = new URL(r.request().url()).pathname.replace('/pages/average-decks/', '').replace('.json', '');
    asked.push(path);
    if (path.includes('/cedh')) return r.fulfill({ status: 404, body: '' });
    const json = edhJson(4321); // mockWorld's page (commander card, tags)
    const extra = path.endsWith('/upgraded/budget') ? [] : [['Arcane Signet', 1], ['Mana Crypt', 1]];
    return r.fulfill({ json: { ...json, deck: { cards: { ...base.cards, Artifacts: [...base.cards.Artifacts, ...extra] } } } });
  });
  await seed(page);
  await page.locator('.ccard').first().click();
  const btn = page.getByRole('button', { name: 'BEST FOR MY CARDS' });
  await expect(btn).toBeVisible();
  await btn.click();
  const note = page.locator('.bestfit-row .bnote');
  await expect(note).toContainText('Checked 6 EDHREC decks: you own the most of min power · 1st gear');
  await expect(note).toContainText('100%');
  for (const b of ['upgraded', 'optimized', 'cedh']) for (const g of ['budget', 'expensive']) expect(asked).toContain(`tatyova-benthic-druid/${b}/${g}`);
  // the winner is open, and its chip says so; the others are one tap away
  await expect(page.locator('.bestfit-row .u-chip[aria-pressed="true"]')).toContainText('MIN POWER · 1ST GEAR');
  await expect(page.locator('.bestfit-row .u-chip')).toHaveCount(7); // 6 decks + HIDE
  await fits(page, ['.dstrip .bestfit', '.bestfit-row .bnote']);
  await page.locator('.bestfit-row .u-chip', { hasText: 'MED POWER · 3RD GEAR' }).click();
  await expect(page.locator('.bestfit-row .u-chip[aria-pressed="true"]')).toContainText('MED POWER · 3RD GEAR');
  await page.locator('.bestfit-row .u-chip', { hasText: 'HIDE' }).click();
  await expect(page.locator('.bestfit-row')).toHaveCount(0);
});

import { expect, test } from '@playwright/test';
import { mockWorld, seed } from './mock';

/**
 * Guillermo, Nov 16 (critical): "some cards are flippable because they transform… we need the ability to turn those
 * cards so we can see what happens on the back". The fake world's Lotus Cobra transforms; everything else does not.
 */
test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const front = /\/front\//;
const back = /\/back\//;

test('Collection: a card that transforms turns over where it sits, and nothing else does', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const cobra = page.locator('.coll .ctile', { hasText: 'Lotus Cobra' }).first();
  await expect(cobra).toBeVisible();
  const flip = cobra.locator('.flipbtn');
  await expect(flip).toBeVisible();
  await expect(cobra.locator('img').first()).toHaveAttribute('src', front);
  // the control sits in the card's own corner, clear of the ⋮, the price tape and the copy pips, and it is the thing
  // the browser hits there even when the card is selected (which brings those extras up)
  const art = (await cobra.locator('.xart').first().boundingBox())!;
  const btn = (await flip.boundingBox())!;
  expect(btn.x).toBeLessThan(art.x + art.width / 2);
  expect(btn.y).toBeLessThan(art.y + art.height / 2);
  expect(Math.min(btn.width, btn.height)).toBeGreaterThanOrEqual(20);
  await cobra.focus();
  expect(
    await flip.evaluate((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!hit && b.contains(hit);
    }),
    'something is covering the flip control',
  ).toBe(true);

  await flip.click();
  await expect(cobra.locator('img').first()).toHaveAttribute('src', back);
  await expect(flip).toHaveAttribute('aria-pressed', 'true');
  await flip.click();
  await expect(cobra.locator('img').first()).toHaveAttribute('src', front);

  // a one-faced card has nothing to turn over
  const ring = page.locator('.coll .ctile', { hasText: 'Sol Ring' }).first();
  await expect(ring).toBeVisible();
  await expect(ring.locator('.flipbtn')).toHaveCount(0);
});

test('Turning a card over changes nothing about what you own or what it costs', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  const cobra = page.locator('.coll .ctile', { hasText: 'Lotus Cobra' }).first();
  await expect(cobra).toBeVisible();
  await expect(cobra.locator('.price')).toBeVisible(); // the price is there before we compare anything
  const facts = () => cobra.evaluate((t) => [...t.querySelectorAll('.price, .qty, .tname, .tagother')].map((e) => e.textContent).join('|'));
  const before = await facts();
  await cobra.locator('.flipbtn').click();
  await expect(cobra.locator('img').first()).toHaveAttribute('src', back);
  expect(await facts()).toBe(before);
});

test('Deck page: the back of a card can be read big', async ({ page }) => {
  await page.evaluate(() => localStorage.setItem('ch:tab', 'decks'));
  await page.reload();
  await page.locator('.dcard', { hasText: 'Tatyova Lands' }).click();
  const tile = page.locator('.ztile', { hasText: 'Lotus Cobra' }).first();
  await expect(tile).toBeVisible();
  await expect(tile.locator('.flipbtn')).toHaveCount(1);
  await tile.locator('.flipbtn').click();
  await expect(tile.locator('img').first()).toHaveAttribute('src', back);
});

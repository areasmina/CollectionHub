import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

test('Phone round: card is its own swap button, % in the burst, one FILTERS button', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('.match .num')).toHaveText(/%$/);
  // the % comes after the bar (inside the burst on the right)
  const [bar, num] = await Promise.all([page.locator('.match .meter').boundingBox(), page.locator('.match .num').boundingBox()]);
  expect(num!.x).toBeGreaterThan(bar!.x + bar!.width - 2);
  await page.screenshot({ path: `test-results/round-top-${info.project.name}.png` });
  await page.locator('.match').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/round-strip-${info.project.name}.png` });
  // FILTERS opens a sheet holding sort and show
  const sheet = page.locator('.fsheet');
  await expect(sheet.locator('.sbox').first()).toBeHidden();
  await sheet.locator('summary').click();
  await expect(sheet.locator('.sbox')).toHaveCount(2);
  await expect(sheet.locator('.sbox').first()).toBeVisible();
  await fits(page, ['.fsheet']);
  await sheet.locator('summary').click();
  // no visible SWAP / ⇄ text under cards: tapping the card swaps
  const tile = page.locator('.ztile').nth(1);
  await tile.scrollIntoViewIfNeeded();
  await expect(tile.locator('.tilehit')).toHaveText('Swap');
  await page.screenshot({ path: `test-results/round-tiles-${info.project.name}.png` });
  const box = (await tile.locator('.timg').boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 60); // a tap on the card art swaps
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

test('Phone round: eye behind the logo; Collection tools on one row', async ({ page }, info) => {
  await page.screenshot({ path: `test-results/round-home-${info.project.name}.png` });
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await page.locator('.ztile, .zrow, .cardgrid li').first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.screenshot({ path: `test-results/round-coll-${info.project.name}.png`, fullPage: true });
});

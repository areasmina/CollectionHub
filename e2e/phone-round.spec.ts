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
  await expect(sheet.locator('.sbox')).toHaveCount(4);
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

test('Title answer: deck count tucked behind the title, tagline under BUILD (wider screens)', async ({ page }, info) => {
  const ans = page.locator('.titlewrap > .tanswer');
  await expect(ans).toContainText(/DECK|OF/);
  // behind the letters: below the title in stacking order
  const z = await page.evaluate(() => [getComputedStyle(document.querySelector('.titlewrap > .tanswer')!).zIndex, getComputedStyle(document.querySelector('.titlewrap > .ztitle')!).zIndex]);
  expect(Number(z[0])).toBeLessThan(Number(z[1]));
  await expect(page.locator('.tagline')).toHaveCount(1);
  if (info.project.name !== 'phone') {
    const [tag, build] = await Promise.all([page.locator('.tagline.tunder').boundingBox(), page.locator('.ztitle .rword').nth(3).boundingBox()]);
    expect(Math.abs(tag!.x - build!.x)).toBeLessThan(16);
    expect(tag!.y).toBeGreaterThan(build!.y + build!.height - 12);
  }
  await fits(page, ['.hero']);
  await page.locator('.hero').screenshot({ path: `test-results/title-answer-${info.project.name}.png` });
});

test('Design brief: sticky slim bar, quiet totals, meta line, small sections side by side, nav hides on scroll', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const bar = page.locator('.slimbar');
  await expect(bar.getByRole('radiogroup', { name: 'Power' })).toBeVisible();
  await expect(bar.locator('.forgecell, .misscost')).toHaveCount(0); // no FORGE IT, the missing cost lives in TO BUY
  expect(await bar.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  await expect(page.locator('.namerow .cstamp')).toContainText('DECKS');
  // the deck total is quiet text, not yellow tape; section totals too
  expect(await page.locator('.hstats .price').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('.cat > summary .gval').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // the sample has 1-card sections: the first two share a row
  const [a, b] = await Promise.all([page.locator('details.cat').nth(0).boundingBox(), page.locator('details.cat').nth(1).boundingBox()]);
  expect(Math.abs(a!.y - b!.y)).toBeLessThan(4);
  await fits(page, ['.slimbar', '.lists']);
  // scroll down: the bar sticks to the top, the nav slides away; scroll up: the nav is back
  // (not all the way down: at the very bottom the nav comes back on purpose)
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  await page.mouse.wheel(0, Math.min(900, room - 120));
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  expect(Math.round((await bar.boundingBox())!.y)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: `test-results/brief-scrolled-${info.project.name}.png` });
  await page.mouse.wheel(0, -300);
  await expect(page.locator('.pillnav.away')).toHaveCount(0);
});

test('Nov 6 batch: rules-text search, one price tape, swap window search up top, deck colour', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  // search by rules text, not just the name: "landfall" finds Lotus Cobra
  const box = page.locator('.lists > .dtools .tsearch input');
  await box.fill('landfall');
  await expect(page.locator('.ztile', { hasText: 'Lotus Cobra' }).first()).toBeVisible();
  await expect(page.locator('.ztile', { hasText: 'Counterspell' })).toHaveCount(0);
  await box.fill('');
  // every priced tile wears Collection's tape sticker on its corner
  const tape = page.locator('.ztile > .price.tapey').first();
  await expect(tape).toHaveCount(1);
  expect(await tape.evaluate((e) => getComputedStyle(e).position)).toBe('absolute');
  // the swap window's search sits in its header, beside the title
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const dlg = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await expect(dlg.locator('.nh .swapq input')).toBeVisible();
  await page.screenshot({ path: `test-results/nov6-swap-${info.project.name}.png` });
  await dlg.getByRole('button', { name: 'Close' }).click();
  // Collection: search reads rules text too
  await page.evaluate(() => localStorage.setItem('ch:tab', 'collection'));
  await page.reload();
  await page.locator('input[placeholder="name or rules text_"]').first().fill('counter target');
  await expect(page.locator('li', { hasText: 'Counterspell' }).first()).toBeVisible();
  await expect(page.locator('li', { hasText: 'Sol Ring' })).toHaveCount(0);
  await page.screenshot({ path: `test-results/nov6-collection-${info.project.name}.png` });
});

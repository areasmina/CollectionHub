import { expect, test } from '@playwright/test';
import { fits, mockWorld, opts, seed } from './mock';

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
    // under BUILD, slid left only as far as needed to stay on one line inside the title
    const wrap = (await page.locator('.hero .titlewrap').boundingBox())!;
    expect(tag!.x).toBeLessThan(build!.x + 16);
    expect(tag!.x + tag!.width).toBeLessThanOrEqual(wrap.x + wrap.width + 2);
    expect(tag!.height).toBeLessThan(40); // one line
    expect(tag!.y).toBeGreaterThan(build!.y + build!.height - 12);
  }
  await fits(page, ['.hero']);
  await page.locator('.hero').screenshot({ path: `test-results/title-answer-${info.project.name}.png` });
});

test('One slim bar: search + ⋮ (POWER, BUDGET inside), groups stacked full width, quiet totals, nav hides on scroll', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const bar = page.locator('.lists > .tbar');
  await expect(page.locator('.slimbar')).toHaveCount(0); // POWER and BUDGET live in the bar's options now
  await expect(bar.locator('.tsearch input')).toBeVisible();
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(52); // one slim row at every width
  expect(await bar.evaluate((e) => getComputedStyle(e).position)).toBe('sticky');
  await expect(bar.locator('.fnow')).toHaveText(/MIN|ALL|MED|MAX/);
  const o = await opts(page);
  await expect(o.getByRole('radiogroup', { name: 'Power' })).toBeVisible();
  await expect(o.getByRole('radiogroup', { name: 'Budget' })).toBeVisible();
  await fits(page, ['.tbar', '.tbar .fbody']);
  await page.screenshot({ path: `test-results/bar-open-${info.project.name}.png` });
  await o.locator('summary').click();
  await expect(page.locator('.namerow .cstamp')).toContainText('DECKS');
  expect(await page.locator('.hstats .price').evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  expect(await page.locator('.cat > summary .gval').first().evaluate((e) => getComputedStyle(e).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  // every group is its own full-width row, collapsed or not, and its header is one line
  const sums = page.locator('details.cat > summary');
  await sums.nth(0).click();
  await sums.nth(1).click();
  const [a, b] = await Promise.all([page.locator('details.cat').nth(0).boundingBox(), page.locator('details.cat').nth(1).boundingBox()]);
  expect(b!.y).toBeGreaterThan(a!.y + a!.height - 2);
  expect(Math.abs(a!.width - b!.width)).toBeLessThan(2);
  expect((await sums.nth(0).boundingBox())!.height).toBeLessThan(56);
  await fits(page, ['.lists']);
  // scroll down: the bar sticks to the top, the nav slides away; scroll up: the nav is back
  await sums.nth(0).click();
  await sums.nth(1).click();
  const room = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const start = (await bar.boundingBox())!.y;
  const y0 = await page.evaluate(() => scrollY);
  await page.mouse.wheel(0, Math.min(900, room - 120));
  await expect(page.locator('.pillnav.away')).toHaveCount(1);
  // once the page has scrolled past the bar, the bar holds at the top instead of leaving the screen
  await expect.poll(async () => (await page.evaluate(() => scrollY)) > y0).toBe(true);
  const moved = (await page.evaluate(() => scrollY)) - y0;
  const y = (await bar.boundingBox())!.y;
  expect(y).toBeGreaterThanOrEqual(0);
  expect(Math.round(y)).toBeLessThanOrEqual(Math.max(8, Math.round(start - moved) + 2));
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

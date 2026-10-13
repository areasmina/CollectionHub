import { expect, test } from '@playwright/test';
import { fits, mockWorld, seed } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const go = async (page: import('@playwright/test').Page, tab: 'discover' | 'collection' | 'decks') => {
  await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
  await page.reload();
};

test('Discover: title, eye art, filters and commanders fit the screen', async ({ page }, info) => {
  await expect(page.locator('.hero .titlewrap')).toBeVisible();
  await expect(page.locator('.eyedoodle')).toBeVisible();
  await expect(page.locator('.ccard').first()).toBeVisible();
  if (info.project.name === 'phone') {
    // filters fold into the tag under the eye
    await expect(page.locator('.hero .fpanel')).toBeHidden();
    await page.locator('.ftag').tap();
    await expect(page.locator('.hero .fpanel input[type=search]')).toBeVisible();
  } else await expect(page.locator('.hero .fpanel input[type=search]')).toBeVisible();
  await expect(page.locator('.colours button')).toHaveCount(5);
  await fits(page, ['.hero .titlewrap', '.hero .fpanel', '.eyedoodle', '.ccard']);
});

test('Commander page: header stats, tags row stays inside its frame', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('.chero h1')).toBeVisible();
  await expect(page.locator('.hstats .price')).toBeVisible();
  const row = await page.locator('.chero .hscroll').boundingBox();
  const frame = await page.locator('.chero').boundingBox();
  expect(row!.x + row!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
  await fits(page, ['.chero', '.strip']);
});

test('Collection: counters, widget, grid tiles with tally marks', async ({ page }) => {
  await go(page, 'collection');
  await expect(page.locator('.stats .stat')).toHaveCount(3);
  await expect(page.locator('.topwidget')).toBeVisible();
  await expect(page.locator('.ctile').first()).toBeVisible();
  await expect(page.locator('.ctile .tally .marks').first()).toBeVisible();
  // the tally strip opens and changes the quantity
  const t = page.locator('.ctile').first();
  await t.locator('.tally .marks').click();
  const n = Number(await t.locator('.tstep b').innerText());
  await t.locator('.tstep button').last().click();
  await expect(t.locator('.tstep b')).toHaveText(String(n + 1));
  await fits(page, ['.stats', '.ctile', '.topwidget']);
});

test('Deck page: header, toolbar, analysis and the card menu', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dpanel')).toBeVisible();
  await expect(page.locator('.dtools .viewsw')).toBeVisible();
  const tile = page.locator('.ztile', { hasText: 'Sol Ring' }).first();
  // the deck re-renders while card data loads: retry until the tile is settled in view
  await expect(async () => {
    await tile.scrollIntoViewIfNeeded({ timeout: 2000 });
    expect(await tile.boundingBox()).not.toBeNull();
  }).toPass();
  if (info.project.name === 'desktop') await tile.click({ button: 'right' });
  else {
    const b = await tile.boundingBox();
    await tile.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b!.x + 20, clientY: b!.y + 30, isPrimary: true });
    await page.waitForTimeout(650);
  }
  await expect(page.locator('.cardmenu')).toBeVisible();
  const menu = await page.locator('.cardmenu').boundingBox();
  const vw = page.viewportSize()!.width;
  expect(menu!.x).toBeGreaterThanOrEqual(0);
  expect(menu!.x + menu!.width).toBeLessThanOrEqual(vw);
  await fits(page, ['.dhero', '.dtools', '.dpanel']);
});

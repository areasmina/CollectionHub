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
  // grid / list lives in the first (commander) section and switches the view
  const sw = page.locator('details.cat').first().locator('.viewsw.mini');
  await expect(sw).toBeVisible();
  await fits(page, ['.viewsw.mini']);
  await sw.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.zlist').first()).toBeVisible();
  await sw.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
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

const deckMenu = async (page: import('@playwright/test').Page, item: string) => {
  const b = page.getByRole('button', { name: /^Deck options/ });
  await b.scrollIntoViewIfNeeded();
  await b.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(250); // let the drop-in animation finish before measuring
  await fits(page, ['.deckmenu']);
  await menu.getByRole('menuitem', { name: item }).click();
};

test('Deck page: Delete is in the DECK menu, asks first, and removes the deck', async ({ page }) => {
  await go(page, 'decks');
  await expect(page.locator('.dcard')).toHaveCount(1);
  await page.locator('.dcard').first().click();
  await fits(page, ['.dtools']);
  // Cancelling the confirm keeps the deck
  page.once('dialog', (d) => d.dismiss());
  await deckMenu(page, 'Delete deck');
  await expect(page.locator('.dpanel')).toBeVisible();
  page.once('dialog', (d) => (expect(d.message()).toContain('Tatyova Lands'), d.accept()));
  await deckMenu(page, 'Delete deck');
  await expect(page.locator('.dpanel')).toHaveCount(0);
  await expect(page.locator('.dcard')).toHaveCount(0);
});

test('Deck page: Rename and Duplicate', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await page.locator('.dtools').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `test-results/deck-tools-${info.project.name}.png` });
  await page.getByRole('button', { name: /^Deck options/ }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: `test-results/deck-menu-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  page.once('dialog', (d) => d.accept('Tatyova Ramp'));
  await deckMenu(page, 'Rename');
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Ramp');
  await deckMenu(page, 'Duplicate');
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Ramp (copy)');
  // Renaming the copy to the original's name picks a free one instead
  const answers: (string | undefined)[] = ['Tatyova Ramp', undefined]; // the new name, then OK to "use Tatyova Ramp 2?"
  page.on('dialog', (d) => d.accept(answers.shift()));
  await deckMenu(page, 'Rename');
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Ramp 2');
  await page.locator('.backlink').click();
  await expect(page.locator('.dcard')).toHaveCount(2);
});

test('Deck page: right-click / press and hold the header opens the deck menu', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  const h1 = page.locator('.dhero h1');
  if (info.project.name === 'desktop') await h1.click({ button: 'right' });
  else {
    const b = (await h1.boundingBox())!;
    await h1.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b.x + 20, clientY: b.y + 20, isPrimary: true });
    await page.waitForTimeout(650);
  }
  await expect(page.getByRole('menu', { name: 'Tatyova Lands options' })).toBeVisible();
  await page.waitForTimeout(250);
  await fits(page, ['.deckmenu']);
  await page.screenshot({ path: `test-results/deck-hold-${info.project.name}.png` });
});

test('Deck names open the deck: commander page and the copies warning', async ({ page }) => {
  // Commander page: "your deck: Tatyova Lands" opens it
  await page.locator('.ccard').first().click();
  const link = page.locator('.mydecks .decklink', { hasText: 'Tatyova Lands' });
  await link.scrollIntoViewIfNeeded();
  await link.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands');
  // A copy shares every card, so the copies warning lists both decks: each name opens its deck
  await deckMenu(page, 'Duplicate');
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands (copy)');
  const other = page.locator('.shortalert .decklink', { hasText: /^Tatyova Lands$/ }).first();
  await other.scrollIntoViewIfNeeded();
  await other.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands');
  // …and from the Decks list's warning
  await page.locator('.backlink').click();
  const copy = page.locator('.shortalert .decklink', { hasText: 'Tatyova Lands (copy)' }).first();
  await copy.scrollIntoViewIfNeeded();
  await copy.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands (copy)');
});

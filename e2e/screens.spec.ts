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

// The deck menu opens from the deck header: right-click with a mouse, press and hold on touch.
const deckMenu = async (page: import('@playwright/test').Page, item?: string) => {
  const h1 = page.locator('.dhero h1');
  await h1.scrollIntoViewIfNeeded();
  if (page.viewportSize()!.width >= 1200) await h1.click({ button: 'right' });
  else {
    const b = (await h1.boundingBox())!;
    await h1.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b.x + 20, clientY: b.y + 20, isPrimary: true });
    await page.waitForTimeout(650);
    await h1.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
  }
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await page.waitForTimeout(250); // let the drop-in animation finish before measuring
  await fits(page, ['.deckmenu']);
  if (item) await menu.getByRole('menuitem', { name: item }).click();
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
  await deckMenu(page);
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

test('Deck page: GROUP holds the show-only filter; Analysis folds on phones and tablets', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dtools .sbox')).toHaveCount(2);
  await fits(page, ['.lists > .dtools']);
  const group = page.locator('.dtools select').first();
  await group.selectOption('show:missing'); // every seeded card is owned
  await expect(page.locator('details.cat')).toHaveCount(0);
  await expect(group.locator('option:checked')).toHaveText('CARD TYPE · MISSING');
  await group.selectOption('show:all');
  await expect(page.locator('details.cat').first()).toBeVisible();
  const curve = page.locator('.dpanel .curve, .dpanel .dsec').first();
  if (info.project.name === 'desktop') await expect(curve).toBeVisible();
  else {
    await expect(curve).toBeHidden();
    await page.locator('.dfold').click();
    await expect(curve).toBeVisible();
  }
});

test('Decks list: right-click / hold a deck opens the deck menu (duplicate, share, delete…)', async ({ page }) => {
  await go(page, 'decks');
  const tile = page.locator('.dcard').first();
  if (page.viewportSize()!.width >= 1200) await tile.click({ button: 'right' });
  else {
    const b = (await tile.boundingBox())!;
    await tile.dispatchEvent('pointerdown', { pointerType: 'touch', clientX: b.x + 30, clientY: b.y + 30, isPrimary: true });
    await page.waitForTimeout(650);
    await tile.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true });
  }
  const menu = page.getByRole('menu', { name: 'Tatyova Lands options' });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: /Share|Copy decklist/ })).toBeVisible();
  await page.waitForTimeout(250);
  await fits(page, ['.deckmenu']);
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click();
  // duplicating from the list opens the copy
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands (copy)');
});

for (const [ok, text, name] of [[true, /Buzz sent/, 'sent'], [false, /blocked/, 'blocked']] as const) {
  test(`Haptics button: sends a test buzz and says what happened (${name})`, async ({ page }) => {
    await page.addInitScript((v) => { (window as any).__buzz = []; navigator.vibrate = (p) => ((window as any).__buzz.push(p), v); }, ok);
    await page.goto('/');
    await page.locator('.hubtab').click();
    const btn = page.getByRole('button', { name: /Haptic feedback/ });
    await btn.click(); // on by default: this turns it off
    await expect(page.locator('.hapnote')).toHaveText('Haptics off.');
    await btn.click(); // turn on again: test buzz
    await expect(page.locator('.hapnote')).toContainText(text);
    expect(await page.evaluate(() => (window as any).__buzz.length)).toBeGreaterThan(0);
    await fits(page, ['.hapnote']);
  });
}

test('Commander page (Discover): sections in order with count + cost, grid/list in the commander section, two filters', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('details.cat').first()).toBeVisible();
  // order: Commander, Creatures, Instants, Sorceries, Enchantments, Artifacts, Lands (no planeswalkers in the sample deck)
  const heads = await page.locator('details.cat > summary .h').allInnerTexts();
  expect(heads.map((h) => h.replace(/\s*\(\d+\)\s*$/, ''))).toEqual(['COMMANDER', 'CREATURES', 'INSTANTS', 'SORCERIES', 'ENCHANTMENTS', 'ARTIFACTS', 'LANDS']);
  expect(heads[0]).toMatch(/\(1\)$/);
  expect(heads.at(-1)).toMatch(/\(20\)$/); // 10 Forest + 10 Island
  // every section shows what its cards cost
  await expect(page.locator('details.cat > summary .gval')).toHaveCount(7);
  await expect(page.locator('details.cat').first().locator('.gval')).toContainText('CA$');
  // two filter boxes above the cards, grid / list in the first section
  await expect(page.locator('.lists > .dtools .sbox')).toHaveCount(2);
  await fits(page, ['.lists > .dtools']);
  const sw = page.locator('details.cat').first().locator('.viewsw.mini');
  await expect(sw).toBeVisible();
  await fits(page, ['.viewsw.mini']);
  await sw.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.zlist').first()).toBeVisible();
  await sw.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/commander-sections.png' });
});

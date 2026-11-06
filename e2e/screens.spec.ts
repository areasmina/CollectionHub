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
  if (info.project.name === 'phone') {
    // the big eye behind the title bleeds past the letters; the title clips it at its own edges
    expect(await page.locator('.hero .titlewrap').evaluate((e) => getComputedStyle(e).overflowX)).toBe('clip');
    await fits(page, ['.hero .titlewrap', '.hero .fpanel', '.ccard']);
  } else await fits(page, ['.hero .titlewrap', '.hero .fpanel', '.eyedoodle', '.ccard']);
});

test('Commander page: header stats, tags row stays inside its frame', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('.chero h1')).toBeVisible();
  await expect(page.locator('.hstats .price')).toBeVisible();
  const row = await page.locator('.chero .hscroll').boundingBox();
  const frame = await page.locator('.chero').boundingBox();
  expect(row!.x + row!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1);
  // EDHREC's top 6 tags, the rest behind +N MORE
  await expect(page.locator('.chero .hscroll button:not(.tagmore)')).toHaveCount(6);
  await page.locator('.tagmore').click();
  await expect(page.locator('.chero .hscroll button:not(.tagmore)')).toHaveCount(10);
  await page.locator('.tagmore').click();
  await fits(page, ['.chero', '.strip']);
});

test('Commander header on a wide screen: one tidy row of tags', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 2000, height: 1100 });
  await page.locator('.ccard').first().click();
  await expect(page.locator('.tagmore')).toHaveText('+4 MORE');
  const ys = await page.locator('.chero .hscroll button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBe(1);
  await page.screenshot({ path: '/mnt/project-files/ui-review/screens/phone-round/6-commander-tags-wide.png', clip: { x: 0, y: 0, width: 2000, height: 760 } });
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
  // grid / list sits in the toolbar above the cards (the commander's section is gone: its big card is the menu)
  const sw = page.locator('.dtools .viewsw.mini');
  await expect(page.locator('details.cat > summary .h', { hasText: 'COMMANDER' })).toHaveCount(0);
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
  // the warning leads the Forge line, which turns yellow; tapping ⚠ N SHORT opens its list
  await expect(page.locator('.forgehint.warn .shortin')).toBeVisible();
  await page.locator('.shortin summary').first().click();
  const other = page.locator('.shortin .decklink', { hasText: /^Tatyova Lands$/ }).first();
  await other.scrollIntoViewIfNeeded();
  await other.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands');
  // …and from the Decks list's warning
  await page.locator('.backlink').click();
  await page.locator('.shortalert summary').first().click();
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
    await page.locator('.pillhub').click();
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
  expect(heads.map((h) => h.replace(/\s*\(\d+\)\s*$/, ''))).toEqual(['CREATURES', 'INSTANTS', 'SORCERIES', 'ENCHANTMENTS', 'ARTIFACTS', 'LANDS']);
  // no one-card Commander section, and the match % shows once (the strip's bar, not by the title)
  await expect(page.locator('.chero .bigpct')).toHaveCount(0);
  await expect(page.locator('.strip .match .num')).toContainText('%');
  expect(heads.at(-1)).toMatch(/\(20\)$/); // 10 Forest + 10 Island
  // every section shows what its cards cost
  await expect(page.locator('details.cat > summary .gval')).toHaveCount(6);
  await expect(page.locator('details.cat').first().locator('.gval')).toContainText('CA$');
  // two filter boxes above the cards, grid / list in the first section
  await expect(page.locator('.lists > .dtools .sbox')).toHaveCount(2);
  await fits(page, ['.lists > .dtools']);
  const sw = page.locator('.dtools .viewsw.mini');
  await expect(sw).toBeVisible();
  await fits(page, ['.viewsw.mini']);
  await sw.getByRole('button', { name: 'List view' }).click();
  await expect(page.locator('ul.zlist').first()).toBeVisible();
  await sw.getByRole('button', { name: 'Grid view' }).click();
  await expect(page.locator('ul.zgrid').first()).toBeVisible();
  // the big commander card is its menu
  await page.getByRole('button', { name: /commander options/ }).click();
  await expect(page.locator('.cardmenu')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.screenshot({ path: 'test-results/commander-sections.png' });
});

test('Reload: commander stats come back from the device, no EDHREC requests', async ({ page }) => {
  await expect(page.locator('.ccard[aria-label*="% owned"]').first()).toBeVisible();
  await page.waitForTimeout(500); // let the save land
  const asked: string[] = [];
  page.on('request', (r) => r.url().includes('json.edhrec.com/pages/average-decks') && asked.push(r.url()));
  await page.reload();
  await expect(page.locator('.ccard[aria-label*="% owned"]').first()).toBeVisible();
  await expect(page.locator('.progress', { hasText: 'Checking EDHREC' })).toHaveCount(0);
  expect(asked).toEqual([]);
});

test('Commander page: an old saved page shows at once even when EDHREC is down', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await expect(page.locator('.hstats .price')).toBeVisible(); // its EDHREC pages are saved by now
  // Age every saved page past a day, cut EDHREC off, reopen.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const st = db.transaction('edhrec', 'readwrite').objectStore('edhrec');
    const all: any[] = await new Promise((ok) => (st.getAll().onsuccess = (e: any) => ok(e.target.result)));
    for (const r of all) st.put({ ...r, at: r.at - 3 * 864e5 });
  });
  await page.unroute(/json\.edhrec\.com/);
  await page.route(/json\.edhrec\.com/, (r) => r.abort());
  await page.reload();
  await page.locator('.ccard').first().click();
  await expect(page.locator('.chero h1')).toBeVisible();
  await expect(page.locator('.hstats .price')).toBeVisible();
});

test('Swap window: every card swaps, search your binder, undo, pins', async ({ page }, info) => {
  // One more card in the binder that the deck doesn't use.
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['cards', 'entries'], 'readwrite');
    const id = 'aaaaaaaa-1111-2222-3333-000000000099';
    tx.objectStore('cards').put({ id, name: 'Arcane Signet', key: 'arcane signet', type: 'Artifact', text: '{T}: Add one mana.', ci: [], img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: '0.50', cmc: 2, legal: true, pv: 2, at: Date.now() });
    tx.objectStore('entries').put({ profile: 1, cardId: id, name: 'Arcane Signet', qty: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload(); // Dexie's query cache doesn't see writes made outside it
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await expect(note).toBeVisible();
  await expect(note.getByText('top 3 from your binder')).toBeVisible();
  // Arcane Signet: yours, played with this commander on EDHREC, not in the deck: first of the top 3
  await expect(note.locator('.picks > ul:not(.found) button').first()).toContainText('Arcane Signet');
  await fits(page, ['.swapnote']);
  await page.screenshot({ path: `test-results/swap-top3-${info.project.name}.png` });
  await note.locator('.picks > ul:not(.found) button', { hasText: 'Arcane Signet' }).click();
  await expect(page.locator('.swapmark', { hasText: '↔ for Sol Ring' })).toBeVisible();
  // Pin the new card in, then undo the swap from its window
  await page.getByRole('button', { name: 'Swap Arcane Signet (in place of Sol Ring)' }).click();
  await page.getByRole('dialog', { name: 'Swap Arcane Signet' }).getByRole('button', { name: '📌 ALWAYS IN' }).click();
  await expect(page.locator('.pinchip', { hasText: 'Arcane Signet' })).toBeVisible();
  await page.locator('.pinchip', { hasText: 'Arcane Signet' }).click();
  await expect(page.locator('.pinchip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Swap Arcane Signet (in place of Sol Ring)' }).click();
  await page.getByRole('button', { name: /UNDO/ }).click();
  await expect(page.locator('.swapmark', { hasText: 'for Sol Ring' })).toHaveCount(0);
  // Never use: no other card of yours fits, so Sol Ring stays, marked, and the pin can be taken off
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).getByRole('button', { name: '💀 NEVER USE' }).click();
  await expect(page.locator('.pinchip', { hasText: 'Sol Ring' })).toBeVisible();
  await page.locator('.pinchip', { hasText: 'Sol Ring' }).click();
  await expect(page.locator('.pinchip')).toHaveCount(0);
});

test('My decks in Collection + Forge: FORGE IT opens the deck, swap window in the Forge', async ({ page }) => {
  await expect(page.locator('.pillnav .pill button')).toHaveText(['DISCOVER', 'COLLECTION']);
  await expect(page.locator('.shelf')).toHaveCount(0); // Discover stays commanders only
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: '⚒ FORGE IT' }).click();
  await expect(page.locator('.forgehint')).toBeVisible();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await expect(note.getByRole('button', { name: '📌 ALWAYS IN' })).toBeVisible();
  await note.getByRole('searchbox', { name: 'Search your binder' }).fill('cob');
  await expect(note.getByText(/No card of yours/).last()).toBeVisible();
  await note.getByRole('button', { name: 'Close' }).click();
  // My decks sit on the Collection page and open the deck too
  await go(page, 'collection');
  await expect(page.locator('.shelf li')).toHaveCount(2);
  await fits(page, ['.shelf']);
  await page.locator('.shelf li button').first().click();
  await expect(page.locator('.forgehint')).toBeVisible();
});

test('One card menu: ⋯ / right-click on commander page and Collection cards, same items', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'More for Sol Ring' }).click();
  const m = page.getByRole('menu', { name: 'Sol Ring options' });
  await expect(m.getByRole('button', { name: /Swap…/ })).toBeVisible();
  await expect(m.getByRole('button', { name: '💀 Never use' })).toBeVisible();
  await expect(m.getByText('also in:')).toBeVisible();
  await page.waitForTimeout(300); // the menu drops in with a small tilt first
  await fits(page, ['.cardmenu']);
  await m.getByRole('button', { name: /Swap…/ }).click();
  await expect(page.getByRole('dialog', { name: 'Swap Sol Ring' })).toBeVisible();
  await go(page, 'collection');
  await page.locator('li', { hasText: 'Sol Ring' }).first().click({ button: 'right' });
  const c = page.getByRole('menu', { name: 'Sol Ring options' });
  await expect(c.getByRole('button', { name: /Remove one from binder/ })).toBeVisible();
  await expect(c.getByRole('button', { name: /Swap…/ })).toHaveCount(0);
});

test('Swap window: drag a suggestion onto the card to swap (mouse)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'drag is for a mouse; touch taps');
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['cards', 'entries'], 'readwrite');
    const id = 'aaaaaaaa-1111-2222-3333-000000000099';
    tx.objectStore('cards').put({ id, name: 'Arcane Signet', key: 'arcane signet', type: 'Artifact', text: '', ci: [], cmc: 2, legal: true, pv: 2, at: Date.now() });
    tx.objectStore('entries').put({ profile: 1, cardId: id, name: 'Arcane Signet', qty: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  await note.locator('.picks button', { hasText: 'Arcane Signet' }).dragTo(note.locator('.viewer'));
  await expect(page.locator('.swapmark', { hasText: '↔ for Sol Ring' })).toBeVisible();
});

test('Deck light: active decks mark their cards in use in Collection; off frees them', async ({ page }, info) => {
  await go(page, 'collection');
  const sol = page.locator('li', { hasText: 'Sol Ring' }).first();
  await expect(sol.locator('.inuse')).toHaveText('● in 1 deck');
  await page.screenshot({ path: `test-results/light-${info.project.name}.png` });
  await page.locator('.shelf .dlight').first().click();
  await expect(page.locator('.shelf .dlight').first()).toHaveText(/OFF/);
  await expect(sol.locator('.inuse')).toHaveCount(0);
  await page.locator('.shelf .dlight').first().click();
  await expect(sol.locator('.inuse')).toHaveCount(1);
});

test('Forging zone: first swap starts it, leaving asks to save (no / keep / yes)', async ({ page }, info) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['cards', 'entries'], 'readwrite');
    const id = 'aaaaaaaa-1111-2222-3333-000000000099';
    tx.objectStore('cards').put({ id, name: 'Arcane Signet', key: 'arcane signet', type: 'Artifact', text: '', ci: [], cmc: 2, legal: true, pv: 2, at: Date.now() });
    tx.objectStore('entries').put({ profile: 1, cardId: id, name: 'Arcane Signet', qty: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  const swap = async () => {
    await page.locator('.ccard').first().click();
    await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
    await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
    await expect(page.locator('.forgebar')).toContainText('FORGING');
  };
  await swap();
  await page.screenshot({ path: `test-results/forging-${info.project.name}.png` });
  await page.locator('.backlink').click();
  const ask = page.getByRole('alertdialog', { name: 'Save this deck?' });
  await expect(ask).toBeVisible();
  await page.screenshot({ path: `test-results/forging-ask-${info.project.name}.png` });
  await ask.getByRole('button', { name: 'KEEP FORGING' }).click();
  await expect(page.locator('.forgebar')).toBeVisible();
  await page.locator('.backlink').click();
  await ask.getByRole('button', { name: 'NO, DISCARD' }).click();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await swap();
  await page.locator('.backlink').click();
  await ask.getByRole('button', { name: 'YES, SAVE' }).click();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await go(page, 'collection');
  await expect(page.locator('.shelf li', { hasText: 'forged' })).toHaveCount(1);
});

test('Pill menu: back arrow only where there is somewhere to go back to', async ({ page }, info) => {
  const pill = page.locator('.pillnav');
  await expect(pill).toBeVisible();
  await expect(pill.locator('.pback')).toHaveCount(0);
  await page.locator('.ccard').first().click();
  await expect(pill.getByRole('button', { name: 'Back' })).toBeVisible();
  await page.screenshot({ path: `test-results/pill-${info.project.name}.png` });
  await pill.getByRole('button', { name: 'Back' }).click();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await expect(pill.locator('.pback')).toHaveCount(0);
  await pill.locator('.pillhub').click();
  await expect(page.locator('.hubslide')).toHaveClass(/open/);
});

test('Swapping keeps the deck organised: a creature swapped in for a sorcery moves to Creatures', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['cards', 'entries'], 'readwrite');
    const id = 'bbbbbbbb-1111-2222-3333-000000000098';
    tx.objectStore('cards').put({ id, name: 'Elvish Mystic', key: 'elvish mystic', type: 'Creature — Elf Druid', text: '{T}: Add {G}.', ci: ['G'], img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: '0.30', cmc: 1, legal: true, pv: 2, at: Date.now() });
    tx.objectStore('entries').put({ profile: 1, cardId: id, name: 'Elvish Mystic', qty: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await page.locator('.ccard').first().click();
  const section = (h: string) => page.locator('details.cat').filter({ has: page.locator('summary .h', { hasText: h }) });
  await expect(section('Sorceries')).toContainText('Cultivate');
  await page.getByRole('button', { name: 'Swap Cultivate', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Cultivate' });
  await note.getByRole('searchbox', { name: 'Search your binder' }).fill('elvish');
  await note.locator('ul.found button', { hasText: 'Elvish Mystic' }).click();
  await page.keyboard.press('Escape');
  // The creature joins the Creatures; the Sorceries section (Cultivate was its only card) is gone
  await expect(section('Creatures')).toContainText('Elvish Mystic');
  await expect(section('Sorceries')).toHaveCount(0);
});

test('Forge: the big commander card is its menu; Change commander picks a legend from your binder, with undo', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['cards', 'entries'], 'readwrite');
    const id = 'cccccccc-1111-2222-3333-000000000097';
    tx.objectStore('cards').put({ id, name: 'Kinnan, Bonder Prodigy', key: 'kinnan, bonder prodigy', type: 'Legendary Creature — Human Druid', text: 'Whenever you tap a nonland permanent for mana, add one additional mana.', ci: ['G', 'U'], img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: '20.00', cmc: 2, legal: true, pv: 2, at: Date.now() });
    tx.objectStore('entries').put({ profile: 1, cardId: id, name: 'Kinnan, Bonder Prodigy', qty: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await page.getByRole('button', { name: /commander options/ }).click();
  const menu = page.locator('.cardmenu');
  await menu.getByRole('button', { name: /Change commander/ }).click();
  await menu.getByRole('button', { name: /Kinnan, Bonder Prodigy/ }).click();
  await expect(page.locator('.toast')).toContainText('Kinnan, Bonder Prodigy leads the deck now');
  await expect(page.getByRole('button', { name: 'Kinnan, Bonder Prodigy: commander options' })).toBeVisible();
  await page.locator('.toast').getByRole('button', { name: /UNDO/ }).click();
  await expect(page.getByRole('button', { name: 'Tatyova, Benthic Druid: commander options' })).toBeVisible();
});

test('Forge: collection match sits above ANALYSIS, not by the title', async ({ page }) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dhero .bigpct')).toHaveCount(0);
  await expect(page.locator('.dpanel .dmatch .num')).toHaveText(/\d+%/);
  await fits(page, ['.dpanel .dmatch']);
});

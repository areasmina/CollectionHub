import { expect, test } from '@playwright/test';
import { addSignet, edhJson, fits, mockWorld, seed, opts, dash } from './mock';

test.beforeEach(async ({ page }) => {
  await mockWorld(page);
  await seed(page);
});

const go = async (page: import('@playwright/test').Page, tab: 'discover' | 'collection' | 'decks') => {
  await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
  await page.reload();
};

test('Discover (overhaul): loud title + eye + tagline, one toolbar (sort and colours behind ⋮), flat commander grid', async ({ page }, info) => {
  await expect(page.locator('.discohero .titlewrap')).toBeVisible();
  await expect(page.locator('.eyedoodle')).toBeVisible();
  await expect(page.locator('.discohero .tagline')).toHaveText('Your collection. Real decks. No guesswork.');
  // the title answers itself: how many decks this binder can build
  await expect(page.locator('.titlewrap > .tanswer')).toHaveAttribute('aria-label', '1 commander decks you can build');
  // one slim toolbar at every width: search + ⋮ (no FILTERS tag, no taped panel)
  const bar = page.locator('.disc .dfind > .tbar');
  await expect(bar.getByRole('searchbox', { name: 'Search commander' })).toBeVisible();
  await expect(page.locator('.ftag, .fpanel')).toHaveCount(0);
  expect(Math.round((await bar.boundingBox())!.height)).toBeLessThanOrEqual(52);
  await expect(bar.locator('.fnow')).toHaveText(/% OWNED/);
  // flat tiles: no tilt, no tape; name, colour pips, match % with the green meter, decks · price, state
  const card = page.locator('.ccard').first();
  await expect(card).toBeVisible();
  expect(await card.evaluate((e) => getComputedStyle(e).transform)).toBe('none');
  await expect(page.locator('.cgrid .tape, .cgrid .doodle')).toHaveCount(0);
  await expect(card.locator('.nm')).toContainText(/TATYOVA/i);
  await expect(card.locator('.cmatch b')).toHaveText('100%');
  await expect(card.locator('.u-meter i.on')).toHaveCount(10);
  await expect(card.locator('.cfoot')).toContainText('4,321 decks');
  await expect(card.locator('.cstate')).toHaveText('READY');
  // phones: two tiles across
  if (info.project.name === 'phone') {
    const cols = await page.locator('.cgrid').evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length);
    expect(cols).toBe(2);
  }
  await fits(page, ['.discohero', '.dfind', '.ccard']);
  // ⋮ holds SORT and COLOUR; picking a colour the commander lacks filters it out, the title answer says so
  await bar.locator('summary').click();
  await expect(bar.getByRole('radiogroup', { name: 'Sort' })).toBeVisible();
  await expect(bar.locator('.colours button')).toHaveCount(5);
  await fits(page, ['.tbar .fbody']);
  await bar.getByRole('button', { name: 'Red' }).click();
  await expect(page.locator('.ccard')).toHaveCount(0);
  await expect(page.locator('.tanswer')).toHaveAttribute('aria-label', '0 of 1 commanders shown');
  await expect(bar.locator('.fnow')).toContainText('R');
  await bar.getByRole('button', { name: 'Red' }).click();
  // picking a sort does not open a commander (the toolbar sits in the search form)
  await bar.getByRole('radio', { name: 'NAME A→Z' }).click();
  await expect(page.locator('.ccard')).toHaveCount(1);
  await expect(bar.locator('.fnow')).toContainText('NAME A→Z');
  // Enter in the search opens the first match
  await page.keyboard.press('Escape');
  await bar.getByRole('searchbox').fill('taty');
  await bar.getByRole('searchbox').press('Enter');
  await expect(page.locator('.vhero h1')).toBeVisible();
});

test('Deck page (overhaul): hero, one strip, one toolbar; each fact once; themes behind ⋮', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  // hero: name, the quiet meta line, match % (only here)
  await expect(page.locator('.vhero h1')).toBeVisible();
  await expect(page.locator('.vhero .vmeta')).toContainText('4,321 decks');
  await expect(page.locator('.vhero .vmatch .num')).toHaveText('100%');
  // say it once: the match % appears in one place on the page
  expect(await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => !e.children.length && /^\d+%$/.test(e.textContent!.trim())).length)).toBe(1);
  // strip: POWER · status with the deck cost (only here) · PULL / TO BUY · FORGE (the one red slab)
  const strip = page.locator('.dstrip');
  await expect(strip.locator('.power summary')).toContainText('MED · B4');
  await expect(strip.locator('.dcost')).toContainText('deck ≈CA$');
  await expect(page.locator('.dcost')).toHaveCount(1);
  await expect(strip.locator('.u-btn.primary')).toHaveText(/FORGE/);
  await expect(page.locator('.u-btn.primary')).toHaveCount(1);
  if (info.project.name !== 'phone') expect(Math.round((await strip.boundingBox())!.height)).toBe(56);
  // POWER opens its menu; picking a bracket changes the deck's power
  await strip.locator('.power summary').click();
  await strip.getByRole('radiogroup', { name: 'Power' }).getByRole('radio', { name: /MAX/ }).click();
  await expect(strip.locator('.power summary')).toContainText('MAX');
  await page.keyboard.press('Escape');
  // themes (EDHREC's top 6, the rest behind +N MORE) live behind ⋮
  const o = await opts(page);
  const themes = o.locator('.themes[aria-label="EDHREC themes"] button:not(.tagmore)');
  await expect(themes).toHaveCount(6);
  await o.locator('.tagmore').click();
  await expect(themes).toHaveCount(10);
  const landfall = page.waitForResponse((r) => r.url().includes('/landfall'));
  await themes.first().click();
  await landfall; // the theme's EDHREC page arrived
  await expect(page.locator('.dstrip')).toHaveAttribute('aria-busy', 'false'); // the strip stays while it loads, then says it's done
  await expect(page.locator('.lists > .tbar .fnow')).toContainText('#LANDFALL');
  await fits(page, ['.vhero', '.dstrip', '.tbar .fbody']);
  await page.screenshot({ path: `test-results/overhaul-deck-${info.project.name}.png` });
});

test('Commander settings on a wide screen: tags stay compact (two rows at most)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop');
  await page.setViewportSize({ width: 2000, height: 1100 });
  await page.locator('.ccard').first().click();
  const o = await opts(page);
  await expect(o.locator('.tagmore')).toHaveText('+4 MORE');
  const ys = await o.locator('.themes button').evaluateAll((bs) => bs.map((b) => Math.round(b.getBoundingClientRect().top)));
  expect(new Set(ys).size).toBeLessThanOrEqual(2); // rows
  await page.screenshot({ path: 'test-results/commander-tags-wide.png', clip: { x: 0, y: 0, width: 2000, height: 1000 } });
});

test('Collection (overhaul): one ribbon says the facts once, grid tiles with tally marks', async ({ page }) => {
  await go(page, 'collection');
  await expect(page.locator('details.dash')).not.toHaveAttribute('open', ''); // the collection comes first
  // one ribbon: cards · unique · commanders · ≈CA$ worth · decks, then + DECK and IMPORT
  const sum = page.locator('details.dash > summary .dsum');
  await expect(sum).toContainText('20 cards');
  await expect(sum).toContainText('8 unique');
  await expect(sum).toContainText('1 commander');
  await expect(sum).toContainText(/≈CA\$236/);
  await expect(sum).toContainText('1 deck');
  // say it once: no stat tiles or appraisal slip repeat the numbers, and the ribbon stays when the overview is open
  await dash(page);
  await expect(page.locator('.stats, .slip')).toHaveCount(0);
  await expect(sum).toContainText('20 cards');
  await expect(page.locator('main.coll .tape, main.coll .doodle')).toHaveCount(0);
  // IMPORT opens the import box (and keeps the overview open)
  await page.locator('details.dash > summary .dimp').click();
  await expect(page.locator('details.dash')).toHaveAttribute('open', '');
  await expect(page.locator('.importbox textarea')).toBeVisible();
  await fits(page, ['details.dash', '.importbox']);
  await expect(page.locator('.topwidget')).toHaveCount(0); // decks row replaced the top 3
  await expect(page.locator('.ctile').first()).toBeVisible();
  // no name title outside the card; the copy pips sit on the card and show once it's selected (tap / focus / hover)
  await expect(page.locator('.ctile > .tname').first()).toHaveCSS('width', '1px');
  const t = page.locator('.ctile').first();
  await expect(t.locator('.tally')).toHaveCSS('opacity', '0');
  await t.focus();
  await expect(t.locator('.tally')).toHaveCSS('opacity', '1');
  await expect(t.locator('.price')).toHaveCSS('opacity', '1');
  // the tally strip opens and changes the quantity
  await t.locator('.tally .marks').click();
  const n = Number(await t.locator('.tstep b').innerText());
  await t.locator('.tstep button').last().click();
  await expect(t.locator('.tstep b')).toHaveText(String(n + 1));
  await fits(page, ['.ctile', 'details.dash']);
});

test('Deck page: header, toolbar, analysis and the card menu', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dpanel')).toBeVisible();
  // grid / list sits in the toolbar above the cards (the commander's section is gone: its big card is the menu)
  await expect(page.locator('details.cat > summary .h', { hasText: 'COMMANDER' })).toHaveCount(0);
  const sw = (await opts(page)).locator('.viewsw.mini');
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
  // measure where it lands, not mid-way through its 0.18 s drop-in (rotated, so its box pokes past the edge on slow runners)
  await page.locator('.cardmenu').evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
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
  await page.locator('.forgetop .fleave').click();
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
  await expect(page.locator('.dstrip .shortin')).toBeVisible();
  await page.locator('.shortin summary').first().click();
  const other = page.locator('.shortin .decklink', { hasText: /^Tatyova Lands$/ }).first();
  await other.scrollIntoViewIfNeeded();
  await other.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands');
  // …and from the Decks list's warning
  await page.locator('.forgetop .fleave').click();
  await page.locator('.shortalert summary').first().click();
  const copy = page.locator('.shortalert .decklink', { hasText: 'Tatyova Lands (copy)' }).first();
  await copy.scrollIntoViewIfNeeded();
  await copy.click();
  await expect(page.locator('.dhero h1')).toHaveAttribute('aria-label', 'Tatyova Lands (copy)');
});

test('Deck page: GROUP holds the show-only filter; Analysis folds on phones and tablets', async ({ page }, info) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dtools .sbox')).toHaveCount(4); // search + three filters (in the ⋮ options)
  await fits(page, ['.lists > .dtools']);
  await opts(page);
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
    await go(page, 'collection');
    await page.locator('.bmbtn').click(); // haptics live in the binder menu (no hamburger)
    const btn = page.getByRole('menuitemcheckbox', { name: /Haptics/ });
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
  await expect(page.locator('.vhero .vmatch .num')).toContainText('%');
  expect(heads.at(-1)).toMatch(/\(20\)$/); // 10 Forest + 10 Island
  // every section shows what its cards cost
  await expect(page.locator('details.cat > summary .gval')).toHaveCount(6);
  await expect(page.locator('details.cat').first().locator('.gval')).toContainText('CA$');
  // two filter boxes above the cards, grid / list in the first section
  await expect(page.locator('.lists > .dtools .sbox')).toHaveCount(6); // search first, then the filters (in the ⋮ options)
  await fits(page, ['.lists > .dtools']);
  const sw = (await opts(page)).locator('.viewsw.mini');
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
  await expect(page.locator('.dstrip .dcost')).toBeVisible(); // its EDHREC pages are saved by now
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
  await expect(page.locator('.vhero h1')).toBeVisible();
  await expect(page.locator('.dstrip .dcost')).toBeVisible();
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
  // pins sit behind ⋮ (the bar says how many), each one tap to unpin
  await expect(page.locator('.lists > .tbar .fnow')).toContainText('1 PINNED');
  await (await opts(page)).locator('.pinchip', { hasText: 'Arcane Signet' }).click();
  await expect(page.locator('.pinchip')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Swap Arcane Signet (in place of Sol Ring)' }).click();
  await page.getByRole('button', { name: /UNDO back to/ }).click();
  await expect(page.locator('.swapmark', { hasText: 'for Sol Ring' })).toHaveCount(0);
  // Never use: no other card of yours fits, so Sol Ring stays, marked, and the pin can be taken off
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).getByRole('button', { name: '💀 NEVER USE' }).click();
  await (await opts(page)).locator('.pinchip', { hasText: 'Sol Ring' }).click();
  await expect(page.locator('.pinchip')).toHaveCount(0);
});

test('My decks in Collection + Forge: a swap starts the Forge, SAVE DECK opens the deck, swap window in the Forge', async ({ page }) => {
  await expect(page.locator('.pillnav .pill button')).toHaveText(['DISCOVER', 'DECKS', 'COLLECTION']);
  await expect(page.locator('.shelf')).toHaveCount(0); // Discover stays commanders only
  await addSignet(page);
  await page.locator('.ccard').first().click();
  await expect(page.locator('.slimbar .btn.forge')).toHaveCount(0); // no FORGE IT button: the first swap starts the Forge
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.picks button', { hasText: 'Arcane Signet' }).click();
  await page.locator('.forgetop .btn.forge').click();
  await expect(page.locator('.forgehint')).toBeVisible();
  await page.getByRole('button', { name: 'Swap Counterspell', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Counterspell' });
  await expect(note.getByRole('button', { name: '📌 ALWAYS IN' })).toBeVisible();
  await note.getByRole('searchbox', { name: 'Search your binder' }).fill('cob');
  await expect(note.getByText(/No card of yours/).last()).toBeVisible();
  await note.getByRole('button', { name: 'Close' }).click();
  // My decks sit on the Collection page and open the deck too
  await go(page, 'collection');
  await dash(page);
  await expect(page.locator('.shelf li:not(.seeall)')).toHaveCount(2);
  await expect(page.locator('.shelf li.seeall')).toHaveCount(1);
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
  await expect(sol.locator('.inuse')).toHaveText('in 1 deck');
  await expect(sol.locator('.inuse i')).toHaveCount(1); // one dot, in the deck's colour
  await page.screenshot({ path: `test-results/light-${info.project.name}.png` });
  await dash(page);
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
    await expect(page.locator('.forgetop')).toContainText('FORGE');
  };
  await swap();
  await page.screenshot({ path: `test-results/forging-${info.project.name}.png` });
  await page.locator('.forgetop .fleave').click();
  const ask = page.getByRole('alertdialog', { name: 'Save this deck?' });
  await expect(ask).toBeVisible();
  await page.screenshot({ path: `test-results/forging-ask-${info.project.name}.png` });
  await ask.getByRole('button', { name: 'KEEP FORGING' }).click();
  await expect(page.locator('.forgetop')).toBeVisible();
  await page.locator('.forgetop .fleave').click();
  await ask.getByRole('button', { name: 'DISCARD', exact: true }).click();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await swap();
  await page.locator('.forgetop .fleave').click();
  await ask.getByRole('button', { name: 'SAVE', exact: true }).click();
  await expect(page.locator('.ccard').first()).toBeVisible();
  await go(page, 'collection');
  await dash(page);
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
  await expect(pill.locator('.pillhub')).toHaveCount(0); // no hamburger: sync and haptics are in the binder menu
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

test('Saved deck (overhaul): same hero and strip as the commander page, each fact once', async ({ page }) => {
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  // THE_OVERHAUL rule 3: the match % lives in the hero, nowhere else
  await expect(page.locator('.dhero .vmatch .num')).toHaveText('100%');
  await expect(page.locator('.dpanel .dmatch')).toHaveCount(0);
  await expect(page.locator('.dhero .vmeta')).toContainText('46 cards');
  await expect(page.locator('.dhero .vmeta')).toContainText('40 lands');
  // the strip: the deck's price and what's missing, once
  await expect(page.locator('.dstrip .dcost')).toHaveText(/^deck ≈CA\$/);
  await expect(page.locator('.dstrip .dstatus')).toContainText('every card is yours');
  await expect(page.locator('.dpanel .misscost')).toHaveCount(0);
  // flat: no decoration on the hero or the side panel
  await expect(page.locator('.dhero .stamp, .dhero .tape, .dpanel .tape')).toHaveCount(0);
  const shadow = await page.locator('.dpanel').evaluate((e) => getComputedStyle(e).boxShadow);
  expect(shadow).toBe('none');
  await fits(page, ['.dhero', '.dstrip', '.dpanel']);
});

test('My decks (overhaul): one ribbon of facts, flat tiles, flat add form', async ({ page }) => {
  await go(page, 'decks');
  const ribbon = page.getByRole('region', { name: 'Deck collection overview' });
  await expect(ribbon).toContainText('1 deck in');
  await expect(ribbon).toContainText('1 ready to play');
  await expect(ribbon).toContainText('avg power');
  const tile = page.locator('.dcard').first();
  await expect(tile.locator('.cmatch b')).toHaveText('100%');
  await expect(tile.locator('.cstate.ready')).toHaveText('READY');
  await expect(tile.locator('.u-meter i')).toHaveCount(10);
  const t = await tile.evaluate((e) => getComputedStyle(e).transform);
  expect(t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)').toBe(true);
  await expect(page.locator('.dlist .stamp, .dlist .doodles, .addpage .holes')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '⚒ NEW BLANK DECK' })).toBeVisible();
  await fits(page, ['.decksbar', '.dribbon', '.dgrid', '.addpage']);
});

test('My decks shelf: a long deck name never makes its tile bigger', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({ profile: 1, name: 'Tatyova, Benthic Druid, Queen of the Endless Landfall Engine (EDHREC average)', commander: 'Tatyova, Benthic Druid', cards: [{ name: 'Sol Ring', qty: 1 }], updated: Date.now() + 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await go(page, 'collection');
  await dash(page);
  await expect(page.locator('.shelf li:not(.seeall)')).toHaveCount(2);
  await expect(page.locator('.shelf li.seeall')).toHaveCount(1);
  const ws = await page.locator('.shelf li:not(.seeall)').evaluateAll((ls) => ls.map((l) => Math.round(l.getBoundingClientRect().width)));
  expect(new Set(ws).size).toBe(1);
});

test('EDHREC With / Without card: self-testing filter, honest fallback', async ({ page }) => {
  await page.locator('.ccard').first().click();
  await page.locator('.fsheet > summary').click();
  // 1) EDHREC ignores the filter (same deck count): we say so and leave the card out locally
  await page.getByLabel('Without card').fill('Sol Ring');
  await page.getByRole('button', { name: 'APPLY' }).click();
  await expect(page.locator('.cfnote')).toContainText("EDHREC didn't filter");
  await expect(page.locator('.cfnote a')).toHaveAttribute('href', /edhrec\.com\/commanders\/.*\?f=out%3DSol%20Ring/);
  // 2) EDHREC filters (deck count changes): suggestions come from those decks
  await page.route(/json\.edhrec\.com\/pages\/commanders\/.*\?f=/, (r) => r.fulfill({ json: edhJson(529) }));
  await page.getByRole('button', { name: 'CLEAR' }).click();
  await page.getByLabel('With card').fill('Rhystic Study');
  await page.getByRole('button', { name: 'APPLY' }).click();
  await expect(page.locator('.cfnote')).toContainText('Suggestions from 529 EDHREC decks with Rhystic Study');
});

test('A + D: coverage line under the bar; OWNED ONLY fills missing slots; BUY UNDER marks, never removes', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const cov = page.locator('.dstrip .dstatus');
  await expect(cov).toContainText('from your binder');
  await expect(page.locator('.dstrip .power summary')).toContainText('MED · B4'); // decks open at MED power, MAX budget
  await expect(page.locator('.lists > .tbar .fnow')).toContainText('3RD GEAR');
  const before = await cov.innerText();
  const o = await opts(page);
  await o.getByRole('radiogroup', { name: 'Cards' }).getByRole('radio', { name: 'OWNED ONLY' }).click();
  await expect(cov).toContainText('owned only');
  const after = await cov.innerText();
  const buy = (t: string) => Number(/(\d+) to buy/.exec(t)?.[1] ?? 0);
  expect(buy(after)).toBeLessThanOrEqual(buy(before));
  await o.getByRole('radiogroup', { name: 'Buy under' }).getByRole('radio', { name: 'ANY' }).click();
  await fits(page, ['.lists']);
  await page.screenshot({ path: `test-results/ad-${info.project.name}.png` });
});

test('C: the swap window says "in <deck>" when another deck uses the copy (no "free" chip)', async ({ page }, info) => {
  await addSignet(page);
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['decks'], 'readwrite');
    tx.objectStore('decks').put({ profile: 1, name: 'Atraxa Rocks', commander: 'Atraxa, Praetors\' Voice', cards: [{ name: 'Arcane Signet', qty: 1 }], updated: 1 });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await page.reload();
  await page.locator('.ccard').first().click();
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  const note = page.getByRole('dialog', { name: 'Swap Sol Ring' });
  const signet = note.locator('.picks > ul:not(.found) button', { hasText: 'Arcane Signet' }).first();
  await expect(signet.locator('.inchip')).toHaveText(/in Atraxa Rocks/);
  await expect(note.locator('.inchip', { hasText: 'free' })).toHaveCount(0);
  await fits(page, ['.swapnote']);
  await page.screenshot({ path: `test-results/c-chip-${info.project.name}.png` });
});

test('B: the TO BUY receipt flips to a PULL list of your cards, and prints', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  // nothing to buy: the strip's button says PULL and opens the drawer (a bottom sheet on phones)
  await page.locator('.dstrip .tobuy').click();
  const sheet = page.getByRole('dialog', { name: 'Pull list' });
  await expect(sheet).toBeVisible();
  if (info.project.name !== 'phone') expect(Math.round((await sheet.boundingBox())!.width)).toBe(360);
  const r = sheet.locator('aside.receipt');
  await expect(r).toBeVisible();
  await r.getByRole('button', { name: 'PULL' }).click();
  await expect(r.locator('h2')).toHaveText('*** PULL LIST ***');
  await expect(r.locator('li').first()).toBeVisible();
  await r.locator('li input').first().check();
  await expect(r.locator('.total')).toContainText('1/');
  await page.evaluate(() => ((window as any).printed = 0, (window.print = () => ((window as any).printed += 1))));
  await r.getByRole('button', { name: 'Print this list' }).click();
  expect(await page.evaluate(() => (window as any).printed)).toBe(1);
  await expect(page.locator('html.printing')).toHaveCount(1);
  await fits(page, ['aside.receipt']);
  await page.screenshot({ path: `test-results/b-pull-${info.project.name}.png` });
});

test('Readiness + Bracket Fit tiles beside Match; the swap window says why the card is in', async ({ page }, info) => {
  await page.locator('.ccard').first().click();
  const tiles = page.locator('.vhero .vtiles');
  await expect(tiles.locator('.vtile.ready summary')).toContainText(/READY|ALMOST|NOT READY|NOT LEGAL/);
  await expect(tiles.locator('.vtile.fit summary')).toContainText(/FITS|PLAYS/);
  await tiles.locator('.vtile.ready summary').click();
  await expect(tiles.locator('.vtile.ready .vpop li').first()).toBeVisible();
  await fits(page, ['.vtiles', '.vtile.ready .vpop']);
  await page.screenshot({ path: `test-results/ready-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Swap Sol Ring', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Swap Sol Ring' }).locator('.whycard .wh')).toContainText(/EDHREC|binder|swap|Pinned/);
  // the saved deck shows the same tiles in its analysis
  await go(page, 'decks');
  await page.locator('.dcard').first().click();
  await expect(page.locator('.dhero .vtile.ready')).toBeVisible();
});

test('Platform space pass: multi-column open deck categories on wide screens, side-by-side workbench on tablet and desktop', async ({ page }, info) => {
  await page.evaluate(() => localStorage.setItem('ch:view', 'grid'));
  await page.locator('.ccard').first().click();
  const cats = page.locator('details.cat[open]');
  await expect(cats.first()).toBeVisible();
  if (info.project.name !== 'phone') {
    // On tablet and desktop, small 1-card grid categories share a horizontal row instead of each taking 100% width
    const [c0, c1] = await Promise.all([cats.nth(0).boundingBox(), cats.nth(1).boundingBox()]);
    expect(Math.abs(c0!.y - c1!.y)).toBeLessThan(12);
    expect(c1!.x).toBeGreaterThan(c0!.x + c0!.width - 2);
    // The deck takes the full width: TO BUY / PULL is a drawer now, not a column beside it
    const [lists, strip] = await Promise.all([page.locator('.deckgrid > .lists').boundingBox(), page.locator('.dstrip').boundingBox()]);
    expect(Math.abs(lists!.width - strip!.width)).toBeLessThan(4);
    await expect(page.locator('aside.receipt')).toHaveCount(0);
  }
  await fits(page, ['.deckgrid', '.lists']);
});

test('Add a deck with 0 saved decks: + DECK on closed overview and + ADD A DECK in MY DECKS open the Decks page', async ({ page }) => {
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction('decks', 'readwrite');
    tx.objectStore('decks').clear();
    await new Promise((ok) => (tx.oncomplete = ok));
  });
  await go(page, 'collection');
  // Closed overview fold shows + DECK right next to IMPORT
  await expect(page.locator('details.dash > summary .ddeck')).toHaveText('+ DECK');
  await dash(page);
  // Inside the open overview, MY DECKS (0) has a + ADD A DECK button even when 0 decks exist
  const addBtn = page.locator('.shelfhead .adddeckbtn');
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await expect(page.locator('.addpage h2')).toHaveText('ADD A DECK');
});

test('Deck vs Collection separation: MY DECKS never hosts Collection Import, and adding a deck never adds cards to the collection binder', async ({ page }) => {
  await go(page, 'collection');
  await dash(page);
  // Collection Import is a separate section, never nested inside the MY DECKS shelf
  await expect(page.locator('.shelf .importbox')).toHaveCount(0);
  const beforeEntries = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  // Pasting a deck list into Collection Import warns and offers to save as a deck instead without touching entries
  const box = page.locator('.importbox');
  if (!(await box.evaluate((e) => (e as HTMLDetailsElement).open))) await box.locator('summary').click();
  await box.locator('textarea').fill('Commander\n1 Tatyova, Benthic Druid\n\nDeck\n1 Counterspell');
  await expect(box.locator('.deckwarn')).toBeVisible();
  await box.locator('.deckwarn button', { hasText: 'SAVE AS A DECK INSTEAD' }).click();
  await expect(page.locator('.dhero h1')).toBeVisible();
  const afterEntries = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    return new Promise<number>((ok) => (db.transaction('entries').objectStore('entries').count().onsuccess = (e: any) => ok(e.target.result)));
  });
  expect(afterEntries).toBe(beforeEntries);
});


test('Cohesive UI overhaul: 3-tab pill nav (DISCOVER · DECKS · COLLECTION), 1-click FORGE & EDIT on Commander, and DECKS workbench actions', async ({ page }) => {
  await expect(page.locator('.pillnav .pill button')).toHaveText(['DISCOVER', 'DECKS', 'COLLECTION']);
  // Open Commander and click ⚒ FORGE & EDIT directly without needing a swap first
  await page.locator('.ccard').first().click();
  const forgeBtn = page.locator('.dstrip .u-btn.primary', { hasText: 'FORGE' });
  await expect(forgeBtn).toBeVisible();
  await forgeBtn.click();
  await expect(page.locator('.forgetop')).toContainText('FORGE');
  // Leaving without any edits exits Forge cleanly without an unsaved-changes dialog
  await page.locator('.forgetop .fleave').click();
  await expect(page.locator('.forgetop')).toHaveCount(0);
  // Tap DECKS in the global pill nav to jump straight to MY DECKS from anywhere
  await page.locator('.pillnav .pill button', { hasText: 'DECKS' }).click();
  await expect(page.locator('.decksbar')).toBeVisible();
  await expect(page.locator('.decksactions button', { hasText: 'NEW BLANK DECK' })).toBeVisible();
});

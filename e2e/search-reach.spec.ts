import { expect, test, type Page } from '@playwright/test';
import { fits, mockWorld } from './mock';

/** A binder big enough to scroll: 300 cards (8 colours/types) and 14 decks, written straight into the local database. */
async function bigBinder(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.pillnav', { state: 'attached' });
  await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['entries', 'decks', 'cards'], 'readwrite');
    const T = ['Creature — Elf', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Land', 'Legendary Creature — Human', 'Planeswalker — Jace'];
    const C = [['G'], ['U'], ['R'], ['B'], ['W'], [], ['G', 'U'], ['B', 'R']];
    for (let i = 0; i < 300; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(i).padStart(12, '0')}`;
      const name = `${['Goblin', 'Elf', 'Angel', 'Dragon', 'Sphinx', 'Zombie', 'Wurm', 'Knight'][i % 8]} ${['Guide', 'Lord', 'Warden', 'Tyrant', 'Seer', 'Rider'][i % 6]} ${i}`;
      tx.objectStore('cards').put({ id, name, key: name.toLowerCase(), type: T[i % 8], text: i % 3 ? 'Draw a card.' : 'Flying, haste', ci: C[i % 8], img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: ((i % 900) / 10).toFixed(2), usdFoil: '1', mana: '{2}', cmc: i % 7, legal: true, pv: 2, at: Date.now() });
      tx.objectStore('entries').put({ profile: 1, cardId: id, name, qty: 1 + (i % 3), set: 'tst', cn: String(i) });
    }
    for (let d = 0; d < 14; d++)
      tx.objectStore('decks').put({ profile: 1, name: `Deck number ${d}`, commander: `Elf Lord ${d * 8 + 1}`, cards: Array.from({ length: 40 }, (_, k) => ({ name: `Goblin Guide ${k * 8}`, qty: 1 })), updated: Date.now() - d * 1000, tags: d % 2 ? ['combo'] : ['casual'] });
    await new Promise((ok) => (tx.oncomplete = ok));
  });
}

/** The search box is on screen, not covered by anything, at least 44px tall and shows the magnifier. */
async function inReach(page: Page, sel: string) {
  const box = page.locator(sel).first();
  await expect(box).toBeInViewport();
  const r = await box.evaluate((i) => {
    const b = i.getBoundingClientRect();
    const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return { by: hit ? `${hit.tagName}.${hit.className}` : "none", top: b.top, h: b.height, clear: hit === i || !!hit?.closest('label')?.contains(i), icon: !!i.closest('label')?.querySelector('.sicon') };
  });
  expect(r.clear, `${sel} is covered by ${r.by}`).toBe(true);
  expect(r.h).toBeGreaterThanOrEqual(44);
  expect(r.top).toBeLessThan(70); // pinned at the top of the screen (under the island when it is docked there), as in ManaBox
  expect(r.icon).toBe(true);
}

for (const [tab, sel] of [
  ['collection', '.coll input[aria-label="Search cards by name or rules text"]'],
  ['discover', '.dfind input[aria-label="Search commander"]'],
  ['decks', '.decktoolbar input[aria-label="Search decks"]'],
] as const) {
  test(`Search in reach (${tab}): the search bar stays pinned at the top while the page scrolls, and still searches`, async ({ page }) => {
    await mockWorld(page);
    await bigBinder(page);
    await page.evaluate((t) => localStorage.setItem('ch:tab', t), tab);
    await page.reload();
    await page.locator(sel).waitFor();
    // keep scrolling down until the page has gone well past the bar (Discover fills in as EDHREC answers)
    await page.waitForFunction(() => (scrollBy(0, 400), scrollY > 1200));
    await page.waitForTimeout(400); // the island and the bar finish moving
    await inReach(page, sel);
    // scrolling back up brings a top-docked island back: the bar steps below it rather than being covered
    await page.evaluate(() => scrollBy(0, -300));
    await page.waitForTimeout(500);
    await inReach(page, sel);
    if (await page.locator('.pillnav.dock-top:not(.away)').count()) {
      const island = (await page.locator('.pillnav').boundingBox())!;
      const bar = (await page.locator(sel).boundingBox())!;
      expect(bar.y).toBeGreaterThanOrEqual(island.y + island.height - 1);
    }
    if (tab === 'collection') {
      // the filter and sort ride along with the search
      await expect(page.locator('.coll .fbtn')).toBeInViewport();
      await expect(page.locator('.coll select[aria-label="Sort cards"]')).toBeInViewport();
      // 13 of the 300 cards are a Dragon Tyrant; each one shown is one of them
      await page.locator(sel).fill('dragon tyrant');
      await expect(page.locator('.coll .ctile')).toHaveCount(13);
      for (const n of await page.locator('.coll .ctile').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? '')))
        expect(n).toMatch(/^Dragon Tyrant \d+$/);
      await fits(page, ['.coll .collbar']);
    }
    if (tab === 'decks') {
      await expect(page.locator('.decktoolbar .dstatuspick .u-chip').first()).toBeInViewport();
      await page.locator(sel).fill('number 13');
      await expect(page.locator('.dtile')).toHaveCount(1);
      await fits(page, ['.decktoolbar', '.decktoolbar .dsearchrow', '.decktoolbar select']);
    }
    if (tab === 'discover') await fits(page, ['.dfind']);
  });
}

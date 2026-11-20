import { expect, test, type Page } from '@playwright/test';
import { mockWorld } from './mock';

/**
 * Big binders stay quick (Phase 5A, Nov 20): the Collection grid skips drawing cards far off screen
 * (content-visibility), so SHOW MORE on a 10,000-card binder no longer takes 10 to 40 seconds on a phone.
 * These checks make sure the shortcut changes nothing you can see: cards keep their exact place, the price tape that
 * reaches past a card's edge is not cut off, and a card scrolled to is drawn with its picture.
 */
const N = 300;
async function bigBinder(page: Page) {
  await mockWorld(page);
  await page.goto('/');
  await page.waitForSelector('.pillnav', { state: 'attached' });
  await page.evaluate(async (N) => {
    const db: IDBDatabase = await new Promise((ok) => (indexedDB.open('collectionhub').onsuccess = (e: any) => ok(e.target.result)));
    const tx = db.transaction(['entries', 'cards'], 'readwrite');
    for (let i = 0; i < N; i++) {
      const id = `${i.toString(16).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(i).padStart(12, '0')}`;
      const name = `Big Binder Card ${String(i).padStart(3, '0')}`;
      tx.objectStore('cards').put({ id, name, key: name.toLowerCase(), type: 'Instant', text: '', ci: ['U'], set: 'tst', cn: String(i), img: `https://cards.scryfall.io/small/front/0/0/${id}.jpg`, usd: '1.50', usdFoil: '3.00', mana: '{U}', cmc: 1, rarity: 'common', legal: true, pv: 4, at: Date.now() });
      tx.objectStore('entries').put({ profile: 1, cardId: id, name, qty: (i % 3) + 1, set: 'tst', cn: String(i), foil: i % 7 === 0 });
    }
    await new Promise((ok) => (tx.oncomplete = ok));
    localStorage.setItem('ch:tab', 'collection');
  }, N);
  await page.reload();
  await expect(page.locator('.cgrid2 > .ctile').first()).toBeVisible();
  await page.locator('button.more').click();
  await expect(page.locator('.cgrid2 > .ctile')).toHaveCount(N);
}

test('Big binder: cards far off screen are skipped, yet every card keeps its exact place', async ({ page }) => {
  await bigBinder(page);
  const tiles = page.locator('.cgrid2 > .ctile');
  // the shortcut is on (every browser the checks run in supports it)
  expect(await tiles.first().evaluate((li) => getComputedStyle(li).contentVisibility)).toBe('auto');
  // a skipped card is exactly as big as a drawn one: the grid's rows don't jump while scrolling
  const sizes = async () => tiles.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height * 4) / 4));
  const before = await sizes();
  expect(new Set(before).size, `card heights differ: ${[...new Set(before)].join(', ')}`).toBe(1);
  const lastTop = () => tiles.last().evaluate((li) => li.getBoundingClientRect().top - li.parentElement!.getBoundingClientRect().top);
  const top = await lastTop();
  await tiles.last().scrollIntoViewIfNeeded();
  const last = tiles.last();
  // the card scrolled to is drawn, with its picture
  await expect(last.locator('img')).toBeVisible();
  await expect.poll(() => last.locator('img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // drawing the cards on the way down moved nothing: the last card sits where it was estimated to be
  expect(Math.abs((await lastTop()) - top)).toBeLessThan(1);
  expect(await sizes()).toEqual(before);
});

test('Big binder: the price tape that reaches past a selected card is drawn whole', async ({ page }, info) => {
  await bigBinder(page);
  const tile = page.locator('.cgrid2 > .ctile').nth(40);
  await tile.scrollIntoViewIfNeeded();
  await tile.focus();
  await tile.hover();
  const tape = tile.locator('.cart > .price');
  await expect(tape).toBeVisible();
  // the tape sticks out past the card's top edge, and the part outside is still there to see and tap
  const probe = await tile.evaluate((li) => {
    const t = li.querySelector('.cart > .price') as HTMLElement;
    const lr = li.getBoundingClientRect();
    const tr = t.getBoundingClientRect();
    const x = tr.left + tr.width / 2;
    const y = (tr.top + Math.max(tr.top, lr.top)) / 2 + 1; // halfway through the part above the card
    const hit = document.elementFromPoint(x, y);
    const room = parseFloat(getComputedStyle(li).overflowClipMargin) || 0;
    const tappable = getComputedStyle(t).pointerEvents !== 'none';
    return { out: Math.max(lr.top - tr.top, tr.right - lr.right), room, hit: !tappable || (!!hit && t.contains(hit)), under: String(hit?.className ?? 'nothing') };
  });
  expect(probe.out, 'the tape no longer reaches past the card (layout changed: update this check)').toBeGreaterThan(1);
  // the card keeps more room past its edge than the tape needs, so nothing of the tape is cut off
  expect(probe.room, 'the card cuts off what reaches past its edge').toBeGreaterThan(probe.out);
  // and the part outside the card is really there: a tap on it lands on the tape
  expect(probe.hit, `the part of the tape past the card is cut off (a tap there lands on: ${probe.under})`).toBe(true);
  await page.screenshot({ path: `test-results/big-binder-tape-${info.project.name}.png` });
});

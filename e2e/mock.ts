import type { Page } from '@playwright/test';

/** Small fake Scryfall / EDHREC world: a few cards, one commander, prices, an exchange rate. */
type C = { name: string; type: string; cmc: number; mana: string; text: string; ci: string[]; usd: string };
const list: C[] = [
  { name: 'Tatyova, Benthic Druid', type: 'Legendary Creature — Merfolk Druid', cmc: 5, mana: '{3}{G}{U}', text: 'Landfall — you gain 1 life and draw a card.', ci: ['G', 'U'], usd: '0.40' },
  { name: 'Sol Ring', type: 'Artifact', cmc: 1, mana: '{1}', text: '{T}: Add {C}{C}.', ci: [], usd: '1.50' },
  { name: 'Cultivate', type: 'Sorcery', cmc: 3, mana: '{2}{G}', text: 'Search your library for up to two basic land cards.', ci: ['G'], usd: '0.40' },
  { name: 'Rhystic Study', type: 'Enchantment', cmc: 3, mana: '{2}{U}', text: 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', ci: ['U'], usd: '38.00' },
  { name: 'Counterspell', type: 'Instant', cmc: 2, mana: '{U}{U}', text: 'Counter target spell.', ci: ['U'], usd: '1.20' },
  { name: 'Lotus Cobra', type: 'Creature — Snake', cmc: 2, mana: '{1}{G}', text: 'Landfall — add one mana of any color.', ci: ['G'], usd: '6.50' },
  { name: 'Forest', type: 'Basic Land — Forest', cmc: 0, mana: '', text: '({T}: Add {G}.)', ci: [], usd: '0.10' },
  { name: 'Island', type: 'Basic Land — Island', cmc: 0, mana: '', text: '({T}: Add {U}.)', ci: [], usd: '0.10' },
];
export const cards = list.map((c, i) => ({ ...c, id: `${(i + 1).toString(16).padStart(8, '0')}-1111-2222-3333-${String(i).padStart(12, '0')}` }));
const byName = new Map(cards.map((c) => [c.name.toLowerCase(), c]));
const sc = (c: (typeof cards)[number]) => ({
  object: 'card', id: c.id, name: c.name, type_line: c.type, oracle_text: c.text, color_identity: c.ci, mana_cost: c.mana, cmc: c.cmc, set: 'tst', collector_number: '1',
  image_uris: { small: `https://cards.scryfall.io/small/front/0/0/${c.id}.jpg` }, prices: { usd: c.usd, usd_foil: (Number(c.usd) * 2).toFixed(2) }, legalities: { commander: 'legal' },
});
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkqGcAAAIEAQAhVzR2AAAAAElFTkSuQmCC', 'base64');

export async function mockWorld(page: Page) {
  await page.route(/cards\.scryfall\.io|svgs\.scryfall\.io/, (r) => r.fulfill({ body: PNG, contentType: 'image/png' }));
  await page.route(/frankfurter/, (r) => r.fulfill({ json: { rates: { CAD: 1.38 }, date: '2026-10-12' } }));
  await page.route(/supabase\.co/, (r) => r.fulfill({ json: {} }));
  await page.route(/api\.scryfall\.com/, async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/cards/collection') {
      const ids = JSON.parse(r.request().postData() ?? '{}').identifiers ?? [];
      return r.fulfill({ json: { data: ids.map((i: any) => (i.id ? cards.find((c) => c.id === i.id) : byName.get((i.name ?? '').toLowerCase()))).filter(Boolean).map(sc), not_found: [] } });
    }
    if (u.pathname === '/sets') return r.fulfill({ json: { data: [{ code: 'tst', name: 'Test Set', released_at: '2024-01-01', set_type: 'core', digital: false }] } });
    const names = [...(u.searchParams.get('q') ?? '').matchAll(/!"([^"]+)"/g)].map((m) => m[1].toLowerCase());
    return r.fulfill({ json: { data: names.map((n) => byName.get(n)).filter(Boolean).map(sc), has_more: false } });
  });
  const deck = { cards: { Creatures: [['Lotus Cobra', 1]], Artifacts: [['Sol Ring', 1]], Sorceries: [['Cultivate', 1]], Enchantments: [['Rhystic Study', 1]], Instants: [['Counterspell', 1]], Lands: [['Forest', 10], ['Island', 10]] } };
  const json = { container: { json_dict: { card: { id: cards[0].id, color_identity: ['G', 'U'], num_decks: 4321 }, cardlists: [{ header: 'Top Cards', cardviews: cards.slice(1, 6).map((c) => ({ name: c.name, id: c.id, num_decks: 1000, potential_decks: 4000, synergy: 0.2 })) }, { header: 'Mana Artifacts', cardviews: [{ name: 'Arcane Signet', id: 'aaaaaaaa-1111-2222-3333-000000000099', num_decks: 800, potential_decks: 4000, synergy: 0.1 }] }] } }, panels: { taglinks: [{ slug: 'landfall', value: 'Landfall', count: 2100 }, { slug: 'ramp', value: 'Ramp', count: 900 }] } };
  await page.route(/json\.edhrec\.com/, (r) => {
    const u = r.request().url();
    if (u.includes('/top/salt')) return u.includes('salt--') ? r.fulfill({ status: 404, body: '' }) : r.fulfill({ json: { cardviews: [{ name: 'Rhystic Study', salt: 2.7 }] } });
    return r.fulfill({ json: u.includes('average-decks') ? { ...json, deck } : json });
  });
}

/** A binder with every mock card (some foil) and one saved deck. */
export async function seed(page: Page) {
  await page.goto('/');
  await page.waitForSelector('.pillhub', { state: 'attached' });
  await page.evaluate(async (cs) => {
    const db: IDBDatabase = await new Promise((ok, no) => {
      const q = indexedDB.open('collectionhub');
      q.onsuccess = () => ok(q.result);
      q.onerror = no;
    });
    const tx = db.transaction(['entries', 'decks', 'cards'], 'readwrite');
    cs.forEach((c, i) => {
      tx.objectStore('cards').put({ id: c.id, name: c.name, key: c.name.toLowerCase(), type: c.type, text: c.text, ci: c.ci, img: `https://cards.scryfall.io/small/front/0/0/${c.id}.jpg`, usd: c.usd, usdFoil: c.usd, mana: c.mana, cmc: c.cmc, legal: true, pv: 2, at: Date.now() });
      tx.objectStore('entries').put({ profile: 1, cardId: c.id, name: c.name, qty: (i % 4) + 1, set: 'tst', cn: String(i), foil: i === 3 });
    });
    tx.objectStore('decks').put({ profile: 1, name: 'Tatyova Lands', commander: cs[0].name, cards: cs.map((c) => ({ name: c.name, qty: c.type.startsWith('Basic') ? 20 : 1 })), updated: Date.now() });
    await new Promise((ok) => (tx.oncomplete = ok));
  }, cards);
  await page.reload();
}


/** Every element matching these selectors sits within the screen width (the page hides sideways scroll, so a too-wide
 *  element would be cut off rather than scroll: check edges, not scrollWidth). */
export async function fits(page: Page, selectors: string[]) {
  const vw = page.viewportSize()!.width;
  for (const sel of selectors) {
    const boxes = await page.locator(sel).evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return [r.left, r.right, r.width]; }));
    if (!boxes.length) throw new Error(`nothing matches ${sel}`);
    for (const [l, r, w] of boxes) if (w > 0 && (l < -2 || r > vw + 2)) throw new Error(`${sel} spills off the screen (${Math.round(l)}–${Math.round(r)}px on a ${vw}px screen)`);
  }
}

// Builds tests/bench/fixtures.json for the brain tests (reconstruction + strategy), from public Archidekt decks and
// Scryfall card data. Run once by hand when the fixture should be refreshed:
//   NODE_USE_ENV_PROXY=1 node scripts/bench-fixtures.mjs
// No EDHREC: its terms forbid automated queries. The "popularity" the builder sees is computed from the other
// Archidekt decks of the same commander (leave-one-out), so the test never shows the builder the deck it rebuilds.
// Pacing: Archidekt ≤ 1 request / 1.2 s with a User-Agent; Scryfall collection calls of 75, 150 ms apart.
import { mkdirSync, writeFileSync } from 'node:fs';

const COMMANDERS = ['Doctor Doom, King of Latveria', 'Kinnan, Bonder Prodigy', "Trostani, Selesnya's Voice", 'Yuriko, the Tiger\'s Shadow'];
const DECKS_PER = 12;
const UA = { 'User-Agent': 'CollectionHub-bench/1.0 (test fixtures)', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TWO_YEARS = 2 * 365 * 24 * 3600 * 1000;

async function get(url, init) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) } }).catch(() => null);
    if (r?.ok) return r.json();
    if (r && r.status === 429) throw new Error('rate limited: stop and try later');
    await sleep(2000 * 2 ** i);
  }
  throw new Error(`no answer: ${url}`);
}

const decks = {};
for (const cmdr of COMMANDERS) {
  const list = await get(`https://archidekt.com/api/decks/v3/?${new URLSearchParams({ commanderName: cmdr, orderBy: '-viewCount', deckFormat: '3' })}`);
  await sleep(1200);
  const picked = [];
  for (const d of list.results) {
    if (picked.length >= DECKS_PER) break;
    if (d.size !== 100 || d.theorycrafted || Date.now() - Date.parse(d.updatedAt) > TWO_YEARS) continue;
    const full = await get(`https://archidekt.com/api/decks/${d.id}/`);
    await sleep(1200);
    const main = full.cards.filter((c) => !(c.categories ?? []).some((x) => /maybe|sideboard|considering/i.test(x)));
    const leads = main.filter((c) => (c.categories ?? []).includes('Commander')).map((c) => c.card.oracleCard.name);
    if (leads.length !== 1 || leads[0] !== cmdr) continue; // single commander, the right one
    const cards = main.filter((c) => !leads.includes(c.card.oracleCard.name)).map((c) => [c.card.oracleCard.name, c.quantity]);
    if (cards.reduce((n, [, q]) => n + q, 0) !== 99) continue;
    picked.push({ id: d.id, name: d.name, bracket: d.edhBracket ?? null, cards });
    console.log(cmdr, '·', d.name, d.id);
  }
  decks[cmdr] = picked;
}

// Scryfall data for every card named anywhere.
const names = [...new Set([...COMMANDERS, ...Object.values(decks).flatMap((ds) => ds.flatMap((d) => d.cards.map(([n]) => n)))])];
const cards = {};
for (let i = 0; i < names.length; i += 75) {
  const r = await get('https://api.scryfall.com/cards/collection', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifiers: names.slice(i, i + 75).map((name) => ({ name })) }) });
  for (const c of r.data) {
    const face = c.card_faces?.[0];
    cards[c.name] = {
      type: c.type_line ?? face?.type_line ?? '',
      text: c.oracle_text ?? (c.card_faces ?? []).map((f) => f.oracle_text).join('\n'),
      cmc: c.cmc,
      mana: c.mana_cost ?? face?.mana_cost ?? '',
      ci: c.color_identity,
      legal: c.legalities?.commander === 'legal',
      gc: !!c.game_changer,
    };
    // Archidekt may name the front face only: keep both spellings.
    if (c.name.includes(' // ')) cards[c.name.split(' // ')[0]] = cards[c.name];
  }
  await sleep(150);
}

mkdirSync('tests/bench', { recursive: true });
writeFileSync('tests/bench/fixtures.json', JSON.stringify({ at: new Date().toISOString().slice(0, 10), source: 'Archidekt public decks + Scryfall', decks, cards }));
console.log(`${Object.values(decks).flat().length} decks, ${Object.keys(cards).length} cards`);

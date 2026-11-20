// Builds public/cards/oracle.json: every paper Magic card once (name, type, mana, rules text, colour identity, rarity,
// Commander legality, a default printing), from Scryfall's daily "Oracle Cards" bulk file. No prices, no pictures.
// Run: node scripts/build-cardlist.mjs   (one ~160 MB download, a few seconds of work)
// A weekly GitHub Action reruns it (.github/workflows/card-list.yml). The app keeps the file for offline imports and
// syncs (src/lib/cardlist.ts) and never needs it to work.
import { mkdirSync, writeFileSync } from 'node:fs';
import { cardListFile, oracleEntry } from './cardlist-format.mjs';

const UA = { 'User-Agent': 'CollectionHub-cardlist/1.0', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json();
    await sleep(3000 * 2 ** i);
  }
  throw new Error(`Scryfall did not answer: ${url}`);
}

// The catalog of bulk files, then the "Oracle Cards" one (one entry per card, the newest printing)
const bulk = oracleEntry(await get('https://api.scryfall.com/bulk-data'));
const cards = await get(bulk.download_uri);
if (!Array.isArray(cards) || cards.length < 20000) throw new Error(`Unexpected bulk file: ${Array.isArray(cards) ? cards.length : typeof cards} cards`);
const file = cardListFile(cards, bulk.updated_at);
const n = file.split('\n').length - 3;
if (n < 20000) throw new Error(`Only ${n} cards after filtering: not writing the file`);
mkdirSync('public/cards', { recursive: true });
writeFileSync('public/cards/oracle.json', file);
console.log(`public/cards/oracle.json: ${n} cards, ${(file.length / 1e6).toFixed(1)} MB (Scryfall bulk of ${bulk.updated_at})`);

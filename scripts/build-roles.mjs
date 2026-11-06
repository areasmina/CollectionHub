// Builds public/brain/roles.json: card roles from Scryfall Tagger (otag:), the same tags Deck Wizard uses.
// Run: node scripts/build-roles.mjs   (about 2 minutes; Scryfall asks for ~10 requests a second at most, we do ~8)
// A monthly GitHub Action reruns it, so the app never asks Scryfall for tags at runtime.
import { mkdirSync, writeFileSync } from 'node:fs';

// Role -> Scryfall Tagger tags. Order = bit order in the file (keep in sync with ROLE_BITS in src/lib/roles.ts).
const TAGS = {
  ramp: ['ramp'],
  draw: ['draw', 'card-advantage'],
  removal: ['removal'],
  wipes: ['sweeper', 'board-wipe'],
  tutors: ['tutor'],
  counters: ['counterspell'],
};
const norm = (s) => s.split(/\s\/\/?\s/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'CollectionHub-roles/1.0', Accept: 'application/json' };

async function get(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA }).catch(() => null);
    if (r?.ok) return r.json();
    if (r && r.status === 404) return null; // no cards for this tag
    await sleep(2000 * 2 ** i);
  }
  throw new Error(`Scryfall did not answer: ${url}`);
}

const bits = new Map();
const counts = {};
for (const [i, [role, tags]] of Object.entries(TAGS).entries()) {
  const seen = new Set();
  for (const tag of tags) {
    let url = `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: `otag:${tag} f:commander`, unique: 'cards' })}`;
    while (url) {
      const page = await get(url);
      if (!page) break;
      for (const c of page.data ?? []) {
        const k = norm(c.name);
        seen.add(k);
        bits.set(k, (bits.get(k) ?? 0) | (1 << i));
      }
      url = page.has_more ? page.next_page : null;
      await sleep(120);
    }
  }
  counts[role] = seen.size;
  console.log(`${role}: ${seen.size} cards`);
  if (!seen.size) throw new Error(`Tag for ${role} came back empty: check the tag name`);
}

const out = { v: 1, at: new Date().toISOString().slice(0, 10), roles: Object.keys(TAGS), counts, cards: Object.fromEntries([...bits].sort()) };
mkdirSync('public/brain', { recursive: true });
writeFileSync('public/brain/roles.json', JSON.stringify(out));
console.log(`${bits.size} cards written to public/brain/roles.json`);

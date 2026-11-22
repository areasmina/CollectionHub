// Builds public/brain/roles.json: card roles from Scryfall Tagger (otag:), the same tags Deck Wizard uses.
// Run: node scripts/build-roles.mjs   (about 4 minutes: Scryfall allows about 2 searches a second, we do under 2)
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
  // Other jobs (Nov 21, "card roles" upgrade). Added only at the end: the app reads bits by position (src/brain/data.ts
  // ROLE_BITS). Several spellings are tried and merged, as Deck Wizard does; recursion and sacrifice-outlet are its own.
  recursion: ['recursion'],
  sacOutlet: ['sacrifice-outlet'],
  // No Tagger tag found for token makers (Nov 21 run: token-generator and creature-token-generator came back empty), so
  // this one is a Scryfall text search: cards whose rules text creates a token.
  tokens: ['o:/\\bcreates? [^.]*\\btokens?\\b/'],
  protection: ['protection', 'protects-creature', 'gives-hexproof', 'gives-indestructible'],
  reanimate: ['reanimate', 'reanimation'],
  flicker: ['flicker', 'blink'],
  lifegain: ['lifegain', 'life-gain'],
  burn: ['burn'],
  mill: ['mill'],
  discard: ['discard'],
  evasion: ['evasion', 'gives-evasion'],
  anthem: ['anthem'],
  gyHate: ['graveyard-hate'],
  costReducer: ['cost-reducer'],
  extraCombat: ['extra-combat'],
  steal: ['gain-control', 'steal', 'theft'],
};
const CORE = 6; // ramp … counters: an empty one stops the run; an empty newer one is only reported
const norm = (s) => s.split(/\s\/\/?\s/)[0].normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'CollectionHub-roles/1.0', Accept: 'application/json' };

async function get(url) {
  let last = 'no answer';
  for (let i = 0; i < 6; i++) {
    const r = await fetch(url, { headers: UA }).catch((e) => ((last = String(e?.cause?.code ?? e)), null));
    if (r?.ok) return r.json();
    if (r && (r.status === 404 || r.status === 400)) return null; // no cards for this tag (or a tag Scryfall does not know)
    if (r) last = `${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`;
    // Scryfall's own wait when it asks for one (429 Retry-After), else a growing pause: 2, 4, 8, 16, 32 s
    const wait = Number(r?.headers.get('retry-after')) * 1000 || 2000 * 2 ** i;
    console.log(`  Scryfall: ${last.split(' ')[0]}, trying again in ${Math.round(wait / 1000)} s`);
    await sleep(wait);
  }
  throw new Error(`Scryfall did not answer (${last}): ${url}`);
}

const bits = new Map();
const counts = {};
const empty = [];
for (const [i, [role, tags]] of Object.entries(TAGS).entries()) {
  const seen = new Set();
  for (const tag of tags) {
    let url = `https://api.scryfall.com/cards/search?${new URLSearchParams({ q: `${tag.startsWith('o:') ? tag : `otag:${tag}`} f:commander`, unique: 'cards' })}`;
    while (url) {
      const page = await get(url);
      if (!page) break;
      for (const c of page.data ?? []) {
        const k = norm(c.name);
        seen.add(k);
        bits.set(k, (bits.get(k) ?? 0) | (1 << i));
      }
      url = page.has_more ? page.next_page : null;
      await sleep(600); // searches are a heavy call for Scryfall (about 2 a second); faster gets 429 and a 60 s wait
    }
  }
  counts[role] = seen.size;
  console.log(`${role}: ${seen.size} cards`);
  if (!seen.size) empty.push({ role, core: i < CORE });
}
if (empty.length) console.log(`::warning::Tags came back empty (check the tag names): ${empty.map((e) => e.role).join(', ')}`);
if (empty.some((e) => e.core)) throw new Error(`Tag for ${empty.filter((e) => e.core).map((e) => e.role).join(', ')} came back empty: check the tag name`);

const out = { v: 1, at: new Date().toISOString().slice(0, 10), roles: Object.keys(TAGS), counts, cards: Object.fromEntries([...bits].sort()) };
mkdirSync('public/brain', { recursive: true });
writeFileSync('public/brain/roles.json', JSON.stringify(out));
console.log(`${bits.size} cards written to public/brain/roles.json`);

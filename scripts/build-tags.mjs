// Builds public/tags/tags.json: Scryfall Tagger's function tags with their broader tags and Commander-legal cards, for
// the tag navigator. Two downloads from Scryfall's daily bulk files ("Oracle Tags" ~6 MB, "Oracle Cards" ~25 MB),
// a few seconds of work. The monthly Brain data workflow reruns it, so the app never asks Scryfall for tags.
// Run: node scripts/build-tags.mjs
// The file lives outside public/brain/ on purpose: everything in brain/ is downloaded when the app is installed
// (vite.config.ts), and this one is only needed when the TAGS page opens.
import { mkdirSync, writeFileSync } from 'node:fs';
import { bulkCards } from './cardlist-format.mjs';
import { bulkEntry, tagsFile } from './tags-format.mjs';

const UA = { 'User-Agent': 'CollectionHub-tags/1.0', Accept: 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(url, as = 'json') {
  let last = 'no answer';
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA }).catch((e) => ((last = String(e?.cause?.code ?? e)), null));
    if (r?.ok) return as === 'json' ? r.json() : r.arrayBuffer();
    if (r) last = `${r.status}`;
    await sleep(3000 * 2 ** i);
  }
  throw new Error(`Scryfall did not answer (${last}): ${url}`);
}

const catalog = await get('https://api.scryfall.com/bulk-data');
const tagsBulk = bulkEntry(catalog, 'oracle_tags');
const cardsBulk = bulkEntry(catalog, 'oracle_cards');
const tags = bulkCards(await get(tagsBulk.url, 'bytes'));
const cards = bulkCards(await get(cardsBulk.url, 'bytes'));
if (!Array.isArray(tags) || tags.length < 2000) throw new Error(`Unexpected Oracle Tags file: ${Array.isArray(tags) ? tags.length : typeof tags} tags`);
if (!Array.isArray(cards) || cards.length < 20000) throw new Error(`Unexpected Oracle Cards file: ${Array.isArray(cards) ? cards.length : typeof cards} cards`);

const out = tagsFile(tags, cards, tagsBulk.updated_at);
// A sudden collapse means a format change upstream, not a real month: stop rather than ship a broken file.
if (out.tags < 2000 || out.cards < 15000) throw new Error(`Too little came out (${out.tags} tags, ${out.cards} cards): check Scryfall's tag format`);
mkdirSync('public/tags', { recursive: true });
writeFileSync('public/tags/tags.json', out.text);
console.log(`${out.tags} tags, ${out.cards} cards, ${out.taggings} taggings written to public/tags/tags.json (${Math.round(out.text.length / 1024)} KB)`);

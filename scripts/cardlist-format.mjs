// The compact card list (Phase 5C): one row per card (Scryfall oracle card), no prices, no pictures (a picture's address
// is made from the printing id). Shared by scripts/build-cardlist.mjs (writes it) and its unit test; the app reads it in
// src/lib/cardlist.ts. Keep FIELDS in step with that file.
import { gunzipSync } from 'node:zlib';

export const FORMAT = 1;
export const FIELDS = ['name', 'type', 'mana', 'cmc', 'ci', 'rarity', 'legal', 'text', 'id', 'set', 'cn', 'back'];

// Not cards you put in a binder or a deck.
const SKIP = new Set(['token', 'double_faced_token', 'emblem', 'art_series', 'vanguard', 'planar', 'scheme']);

/** One Scryfall card object as a row, or null when it is not a paper card for a binder. */
export function row(c) {
  if (!c || SKIP.has(c.layout) || !(c.games ?? []).includes('paper')) return null;
  const faces = c.card_faces ?? [];
  const join = (k) => faces.map((f) => f[k]).filter(Boolean).join(k === 'oracle_text' ? '\n' : ' // ');
  return [
    c.name,
    c.type_line ?? join('type_line'),
    c.mana_cost ?? join('mana_cost'),
    c.cmc ?? 0,
    (c.color_identity ?? []).join(''),
    (c.rarity ?? '').slice(0, 1),
    c.legalities?.commander === 'legal' ? 1 : 0,
    c.oracle_text ?? join('oracle_text'),
    c.id,
    c.set ?? '',
    c.collector_number ?? '',
    // a second face with a picture of its own (transform, modal double-faced): the card can be turned over
    faces[1]?.image_uris ? 1 : 0,
  ];
}

/** The whole file: a header line, then one card per line (sorted by name), so a weekly change shows as a few lines. */
export function cardListFile(cards, at = new Date().toISOString()) {
  const rows = cards
    .map(row)
    .filter(Boolean)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return `{"v":${FORMAT},"at":${JSON.stringify(at)},"fields":${JSON.stringify(FIELDS)},"cards":[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]}\n`;
}

/**
 * Where to download the "Oracle Cards" file, from Scryfall's bulk-data catalog (GET /bulk-data). Scryfall used to give
 * a JSON file (download_uri); since November 2026 it gives a gzipped JSON-lines file (jsonl_download_uri). Both are read.
 * Throws an error naming what came back when neither is there.
 */
export function oracleEntry(catalog) {
  const e = (catalog?.data ?? []).find((d) => d?.type === 'oracle_cards');
  if (!e) throw new Error(`No "oracle_cards" file in Scryfall's bulk-data catalog (types: ${(catalog?.data ?? []).map((d) => d?.type).join(', ') || 'none'})`);
  const url = e.jsonl_download_uri || e.download_uri;
  if (!url) throw new Error(`Scryfall's "oracle_cards" entry has no download address (it has: ${JSON.stringify(e).slice(0, 600)})`);
  return { url, updated_at: e.updated_at };
}

/** The cards in a downloaded bulk file: gzipped or not, a JSON array or one card per line (JSON lines). */
export function bulkCards(bytes) {
  const buf = Buffer.from(bytes);
  const text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf).toString('utf8').trim();
  if (text.startsWith('[')) return JSON.parse(text);
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

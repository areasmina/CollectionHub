// The compact card list (Phase 5C): one row per card (Scryfall oracle card), no prices, no pictures (a picture's address
// is made from the printing id). Shared by scripts/build-cardlist.mjs (writes it) and its unit test; the app reads it in
// src/lib/cardlist.ts. Keep FIELDS in step with that file.
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

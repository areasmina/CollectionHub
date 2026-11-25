// The tag file (tag navigator, Phase 0): Scryfall Tagger's function tags ("Oracle Tags" bulk file) with their broader
// (parent) tags and their Commander-legal cards, joined to card names through the "Oracle Cards" bulk file.
// Shared by scripts/build-tags.mjs (writes public/tags/tags.json) and its unit test; the app reads it in src/lib/tags.ts.
// Keep FIELDS in step with that file.
//
// Why card names and not positions in public/cards/oracle.json: the card list is rebuilt weekly and this file monthly,
// so positions would drift apart between the two. Names are what the rest of the app matches cards by (lib/names norm).
import { row } from './cardlist-format.mjs';

export const FORMAT = 1;
/** One tag row: [stable id, label, description or null, aliases, parent rows, own cards, very strong cards]. */
export const FIELDS = ['id', 'label', 'description', 'aliases', 'parents', 'cards', 'top'];

/**
 * Tags never shown, by their stable id (Scryfall's advice: community data needs a way to hide a single bad tag).
 * Add an id here with a comment saying why; the next monthly run leaves the tag out.
 */
export const HIDDEN = [];

/** Card positions as gaps from the one before (sorted): small numbers keep the file small. */
export const gaps = (ix) => ix.map((v, i) => (i ? v - ix[i - 1] : v));

/**
 * The whole file. `tags` = the Oracle Tags bulk rows, `cards` = the Oracle Cards bulk rows.
 * - Only Commander-legal paper cards are kept (the same test as the card list's "legal" column).
 * - A tag stays when it, or a tag below it, has at least one such card. A broad tag such as "draw" has no cards of its
 *   own in Scryfall's file (its cards are those of the tags below it), so it is kept for its children.
 * - Parents point to rows of this file; a parent that was left out is dropped from the list.
 * - One tag per line, sorted by label, so a monthly change shows as a few changed lines.
 */
export function tagsFile(tags, cards, at = new Date().toISOString(), hidden = HIDDEN) {
  const nameOf = new Map();
  for (const c of cards) {
    const r = row(c);
    if (r && r[6] === 1 && c.oracle_id) nameOf.set(c.oracle_id, r[0]);
  }
  const hide = new Set(hidden);
  const all = new Map(tags.filter((t) => t?.type === 'oracle' && t.id && t.label && !hide.has(t.id)).map((t) => [t.id, t]));

  // Own cards (names) per tag, and whether a tag reaches any card through itself or the tags below it (cycle-safe).
  const own = new Map();
  const top = new Map();
  for (const t of all.values()) {
    const names = new Set();
    const strong = new Set();
    for (const g of t.taggings ?? []) {
      const n = nameOf.get(g.oracle_id);
      if (!n) continue;
      names.add(n);
      if (g.weight === 'very_strong') strong.add(n);
    }
    own.set(t.id, names);
    top.set(t.id, strong);
  }
  const reach = new Map();
  const reaches = (id, seen = new Set()) => {
    if (reach.has(id)) return reach.get(id);
    if (seen.has(id)) return false;
    seen.add(id);
    const t = all.get(id);
    const yes = !!t && (own.get(id).size > 0 || (t.child_ids ?? []).some((c) => all.has(c) && reaches(c, seen)));
    reach.set(id, yes);
    return yes;
  };
  const kept = [...all.values()].filter((t) => reaches(t.id)).sort((a, b) => (a.label < b.label ? -1 : a.label > b.label ? 1 : a.id < b.id ? -1 : 1));
  const rowOf = new Map(kept.map((t, i) => [t.id, i]));

  const names = [...new Set(kept.flatMap((t) => [...own.get(t.id)]))].sort();
  const cardOf = new Map(names.map((n, i) => [n, i]));
  const ixs = (set) => gaps([...set].map((n) => cardOf.get(n)).sort((a, b) => a - b));

  const lines = kept.map((t) =>
    JSON.stringify([
      t.id,
      t.label,
      t.description || null,
      (t.aliases ?? []).filter((a) => typeof a === 'string' && a),
      [...new Set((t.parent_ids ?? []).filter((p) => rowOf.has(p)).map((p) => rowOf.get(p)))].sort((a, b) => a - b),
      ixs(own.get(t.id)),
      ixs(top.get(t.id)),
    ]),
  );
  return {
    text: `{"v":${FORMAT},"at":${JSON.stringify(at)},"fields":${JSON.stringify(FIELDS)},"cards":${JSON.stringify(names)},"tags":[\n${lines.join(',\n')}\n]}\n`,
    tags: kept.length,
    cards: names.length,
    taggings: kept.reduce((s, t) => s + own.get(t.id).size, 0),
  };
}

/** Where to download a bulk file of this type, from Scryfall's bulk-data catalog (GET /bulk-data). */
export function bulkEntry(catalog, type) {
  const e = (catalog?.data ?? []).find((d) => d?.type === type);
  if (!e) throw new Error(`No "${type}" file in Scryfall's bulk-data catalog (types: ${(catalog?.data ?? []).map((d) => d?.type).join(', ') || 'none'})`);
  const url = e.jsonl_download_uri || e.download_uri;
  if (!url) throw new Error(`Scryfall's "${type}" entry has no download address (it has: ${JSON.stringify(e).slice(0, 600)})`);
  return { url, updated_at: e.updated_at };
}

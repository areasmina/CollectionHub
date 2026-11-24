import { norm } from './names';

/**
 * The tag navigator's data (Phase 0): Scryfall Tagger's function tags, each with its broader tags and its own
 * Commander-legal cards, built monthly by scripts/build-tags.mjs into /tags/tags.json (outside brain/, so it is not
 * part of the install; it is fetched when the TAGS page opens). Community data: shown as Scryfall Tagger's tags, never
 * as the app's own judgement. Nothing here reads or changes the collection; callers pass in what the user owns.
 */
export const TAGS_URL = 'tags/tags.json';
const FIELDS = ['id', 'label', 'description', 'aliases', 'parents', 'cards', 'top'];
type Row = [string, string, string | null, string[], number[], number[], number[]];

export interface Tag {
  /** Scryfall's stable id (labels can change). */
  id: string;
  label: string;
  description: string | null;
  aliases: string[];
  /** Broader tags (rows of TagData.tags). */
  parents: number[];
  /** Narrower tags, worked out from the parents. */
  children: number[];
  /** This tag's own cards (positions in TagData.cards). A broad tag may have none: its cards are its children's. */
  cards: number[];
  /** Cards Tagger marks as the clearest examples ("very strong"). */
  top: number[];
}

export interface TagData {
  at: string;
  /** Card names, sorted. */
  cards: string[];
  tags: Tag[];
}

const ints = (a: unknown): a is number[] => Array.isArray(a) && a.every((n) => Number.isInteger(n));
/** Undo the file's gaps (each position is stored as the step from the one before). */
const ungap = (g: number[]) => {
  let at = 0;
  return g.map((d, i) => (at = i ? at + d : d));
};

/** Read the file; null when it is missing, of an unknown version or damaged (the page then says tags are unavailable). */
export function parseTags(j: unknown): TagData | null {
  const f = j as { v?: number; at?: string; fields?: string[]; cards?: unknown; tags?: unknown };
  if (!f || f.v !== 1 || JSON.stringify(f.fields) !== JSON.stringify(FIELDS) || !Array.isArray(f.cards) || !Array.isArray(f.tags)) return null;
  const cards = f.cards as string[];
  const n = (f.tags as unknown[]).length;
  const tags: Tag[] = [];
  for (const r of f.tags as Row[]) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[1] !== 'string' || !ints(r[4]) || !ints(r[5]) || !ints(r[6])) return null;
    const own = ungap(r[5]);
    const top = ungap(r[6]);
    if (r[4].some((p) => p < 0 || p >= n) || [...own, ...top].some((c) => c < 0 || c >= cards.length)) return null;
    tags.push({ id: r[0], label: r[1], description: r[2] ?? null, aliases: Array.isArray(r[3]) ? r[3] : [], parents: r[4], children: [], cards: own, top });
  }
  tags.forEach((t, i) => t.parents.forEach((p) => tags[p].children.push(i)));
  return { at: f.at ?? '', cards, tags };
}

/** Every card of a tag: its own and those of every tag below it (as Scryfall's otag: search counts them). */
export function cardsOf(d: TagData, tag: number): Set<number> {
  const out = new Set<number>();
  const seen = new Set<number>();
  const walk = (i: number) => {
    if (seen.has(i)) return; // a tag can sit under several parents; walk each once
    seen.add(i);
    d.tags[i].cards.forEach((c) => out.add(c));
    d.tags[i].children.forEach(walk);
  };
  walk(tag);
  return out;
}

/** How many of a tag's cards the user owns. `owned` = normalized names (lib/names norm) of the active binder. */
export function ownedOf(d: TagData, tag: number, owned: Set<string>) {
  const all = cardsOf(d, tag);
  let have = 0;
  for (const c of all) if (owned.has(norm(d.cards[c]))) have++;
  return { owned: have, total: all.size };
}

/** Tags whose label or alias matches the words typed: label starts first, then alias starts, then contains. */
export function findTags(d: TagData, query: string, limit = 30): number[] {
  const q = query.toLowerCase().replace(/[-_]+/g, ' ').trim();
  if (!q) return [];
  const score = (s: string) => {
    const x = s.toLowerCase().replace(/[-_]+/g, ' ');
    return x === q ? 0 : x.startsWith(q) ? 1 : x.includes(q) ? 3 : 9;
  };
  return d.tags
    .map((t, i) => ({ i, s: Math.min(score(t.label), ...t.aliases.map((a) => score(a) + 1)) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || d.tags[a.i].label.localeCompare(d.tags[b.i].label))
    .slice(0, limit)
    .map((x) => x.i);
}

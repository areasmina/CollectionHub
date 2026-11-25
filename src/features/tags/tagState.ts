import { norm } from '../../lib/names';
import { cardsOf, parseTags, TAGS_URL, type TagData } from '../../lib/tags';

export const TAGS_CACHE = 'ch-tags';
let cachedData: Promise<TagData | null> | null = null;

/** Fetches and parses `/tags/tags.json` on demand, keeping a Cache Storage copy for offline use. */
export function loadTagData(opts: { force?: boolean } = {}): Promise<TagData | null> {
  if (opts.force) cachedData = null;
  if (cachedData) return cachedData;
  cachedData = (async () => {
    const url = `${import.meta.env.BASE_URL || '/'}${TAGS_URL}`;
    if (typeof caches !== 'undefined' && !opts.force) {
      const box = await caches.open(TAGS_CACHE);
      const hit = await box.match(url);
      if (hit) {
        const parsed = parseTags(await hit.json());
        if (parsed) return parsed;
      }
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const clone = res.clone();
    const json = await res.json();
    const parsed = parseTags(json);
    if (!parsed) return null;
    if (typeof caches !== 'undefined') {
      const box = await caches.open(TAGS_CACHE);
      await box.put(url, clone);
    }
    return parsed;
  })().catch(() => {
    cachedData = null;
    return null;
  });
  return cachedData;
}

export interface TagIndex {
  data: TagData;
  /** Memoized transitive card index set for any tag (self + all descendants). */
  cardsOfMemo: (tagIdx: number) => Set<number>;
  /** Memoized set of "very strong" (`top`) card indices for any tag (self + descendants). */
  topOfMemo: (tagIdx: number) => Set<number>;
  /** Normalized card name per index in `data.cards`. */
  normCards: string[];
  /** Lookup tag index by slug/label (case-insensitive). */
  byLabel: Map<string, number>;
}

/** Builds a memoized DAG index over parsed TagData for fast querying and count badges. */
export function createTagIndex(data: TagData): TagIndex {
  const cardMemo = new Map<number, Set<number>>();
  const topMemo = new Map<number, Set<number>>();
  const normCards = data.cards.map((n) => norm(n));
  const byLabel = new Map<string, number>();
  data.tags.forEach((t, i) => byLabel.set(t.label.toLowerCase(), i));

  const cardsOfMemo = (tagIdx: number): Set<number> => {
    const hit = cardMemo.get(tagIdx);
    if (hit) return hit;
    const set = cardsOf(data, tagIdx);
    cardMemo.set(tagIdx, set);
    return set;
  };

  const topOfMemo = (tagIdx: number): Set<number> => {
    const hit = topMemo.get(tagIdx);
    if (hit) return hit;
    const out = new Set<number>();
    const seen = new Set<number>();
    const walk = (i: number) => {
      if (seen.has(i)) return;
      seen.add(i);
      data.tags[i].top.forEach((c) => out.add(c));
      data.tags[i].children.forEach(walk);
    };
    walk(tagIdx);
    topMemo.set(tagIdx, out);
    return out;
  };

  return { data, cardsOfMemo, topOfMemo, normCards, byLabel };
}

/** Computes `{ owned, total }` counts for a tag against an active binder's normalized card set. */
export function countOwnedForTag(index: TagIndex, tagIdx: number, owned: Set<string>): { owned: number; total: number } {
  const cards = index.cardsOfMemo(tagIdx);
  let have = 0;
  for (const c of cards) {
    if (owned.has(index.normCards[c])) have++;
  }
  return { owned: have, total: cards.size };
}

export interface TagCondition {
  tagIdx: number;
  mode: 'include' | 'exclude';
}

export type TagShow = 'owned' | 'all' | 'missing';

export interface TagCardMatch {
  cardIdx: number;
  name: string;
  owned: boolean;
  isTop: boolean;
}

/**
 * Evaluates a set of include (`AND`) / exclude (`NOT`) tag conditions and filters by ownership & colour identity.
 * Colour filter uses Commander identity rules: a card matches `colours` when every pip in its identity is selected
 * (or the card is colorless and `'C'` is selected, or colorless cards are allowed inside a colour identity).
 */
export function evalTagQuery(
  index: TagIndex,
  conditions: TagCondition[],
  opts: {
    owned: Set<string>;
    show: TagShow;
    colours?: string[];
    ciOf?: (name: string) => string[] | undefined;
    search?: string;
  },
): TagCardMatch[] {
  const includes = conditions.filter((c) => c.mode === 'include');
  const excludes = conditions.filter((c) => c.mode === 'exclude');
  if (!includes.length) return [];

  // Intersect from smallest include set first for speed on broad tags like `draw`
  const sets = includes.map((c) => index.cardsOfMemo(c.tagIdx)).sort((a, b) => a.size - b.size);
  const exclSets = excludes.map((c) => index.cardsOfMemo(c.tagIdx));
  const topUnion = new Set<number>();
  for (const c of includes) {
    for (const t of index.topOfMemo(c.tagIdx)) topUnion.add(t);
  }

  const [first, ...rest] = sets;
  const colFilter = opts.colours && opts.colours.length > 0 ? new Set(opts.colours) : null;
  const q = opts.search?.trim().toLowerCase() ?? '';
  const out: TagCardMatch[] = [];

  for (const cardIdx of first) {
    if (rest.some((s) => !s.has(cardIdx))) continue;
    if (exclSets.some((s) => s.has(cardIdx))) continue;
    const name = index.data.cards[cardIdx];
    if (q && !name.toLowerCase().includes(q)) continue;
    const isOwned = opts.owned.has(index.normCards[cardIdx]);
    if (opts.show === 'owned' && !isOwned) continue;
    if (opts.show === 'missing' && isOwned) continue;

    if (colFilter && opts.ciOf) {
      const ci = opts.ciOf(name);
      if (ci) {
        if (ci.length === 0) {
          if (!colFilter.has('C') && colFilter.size > 0) {
            // Colorless cards belong in any non-empty commander identity unless user explicitly filtered strictly to C?
            // Standard Commander identity: colourless fits any chosen identity; if only C is chosen, ci.length === 0 passes too.
          }
        } else if (ci.some((pip) => !colFilter.has(pip))) {
          continue;
        }
      }
    }

    out.push({
      cardIdx,
      name,
      owned: isOwned,
      isTop: topUnion.has(cardIdx),
    });
  }

  out.sort((a, b) => Number(b.owned) - Number(a.owned) || Number(b.isTop) - Number(a.isTop) || a.name.localeCompare(b.name));
  return out;
}

const STARTER_LABELS = [
  'draw',
  'ramp',
  'removal',
  'board-wipe',
  'enchantment-engine',
  'tutor',
  'recursion',
  'sacrifice-outlet',
  'token-generator',
  'card-advantage',
  'counterspell',
  'blink',
];

/** Returns starter tag indices present in the loaded tag data for quick entry. */
export function starterTags(index: TagIndex): number[] {
  const found: number[] = [];
  for (const label of STARTER_LABELS) {
    const idx = index.byLabel.get(label);
    if (idx !== undefined) found.push(idx);
  }
  if (found.length) return found;
  return index.data.tags
    .map((t, i) => ({ i, n: t.children.length + t.cards.length }))
    .sort((a, b) => b.n - a.n)
    .slice(0, 10)
    .map((x) => x.i);
}

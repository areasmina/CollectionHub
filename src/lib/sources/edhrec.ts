/**
 * EDHREC adapter: the ONLY module that talks to EDHREC (json.edhrec.com). Everything else imports from here (or the
 * `lib/edhrec` re-export), so the source can be documented, rate-limited, cached, swapped or switched off in one place.
 *
 * Terms (https://edhrec.com/terms, read Nov 6 2026): access is licensed for personal, noncommercial use; automated
 * queries and building a competing site are not allowed. Browser-side fetching does NOT by itself establish compliance.
 * Rules we keep: each user's browser asks only for pages that user opens (no server proxy, no bulk download), every page
 * is cached (a day; salt a week), requests are paced (~3-5/s), EDHREC is credited and linked, and no paid tier or public
 * launch is built on this data without EDHREC's written permission. Details: docs/data-sources.md.
 */
import { db } from '../db';
import { norm } from '../names';

// Brackets 1 (Exhibition) and 2 (Core) are left out on purpose (owner's call, Nov 2026): nobody here builds for them and
// their EDHREC pages are thin; All stays. A commander without data for the chosen bracket falls back to All, with a note.
/** Power levels (owner's call, Nov 6): Min = bracket 3, Med = bracket 4, Max = bracket 5; All (every bracket) stays. [EDHREC slug, label, bracket] */
export const BRACKETS: [string, string, string][] = [['', 'All', ''], ['upgraded', 'Min', '3'], ['optimized', 'Med', '4'], ['cedh', 'Max', '5']];
export const DEFAULT_BRACKET = 'upgraded';
export const BUDGETS: [string, string][] = [['', 'Any'], ['budget', '$'], ['expensive', '$$$']];
/** GEAR (owner's name, Nov 6): the budget switch as gears. 1ST = EDHREC's budget decks, 2ND = every budget, 3RD = expensive. */
export const GEARS: [string, string, string][] = [['budget', '1ST', "EDHREC's budget decks ($)"], ['', '2ND', 'Every budget'], ['expensive', '3RD', "EDHREC's expensive decks ($$$)"]];

export interface EdhCard {
  name: string;
  id?: string;
  decks?: number;
  potential?: number;
  synergy?: number;
  lift?: number;
  qty?: number;
}
export interface EdhList {
  header: string;
  cards: EdhCard[];
}
export interface EdhPage {
  header: string;
  card?: { id?: string; ci: string[] }; // the commander itself
  numDecks?: number;
  tags: { slug: string; value: string; count: number }[];
  lists: EdhList[];
}

/** EDHREC's URL order: <slug>/<bracket>/<tag>/<budget>. */
export const pagePath = (kind: 'commander' | 'average', slug: string, bracket = '', tag = '', budget = '') =>
  [kind === 'commander' ? 'commanders' : 'average-decks', slug, bracket, tag, budget].filter(Boolean).join('/');

const DAY = 864e5;
export class NoPage extends Error {}
let nextSlot = 0;
const inFlight = new Map<string, Promise<EdhPage>>();
const memCache = new Map<string, { page: EdhPage; at: number }>();

function remember(path: string, page: EdhPage, at: number) {
  if (memCache.size > 400) {
    const first = memCache.keys().next().value;
    if (first) memCache.delete(first);
  }
  memCache.set(path, { page, at });
  return { page, at };
}

/** The saved copy of a page, however old (null if never fetched): lets a view show something at once. */
export async function cachedPage(path: string): Promise<{ page: EdhPage; at: number } | null> {
  const mem = memCache.get(path);
  if (mem) return mem;
  const hit = await db.edhrec.get(path).catch(() => undefined);
  return hit ? remember(path, parsePage(hit.data), hit.at) : null;
}

/** Bulk-read saved copies of many pages in a single IndexedDB call (for Discover recounting). */
export async function cachedPages(paths: string[]): Promise<Map<string, { page: EdhPage; at: number }>> {
  const out = new Map<string, { page: EdhPage; at: number }>();
  const miss: string[] = [];
  for (const p of paths) {
    const mem = memCache.get(p);
    if (mem) out.set(p, mem);
    else miss.push(p);
  }
  if (miss.length) {
    const rows = await db.edhrec.bulkGet(miss).catch(() => []);
    for (const hit of rows) {
      if (hit) out.set(hit.path, remember(hit.path, parsePage(hit.data), hit.at));
    }
  }
  return out;
}

/** A page from the cache when younger than maxAge (default a day), else from EDHREC (stale copy if EDHREC can't answer). */
export async function fetchPage(path: string, maxAge = DAY): Promise<EdhPage> {
  const mem = memCache.get(path);
  if (mem && Date.now() - mem.at < maxAge) return mem.page;
  const hit = await db.edhrec.get(path);
  if (hit && Date.now() - hit.at < maxAge) return remember(path, parsePage(hit.data), hit.at).page;
  const existing = inFlight.get(path);
  if (existing) return existing;
  const job = (async () => {
    try {
      // Static CloudFront JSON pages: pace smoothly (~20/s across workers) with an 8s timeout so a stalled socket never hangs a worker.
      const start = Math.max(nextSlot, Date.now());
      nextSlot = start + 50;
      if (start > Date.now()) await new Promise((r) => setTimeout(r, start - Date.now()));
      const sig = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(8000) : undefined;
      // json.edhrec.com sends Access-Control-Allow-Origin: *, so no proxy is needed.
      const r = await fetch(`https://json.edhrec.com/pages/${path}.json`, { signal: sig }).catch(() => null);
      if (!r) {
        if (hit) return remember(path, parsePage(hit.data), hit.at).page;
        throw new Error('Could not reach EDHREC (offline?)');
      }
      if (r.status === 403 || r.status === 404) throw new NoPage('EDHREC has no page for this combination.');
      if (!r.ok) {
        if (hit) return remember(path, parsePage(hit.data), hit.at).page; // stale beats nothing
        throw new Error(`EDHREC answered ${r.status}`);
      }
      const data = await r.json();
      const now = Date.now();
      await db.edhrec.put({ path, data, at: now });
      return remember(path, parsePage(data), now).page;
    } finally {
      inFlight.delete(path);
    }
  })();
  inFlight.set(path, job);
  return job;
}

/**
 * Show the saved copy at once, then the fresh one when the saved copy is over a day old (fetched quietly).
 * Rejects only when there is nothing to show at all.
 */
export async function showPage(path: string, onPage: (p: EdhPage) => void): Promise<void> {
  const hit = await cachedPage(path);
  if (hit) onPage(hit.page);
  if (hit && Date.now() - hit.at < DAY) return;
  try {
    onPage(await fetchPage(path));
  } catch (e) {
    if (!hit) throw e;
  }
}

export function parsePage(j: any): EdhPage {
  const jd = j?.container?.json_dict ?? {};
  // Average decks carry the real 99 with quantities in deck.cards {Type: [[name, qty]]}.
  const deck = j?.deck?.cards as Record<string, [string, number][]> | undefined;
  const views: any[] = (jd.cardlists ?? []).flatMap((l: any) => l.cardviews ?? []);
  const idOf = new Map(views.map((v) => [v.name, v.id]));
  const lists: EdhList[] = deck
    ? Object.entries(deck).map(([header, cs]) => ({ header, cards: cs.map(([name, qty]) => ({ name, qty, id: idOf.get(name) })) }))
    : (jd.cardlists ?? []).map((l: any) => ({
        header: l.header,
        cards: (l.cardviews ?? []).map((v: any) => ({ name: v.name, id: v.id, decks: v.num_decks, potential: v.potential_decks, synergy: v.synergy, lift: v.lift })),
      }));
  return { header: j?.header ?? '', card: jd.card ? { id: jd.card.id, ci: jd.card.color_identity ?? [] } : undefined, numDecks: jd.card?.num_decks ?? j?.num_decks_avg, tags: j?.panels?.taglinks ?? [], lists };
}

/** Scryfall image by card id without an API call. */
export const imgOf = (id?: string, size: 'small' | 'normal' | 'art_crop' = 'small') => (id ? `https://cards.scryfall.io/${size}/front/${id[0]}/${id[1]}/${id}.jpg` : undefined);

/** EDHREC's salt scores (0-4, players' votes) for its top 1,000 saltiest cards, keyed by norm(name); cached a week. */
let saltLoad: Promise<Map<string, number>> | null = null;
export function saltMap(): Promise<Map<string, number>> {
  return (saltLoad ??= (async () => {
    const hit = await db.edhrec.get('salt:top1000');
    if (hit && Date.now() - hit.at < 7 * DAY) return new Map(hit.data as [string, number][]);
    const rows: [string, number][] = [];
    // shortcut: top 1,000 only (salt >= ~0.85); cards below count as 0. Fetch more pages if low-salt totals matter.
    for (let i = 0; i < 10; i++) {
      if (i) await new Promise((r) => setTimeout(r, 200));
      const j = await fetch(`https://json.edhrec.com/pages/top/salt${i ? `--${i}` : ''}.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
      const views: any[] = j?.cardviews ?? j?.container?.json_dict?.cardlists?.[0]?.cardviews ?? [];
      if (!views.length) break;
      for (const v of views) if (typeof v.salt === 'number') rows.push([norm(v.name), v.salt]);
    }
    if (!rows.length) {
      saltLoad = null; // offline: try again next time
      return new Map(hit ? (hit.data as [string, number][]) : []);
    }
    await db.edhrec.put({ path: 'salt:top1000', data: rows, at: Date.now() });
    return new Map(rows);
  })());
}

/** A deck's salt: EDHREC-style sum of card salt scores, plus the saltiest cards. */
export function deckSalt(names: string[], salt: Map<string, number>) {
  const hits = [...new Map(names.map((n) => [norm(n), n])).entries()].map(([k, name]) => ({ name, salt: salt.get(k) ?? 0 })).filter((c) => c.salt > 0);
  hits.sort((a, b) => b.salt - a.salt);
  return { total: hits.reduce((n, c) => n + c.salt, 0), top: hits.slice(0, 5) };
}

/** EDHREC's With card / Without card filter (web address verified: ?f=in=<Card>). Several cards are joined with ";"
 *  (not verified). */
export interface CardFilter {
  inc: string[];
  exc: string[];
}
export const filterQuery = (f: CardFilter) => [...f.inc.map((n) => `in=${n}`), ...f.exc.map((n) => `out=${n}`)].join(';');
export const filterWebUrl = (path: string, f: CardFilter) => `https://edhrec.com/${path}?f=${encodeURIComponent(filterQuery(f))}`;

/**
 * A commander page filtered to decks with / without cards. Self-testing: EDHREC's JSON may ignore the filter, so the
 * answer counts as filtered only when its deck count differs from the unfiltered page. `applied: false` = not filtered
 * (the caller says so and links to EDHREC's own filtered page). Cached like other pages, by path + filter.
 */
export async function fetchFiltered(path: string, f: CardFilter, base: EdhPage): Promise<{ page: EdhPage; applied: boolean }> {
  const q = filterQuery(f);
  const key = `${path}?f=${q}`;
  const hit = await db.edhrec.get(key).catch(() => undefined);
  let data = hit && Date.now() - hit.at < DAY ? hit.data : null;
  if (!data) {
    const start = Math.max(nextSlot, Date.now());
    nextSlot = start + 200;
    if (start > Date.now()) await new Promise((r) => setTimeout(r, start - Date.now()));
    const r = await fetch(`https://json.edhrec.com/pages/${path}.json?f=${encodeURIComponent(q)}`).catch(() => null);
    if (!r?.ok) return { page: base, applied: false };
    data = await r.json().catch(() => null);
    if (!data) return { page: base, applied: false };
    await db.edhrec.put({ path: key, data, at: Date.now() });
  }
  const page = parsePage(data);
  const applied = page.numDecks != null && base.numDecks != null && page.numDecks !== base.numDecks;
  return { page: applied ? page : base, applied };
}

/** The adapter's whole surface in one object, for callers that want to treat EDHREC as a swappable source. */
export const EDHREC = {
  name: 'EDHREC',
  terms: 'https://edhrec.com/terms',
  page: (slug: string, bracket = '', tag = '', budget = '') => fetchPage(pagePath('commander', slug, bracket, tag, budget)),
  average: (slug: string, bracket = '', tag = '', budget = '') => fetchPage(pagePath('average', slug, bracket, tag, budget)),
  cached: cachedPage,
  cachedMany: cachedPages,
  show: showPage,
  filtered: fetchFiltered,
  salt: saltMap,
} as const;

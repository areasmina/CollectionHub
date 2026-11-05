import { db } from './db';
import { norm } from './names';

// Bracket 1 (Exhibition) and "All" are left out on purpose (owner's call, Nov 2026): almost nobody builds for 1 and its
// EDHREC pages are thin. A commander without data for the chosen bracket falls back to its all-brackets page, with a note.
export const BRACKETS: [string, string][] = [['core', '2'], ['upgraded', '3'], ['optimized', '4'], ['cedh', '5']];
export const DEFAULT_BRACKET = 'upgraded';
export const BUDGETS: [string, string][] = [['', 'Any'], ['budget', '$'], ['expensive', '$$$']];

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

/** The saved copy of a page, however old (null if never fetched): lets a view show something at once. */
export async function cachedPage(path: string): Promise<{ page: EdhPage; at: number } | null> {
  const hit = await db.edhrec.get(path).catch(() => undefined);
  return hit ? { page: parsePage(hit.data), at: hit.at } : null;
}

/** A page from the cache when younger than maxAge (default a day), else from EDHREC (stale copy if EDHREC can't answer). */
export async function fetchPage(path: string, maxAge = DAY): Promise<EdhPage> {
  const hit = await db.edhrec.get(path);
  if (hit && Date.now() - hit.at < maxAge) return parsePage(hit.data);
  // Be polite: at most ~3 page requests a second (e.g. when ranking every commander).
  const start = Math.max(nextSlot, Date.now());
  nextSlot = start + 350;
  if (start > Date.now()) await new Promise((r) => setTimeout(r, start - Date.now()));
  // json.edhrec.com sends Access-Control-Allow-Origin: *, so no proxy is needed.
  const r = await fetch(`https://json.edhrec.com/pages/${path}.json`).catch(() => null);
  if (!r) {
    if (hit) return parsePage(hit.data);
    throw new Error('Could not reach EDHREC (offline?)');
  }
  if (r.status === 403 || r.status === 404) throw new NoPage('EDHREC has no page for this combination.');
  if (!r.ok) {
    if (hit) return parsePage(hit.data); // stale beats nothing
    throw new Error(`EDHREC answered ${r.status}`);
  }
  const data = await r.json();
  await db.edhrec.put({ path, data, at: Date.now() });
  return parsePage(data);
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
      if (i) await new Promise((r) => setTimeout(r, 350));
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

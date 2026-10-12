import { db } from './db';

export const BRACKETS: [string, string][] = [['', 'All'], ['exhibition', '1'], ['core', '2'], ['upgraded', '3'], ['optimized', '4'], ['cedh', '5']];
export const BUDGETS: [string, string][] = [['', 'Any'], ['budget', '$'], ['expensive', '$$$']];

export interface EdhCard {
  name: string;
  id?: string;
  decks?: number;
  potential?: number;
  synergy?: number;
  qty?: number;
}
export interface EdhList {
  header: string;
  cards: EdhCard[];
}
export interface EdhPage {
  header: string;
  numDecks?: number;
  tags: { slug: string; value: string; count: number }[];
  lists: EdhList[];
}

/** EDHREC's URL order: <slug>/<bracket>/<tag>/<budget>. */
export const pagePath = (kind: 'commander' | 'average', slug: string, bracket = '', tag = '', budget = '') =>
  [kind === 'commander' ? 'commanders' : 'average-decks', slug, bracket, tag, budget].filter(Boolean).join('/');

const DAY = 864e5;
export class NoPage extends Error {}

export async function fetchPage(path: string): Promise<EdhPage> {
  const hit = await db.edhrec.get(path);
  if (hit && Date.now() - hit.at < DAY) return parsePage(hit.data);
  // json.edhrec.com sends Access-Control-Allow-Origin: *, so no proxy is needed.
  const r = await fetch(`https://json.edhrec.com/pages/${path}.json`);
  if (r.status === 403 || r.status === 404) throw new NoPage('EDHREC has no page for this combination.');
  if (!r.ok) {
    if (hit) return parsePage(hit.data); // stale beats nothing
    throw new Error(`EDHREC answered ${r.status}`);
  }
  const data = await r.json();
  await db.edhrec.put({ path, data, at: Date.now() });
  return parsePage(data);
}

export function parsePage(j: any): EdhPage {
  const jd = j?.container?.json_dict ?? {};
  // Average decks carry the real 99 with quantities in deck.cards {Type: [[name, qty]]}.
  const deck = j?.deck?.cards as Record<string, [string, number][]> | undefined;
  const lists: EdhList[] = deck
    ? Object.entries(deck).map(([header, cs]) => ({ header, cards: cs.map(([name, qty]) => ({ name, qty })) }))
    : (jd.cardlists ?? []).map((l: any) => ({
        header: l.header,
        cards: (l.cardviews ?? []).map((v: any) => ({ name: v.name, id: v.id, decks: v.num_decks, potential: v.potential_decks, synergy: v.synergy })),
      }));
  return { header: j?.header ?? '', numDecks: jd.card?.num_decks ?? j?.num_decks_avg, tags: j?.panels?.taglinks ?? [], lists };
}

/** Scryfall image by card id without an API call. */
export const imgOf = (id?: string) => (id ? `https://cards.scryfall.io/small/front/${id[0]}/${id[1]}/${id}.jpg` : undefined);

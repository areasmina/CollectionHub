import { db, type Card, type Deck, type Entry } from './db';
import { groupOf } from './deckstats';
import { norm } from './names';
import { finishUsd } from './prices';

/**
 * Collection analytics (roadmap P2.5): what your binder is made of, and what it has been worth.
 * Everything here is worked out from what the app already stores (entries, cached Scryfall cards, decks and the daily
 * price snapshots `lib/pricewatch` keeps for two weeks). Nothing new is saved, so no card data is ever at risk.
 */

export interface Slice {
  key: string;
  label: string;
  cards: number; // copies
  usd: number; // value of those copies, USD at your printing and finish
}

export interface ValuePoint {
  day: string; // YYYY-MM-DD
  usd: number; // what the cards you own today were worth that day
}

export interface Analytics {
  cards: number;
  unique: number;
  usd: number;
  colours: Slice[];
  types: Slice[];
  curve: Slice[]; // mana value 0,1,…,6,7+ (lands left out: they have no cost to speak of)
  sets: Slice[]; // biggest first, top 8
  setCount: number; // how many different sets the binder's copies come from
  rarity: Slice[]; // common, uncommon, rare, mythic, then anything else (special, bonus, unknown)
  dearest: { name: string; usd: number; foil: boolean } | null; // the most valuable single copy, at its finish
  average: number; // worth per copy, USD
  inDecks: { used: number; idle: number; decks: number };
  history: ValuePoint[];
}

const COLOURS: [string, string][] = [
  ['W', 'White'],
  ['U', 'Blue'],
  ['B', 'Black'],
  ['R', 'Red'],
  ['G', 'Green'],
];

const usdOf = (c: Card | undefined, e: Entry) => Number(finishUsd(c, e.foil) ?? 0) * e.qty;

/** What a binder is worth, USD, at your printings and finishes (the same sum as the Collection's "worth about"). */
export const worthOf = (entries: Entry[], cards: Map<string, Card>) =>
  Math.round(entries.reduce((n, e) => n + usdOf(cards.get(e.cardId), e), 0) * 100) / 100;

/** Adds one entry's copies and value into a bucket. */
function add(into: Map<string, Slice>, key: string, label: string, e: Entry, usd: number) {
  const s = into.get(key) ?? { key, label, cards: 0, usd: 0 };
  s.cards += e.qty;
  s.usd += usd;
  into.set(key, s);
}

/** Colours by colour identity: a card counts once per colour it is in, plus Colourless and Multicolour of its own. */
function colourSlices(rows: { e: Entry; c?: Card; usd: number }[]): Slice[] {
  const out = new Map<string, Slice>();
  for (const [key, label] of COLOURS) out.set(key, { key, label, cards: 0, usd: 0 });
  out.set('C', { key: 'C', label: 'Colourless', cards: 0, usd: 0 });
  out.set('M', { key: 'M', label: 'Multicolour', cards: 0, usd: 0 });
  for (const { e, c, usd } of rows) {
    const ci = c?.ci ?? [];
    if (!ci.length) add(out, 'C', 'Colourless', e, usd);
    for (const x of ci) if (out.has(x)) add(out, x, out.get(x)!.label, e, usd);
    if (ci.length > 1) add(out, 'M', 'Multicolour', e, usd);
  }
  return [...out.values()];
}

const RARITIES: [string, string][] = [
  ['common', 'Common'],
  ['uncommon', 'Uncommon'],
  ['rare', 'Rare'],
  ['mythic', 'Mythic'],
];

/** Copies and worth by rarity. Special, bonus and cards whose rarity isn't known yet share one "Other" bar. */
function raritySlices(rows: { e: Entry; c?: Card; usd: number }[]): Slice[] {
  const out = new Map<string, Slice>();
  for (const [key, label] of RARITIES) out.set(key, { key, label, cards: 0, usd: 0 });
  out.set('other', { key: 'other', label: 'Other', cards: 0, usd: 0 });
  for (const { e, c, usd } of rows) {
    const k = c?.rarity && out.has(c.rarity) ? c.rarity : 'other';
    add(out, k, out.get(k)!.label, e, usd);
  }
  return [...out.values()];
}

/** The most valuable single copy (per copy, at the finish you own); ties go to the name first in the alphabet. */
function dearestCopy(rows: { e: Entry; c?: Card; usd: number }[]) {
  let best: { name: string; usd: number; foil: boolean } | null = null;
  for (const { e, c } of rows) {
    const unit = Number(finishUsd(c, e.foil) ?? 0);
    const name = c?.name ?? e.name;
    if (unit > 0 && (!best || unit > best.usd || (unit === best.usd && name < best.name))) best = { name, usd: unit, foil: !!e.foil };
  }
  return best;
}

/** Mana curve of the non-land cards: 0, 1, … 6, then 7+. */
function curveSlices(rows: { e: Entry; c?: Card; usd: number }[]): Slice[] {
  const out = new Map<string, Slice>();
  for (let i = 0; i <= 7; i++) out.set(String(i), { key: String(i), label: i === 7 ? '7+' : String(i), cards: 0, usd: 0 });
  for (const { e, c, usd } of rows) {
    if (!c || groupOf(c.type) === 'Lands') continue;
    const k = String(Math.min(7, Math.max(0, Math.round(c.cmc ?? 0))));
    add(out, k, out.get(k)!.label, e, usd);
  }
  return [...out.values()];
}

/** What the cards you own today were worth on each day a snapshot exists (so one line, not a jumping one). */
export function valueHistory(
  entries: Entry[],
  snaps: { day: string; prices: Map<string, { usd: number | null; foil: number | null }> }[],
): ValuePoint[] {
  return snaps
    .map(({ day, prices }) => ({
      day,
      usd:
        Math.round(
          entries.reduce((n, e) => {
            const p = prices.get(e.cardId);
            if (!p) return n;
            const unit = e.foil ? (p.foil ?? p.usd) : p.usd;
            return n + (unit ?? 0) * e.qty;
          }, 0) * 100,
        ) / 100,
    }))
    .filter((p) => p.usd > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Every price snapshot on this device, oldest first (two weeks at most: `lib/pricewatch` drops older ones). */
export async function allSnapshots() {
  const keys = (await db.edhrec.where('path').startsWith('pricesnap:').primaryKeys()).sort();
  const rows = await Promise.all(keys.map((k) => db.edhrec.get(k)));
  return rows.flatMap((hit, i) =>
    hit
      ? [{
          day: String(keys[i]).slice('pricesnap:'.length),
          prices: new Map((hit.data as [string, number | null, number | null][]).map(([id, u, f]) => [id, { usd: u, foil: f }])),
        }]
      : [],
  );
}

/** The whole picture for one binder. `snaps` comes from `allSnapshots()`; without it there is simply no history yet. */
export function analyse(
  entries: Entry[],
  cards: Map<string, Card>,
  decks: Deck[],
  snaps: { day: string; prices: Map<string, { usd: number | null; foil: number | null }> }[] = [],
): Analytics {
  const rows = entries.map((e) => {
    const c = cards.get(e.cardId);
    return { e, c, usd: usdOf(c, e) };
  });
  const types = new Map<string, Slice>();
  const sets = new Map<string, Slice>();
  for (const { e, c, usd } of rows) {
    const g = c ? groupOf(c.type) : 'Other';
    add(types, g, g, e, usd);
    const code = (e.set ?? c?.set ?? '').toUpperCase() || '—';
    add(sets, code, code, e, usd);
  }
  // A card is "in a deck" when any deck of this binder lists it, however many copies (decks are virtual lists).
  const wanted = new Set(decks.flatMap((d) => [...d.cards.map((c) => norm(c.name)), ...(d.commander ? [norm(d.commander)] : []), ...(d.partner ? [norm(d.partner)] : [])]));
  const keys = new Map<string, boolean>();
  for (const { e, c } of rows) keys.set(c?.key ?? norm(e.name), wanted.has(c?.key ?? norm(e.name)));
  const used = [...keys.values()].filter(Boolean).length;
  const copies = entries.reduce((n, e) => n + e.qty, 0);
  const usd = Math.round(rows.reduce((n, r) => n + r.usd, 0) * 100) / 100;
  return {
    cards: copies,
    unique: keys.size,
    usd,
    colours: colourSlices(rows),
    types: [...types.values()].sort((a, b) => b.cards - a.cards),
    curve: curveSlices(rows),
    sets: [...sets.values()].sort((a, b) => b.cards - a.cards || a.key.localeCompare(b.key)).slice(0, 8),
    setCount: [...sets.keys()].filter((k) => k !== '—').length,
    rarity: raritySlices(rows),
    dearest: dearestCopy(rows),
    average: copies ? Math.round((usd / copies) * 100) / 100 : 0,
    inDecks: { used, idle: keys.size - used, decks: decks.length },
    history: valueHistory(entries, snaps),
  };
}

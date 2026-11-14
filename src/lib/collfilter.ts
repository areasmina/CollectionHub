import type { Card, Entry } from './db';
import { norm } from './names';
import { finishUsd, toCad } from './prices';

/** The binder's filters (one sheet, the same shape on every list): colours, card types and what a card is doing.
 *  Every group is "any of these"; groups together are "all of these". Nothing is stored: a fresh visit starts clear. */
export const COLOURS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export const COLOUR_NAME: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colourless' };
export const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'] as const;
export type Show = 'all' | 'commanders' | 'indeck' | 'free';
export const SHOW_LABEL: Record<Show, string> = { all: 'All', commanders: 'Commanders', indeck: 'In a deck', free: 'Not in a deck' };
/** Mana value buckets (Scryfall's mana value; lands and cards with no cost are 0). */
export const MVS = ['0', '1', '2', '3', '4', '5', '6', '7+'] as const;
/** Price bands per copy, in ≈CA$, at your printing and finish (the same price the card shows). Bands never overlap. */
export const PRICES = ['u1', 'u5', 'u20', 'o20'] as const;
export const PRICE_LABEL: Record<string, string> = { u1: 'Under CA$1', u5: 'CA$1–5', u20: 'CA$5–20', o20: 'CA$20 and up' };
export type Finish = 'all' | 'foil' | 'nonfoil';
export const FINISH_LABEL: Record<Finish, string> = { all: 'All', foil: 'Foil', nonfoil: 'Non-foil' };

export interface CollFilter {
  colours: string[];
  types: string[];
  show: Show;
  mv: string[];
  prices: string[];
  finish: Finish;
}
export const noFilter = (): CollFilter => ({ colours: [], types: [], show: 'all', mv: [], prices: [], finish: 'all' });

/** How many groups are narrowing the list (what the Filter button counts). */
export const filterCount = (f: CollFilter) =>
  Number(f.colours.length > 0) + Number(f.types.length > 0) + Number(f.show !== 'all') + Number(f.mv.length > 0) + Number(f.prices.length > 0) + Number(f.finish !== 'all');

type Kind = 'colours' | 'types' | 'show' | 'mv' | 'prices' | 'finish';

/** One removable chip per picked value, so nothing that narrows the list is hidden. */
export function filterChips(f: CollFilter): { kind: Kind; value: string; label: string }[] {
  return [
    ...f.colours.map((v) => ({ kind: 'colours' as const, value: v, label: COLOUR_NAME[v] ?? v })),
    ...f.types.map((v) => ({ kind: 'types' as const, value: v, label: v + (v.endsWith('s') ? '' : 's') })),
    ...(f.show !== 'all' ? [{ kind: 'show' as const, value: f.show, label: SHOW_LABEL[f.show] }] : []),
    ...f.mv.map((v) => ({ kind: 'mv' as const, value: v, label: `MV ${v}` })),
    ...f.prices.map((v) => ({ kind: 'prices' as const, value: v, label: PRICE_LABEL[v] ?? v })),
    ...(f.finish !== 'all' ? [{ kind: 'finish' as const, value: f.finish, label: FINISH_LABEL[f.finish] }] : []),
  ];
}

export function toggled(f: CollFilter, kind: Kind, value: string): CollFilter {
  if (kind === 'show') return { ...f, show: f.show === value ? 'all' : (value as Show) };
  if (kind === 'finish') return { ...f, finish: f.finish === value ? 'all' : (value as Finish) };
  const has = f[kind].includes(value);
  return { ...f, [kind]: has ? f[kind].filter((x) => x !== value) : [...f[kind], value] };
}

/** The card's main type, for the type filter (a card with several types, like an artifact creature, counts for each). */
const hasType = (type = '', t: string) => type.includes(t);
/** The card's mana value bucket ('7+' for 7 and up). */
export const mvOf = (cmc: number) => (cmc >= 7 ? '7+' : String(Math.max(0, Math.floor(cmc))));
/** The price band of one copy at this printing and finish, or undefined when Scryfall has no price for it. */
export function priceBand(c: Pick<Card, 'usd' | 'usdFoil'> | undefined, foil?: boolean): (typeof PRICES)[number] | undefined {
  const cad = toCad(finishUsd(c, foil));
  if (cad == null || Number.isNaN(cad)) return undefined;
  return cad < 1 ? 'u1' : cad < 5 ? 'u5' : cad < 20 ? 'u20' : 'o20';
}

export interface FilterEnv {
  cardOf: (e: Entry) => Card | undefined;
  /** names (norm) of cards in an active deck */
  inDeck: (name: string) => boolean;
  isCommander: (card: Card) => boolean;
}

export function matches(e: Entry, f: CollFilter, env: FilterEnv): boolean {
  const c = env.cardOf(e);
  if (f.colours.length) {
    // colour identity, with "C" meaning none. A card whose data hasn't arrived yet can't be placed, so it is left out.
    if (!c) return false;
    const ci = c.ci?.length ? c.ci : ['C'];
    if (!ci.some((x) => f.colours.includes(x))) return false;
  }
  if (f.types.length) {
    if (!c || !f.types.some((t) => hasType(c.type, t))) return false;
  }
  if (f.show === 'commanders' && !(c && env.isCommander(c))) return false;
  if (f.show === 'indeck' && !env.inDeck(e.name)) return false;
  if (f.show === 'free' && env.inDeck(e.name)) return false;
  // mana value and price need the card's data, like colours and types; a card with no price never passes a price band
  if (f.mv.length && !(c && c.cmc != null && f.mv.includes(mvOf(c.cmc)))) return false;
  if (f.prices.length) {
    const band = priceBand(c, e.foil);
    if (!band || !f.prices.includes(band)) return false;
  }
  if (f.finish === 'foil' && !e.foil) return false;
  if (f.finish === 'nonfoil' && e.foil) return false;
  return true;
}

export const applyFilter = (entries: Entry[], f: CollFilter, env: FilterEnv) => (filterCount(f) ? entries.filter((e) => matches(e, f, env)) : entries);

export const keyOf = norm;

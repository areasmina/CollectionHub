import type { Card, Entry } from './db';
import { norm } from './names';

/** The binder's filters (one sheet, the same shape on every list): colours, card types and what a card is doing.
 *  Every group is "any of these"; groups together are "all of these". Nothing is stored: a fresh visit starts clear. */
export const COLOURS = ['W', 'U', 'B', 'R', 'G', 'C'] as const;
export const COLOUR_NAME: Record<string, string> = { W: 'White', U: 'Blue', B: 'Black', R: 'Red', G: 'Green', C: 'Colourless' };
export const TYPES = ['Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker', 'Land'] as const;
export type Show = 'all' | 'commanders' | 'indeck' | 'free';
export const SHOW_LABEL: Record<Show, string> = { all: 'All', commanders: 'Commanders', indeck: 'In a deck', free: 'Not in a deck' };

export interface CollFilter {
  colours: string[];
  types: string[];
  show: Show;
}
export const noFilter = (): CollFilter => ({ colours: [], types: [], show: 'all' });

/** How many groups are narrowing the list (what the Filter button counts). */
export const filterCount = (f: CollFilter) => Number(f.colours.length > 0) + Number(f.types.length > 0) + Number(f.show !== 'all');

/** One removable chip per picked value, so nothing that narrows the list is hidden. */
export function filterChips(f: CollFilter): { kind: 'colours' | 'types' | 'show'; value: string; label: string }[] {
  return [
    ...f.colours.map((v) => ({ kind: 'colours' as const, value: v, label: COLOUR_NAME[v] ?? v })),
    ...f.types.map((v) => ({ kind: 'types' as const, value: v, label: v + (v.endsWith('s') ? '' : 's') })),
    ...(f.show !== 'all' ? [{ kind: 'show' as const, value: f.show, label: SHOW_LABEL[f.show] }] : []),
  ];
}

export function toggled(f: CollFilter, kind: 'colours' | 'types' | 'show', value: string): CollFilter {
  if (kind === 'show') return { ...f, show: f.show === value ? 'all' : (value as Show) };
  const has = f[kind].includes(value);
  return { ...f, [kind]: has ? f[kind].filter((x) => x !== value) : [...f[kind], value] };
}

/** The card's main type, for the type filter (a card with several types, like an artifact creature, counts for each). */
const hasType = (type = '', t: string) => type.includes(t);

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
  return true;
}

export const applyFilter = (entries: Entry[], f: CollFilter, env: FilterEnv) => (filterCount(f) ? entries.filter((e) => matches(e, f, env)) : entries);

export const keyOf = norm;

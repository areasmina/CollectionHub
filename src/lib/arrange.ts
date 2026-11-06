/** Sorting and filtering card lists (deck page, commander page). */
export type SortKey = 'list' | 'name' | 'price-desc' | 'price-asc' | 'mv' | 'owned' | 'missing';
export type Show = 'all' | 'owned' | 'missing';

export const SORTS: [SortKey, string][] = [
  ['mv', 'MANA VALUE'],
  ['name', 'NAME A→Z'],
  ['price-desc', 'PRICE HIGH→LOW'],
  ['price-asc', 'PRICE LOW→HIGH'],
  ['owned', 'OWNED FIRST'],
  ['missing', 'MISSING FIRST'],
];
export const SHOWS: [Show, string][] = [
  ['all', 'ALL CARDS'],
  ['owned', 'OWNED ONLY'],
  ['missing', 'MISSING ONLY'],
];

export interface Facts {
  name: string;
  usd?: number; // unknown prices sort last either way
  mv?: number;
  owned: boolean;
}

/** Stable sort; ties (and 'list', the original order) fall back as stated. */
export function sortBy<T>(items: T[], key: SortKey, facts: (t: T) => Facts): T[] {
  if (key === 'list') return items;
  const f = new Map(items.map((t) => [t, facts(t)]));
  const byName = (a: Facts, b: Facts) => a.name.localeCompare(b.name);
  const byMv = (a: Facts, b: Facts) => (a.mv ?? 99) - (b.mv ?? 99) || byName(a, b);
  const price = (dir: 1 | -1) => (a: Facts, b: Facts) => (a.usd === undefined ? 1 : 0) - (b.usd === undefined ? 1 : 0) || dir * ((a.usd ?? 0) - (b.usd ?? 0)) || byName(a, b);
  const cmp: Record<Exclude<SortKey, 'list'>, (a: Facts, b: Facts) => number> = {
    name: byName,
    mv: byMv,
    'price-desc': price(-1),
    'price-asc': price(1),
    owned: (a, b) => Number(b.owned) - Number(a.owned) || byMv(a, b),
    missing: (a, b) => Number(a.owned) - Number(b.owned) || byMv(a, b),
  };
  return [...items].sort((a, b) => cmp[key](f.get(a)!, f.get(b)!));
}

export const shows = (show: Show, owned: boolean) => show === 'all' || (show === 'owned') === owned;

/** ONLY (owner's ask, Nov 6): Game Changers and price filters on a deck's cards. Prices in CAD; unknown prices never pass a price filter. */
export type Only = 'all' | 'gc' | 'under5' | 'under20' | 'over20';
export const ONLYS: [Only, string][] = [
  ['all', 'EVERY CARD'],
  ['gc', 'GAME CHANGERS'],
  ['under5', 'UNDER CA$5'],
  ['under20', 'UNDER CA$20'],
  ['over20', 'CA$20 AND UP'],
];
export function onlyOk(only: Only, f: { gc: boolean; cad?: number }) {
  if (only === 'all') return true;
  if (only === 'gc') return f.gc;
  if (f.cad == null) return false;
  return only === 'under5' ? f.cad < 5 : only === 'under20' ? f.cad < 20 : f.cad >= 20;
}

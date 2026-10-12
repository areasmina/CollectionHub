import { norm } from './names';

export type Status = 'owned' | 'other' | 'missing';

/** Copies owned per card key. */
export function ownedMap(entries: { name: string; qty: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) m.set(norm(e.name), (m.get(norm(e.name)) ?? 0) + e.qty);
  return m;
}

/** owned = in this binder; other = only in the other binder (never counted as owned). */
// Basic lands are never worth listing as missing.
const BASICS = new Set(['plains', 'island', 'swamp', 'mountain', 'forest', 'wastes', 'snow-covered plains', 'snow-covered island', 'snow-covered swamp', 'snow-covered mountain', 'snow-covered forest']);

export function statusOf(name: string, mine: Map<string, number>, other?: Map<string, number>): Status {
  const k = norm(name);
  if (mine.has(k) || BASICS.has(k)) return 'owned';
  return other?.has(k) ? 'other' : 'missing';
}

export function summarize(names: string[], mine: Map<string, number>, other?: Map<string, number>) {
  const s = { owned: 0, other: 0, missing: 0, total: names.length, pct: 0 };
  for (const n of names) s[statusOf(n, mine, other)]++;
  s.pct = s.total ? Math.round((100 * s.owned) / s.total) : 0;
  return s;
}

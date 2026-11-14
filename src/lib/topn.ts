/**
 * The first `n` items of an already-sorted list, one per key (the first item with each key wins, order kept).
 * One pass with a Set, so it stays instant on a whole collection: the Top 3 widget used to compare every card with
 * every other card on each keystroke (2,500 cards took about 2 seconds per letter typed in the search).
 */
export function firstPerKey<T>(xs: readonly T[], keyOf: (x: T) => unknown, n = Infinity): T[] {
  const seen = new Set<unknown>();
  const out: T[] = [];
  for (const x of xs) {
    if (out.length >= n) break;
    const k = keyOf(x);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

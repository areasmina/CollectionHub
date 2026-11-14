import { describe, expect, it } from 'vitest';
import { firstPerKey } from './topn';

// the old rule it replaces: keep an item only if it is the first one with its key
const old = <T>(xs: T[], keyOf: (x: T) => unknown) => xs.filter((x, j, a) => a.findIndex((y) => keyOf(y) === keyOf(x)) === j);

describe('firstPerKey (Top 3 widget: one printing per card)', () => {
  it('keeps the first item of each key, in order', () => {
    const xs = [{ k: 'sol ring', p: 9 }, { k: 'sol ring', p: 5 }, { k: 'counterspell', p: 4 }, { k: 'cultivate', p: 1 }];
    expect(firstPerKey(xs, (x) => x.k, 3).map((x) => x.p)).toEqual([9, 4, 1]);
  });
  it('stops at n', () => {
    expect(firstPerKey([1, 2, 3, 4, 5], (x) => x, 2)).toEqual([1, 2]);
  });
  it('gives exactly what the old two-loop rule gave, on a mixed list with missing keys', () => {
    const xs = Array.from({ length: 400 }, (_, i) => ({ i, k: i % 7 === 0 ? undefined : `card ${i % 37}` }));
    expect(firstPerKey(xs, (x) => x.k)).toEqual(old(xs, (x) => x.k));
    expect(firstPerKey(xs, (x) => x.k, 3)).toEqual(old(xs, (x) => x.k).slice(0, 3));
  });
  it('is fast on a whole collection', () => {
    const xs = Array.from({ length: 50_000 }, (_, i) => ({ k: `card ${i % 20_000}` }));
    const t = performance.now();
    firstPerKey(xs, (x) => x.k, 3);
    firstPerKey(xs, (x) => x.k);
    expect(performance.now() - t).toBeLessThan(200);
  });
});

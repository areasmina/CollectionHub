import { describe, expect, it } from 'vitest';
import { deckShares } from './deckshare';
import type { DeckCard } from './db';

const c = (name: string, qty = 1): DeckCard => ({ name, qty });

describe('deck shares: one owned copy counts for one deck', () => {
  it('the older deck gets a shared card; the newer deck shows it missing', () => {
    const mine = new Map([['sol ring', 1]]);
    const [older, newer] = deckShares(
      [
        { id: 2, cards: [c('Sol Ring')] },
        { id: 1, cards: [c('Sol Ring')] },
      ],
      mine,
    );
    expect(older.pct).toBe(0); // id 2 is the newer deck, listed first
    expect(newer.pct).toBe(100);
  });

  it('two copies serve two decks', () => {
    const mine = new Map([['sol ring', 2]]);
    const s = deckShares([{ id: 1, cards: [c('Sol Ring')] }, { id: 2, cards: [c('Sol Ring')] }], mine);
    expect(s.map((x) => x.pct)).toEqual([100, 100]);
  });

  it('quantities count: a deck wanting 4 needs 4 copies', () => {
    const s = deckShares([{ id: 1, cards: [c('Rat', 4)] }], new Map([['rat', 3]]));
    expect(s[0]).toEqual({ total: 4, owned: 3, missing: 1, pct: 75 });
  });

  it('basic lands are always owned', () => {
    const s = deckShares([{ id: 1, cards: [c('Swamp', 10), c('Sol Ring')] }], new Map());
    expect(s[0].owned).toBe(10);
    expect(s[0].missing).toBe(1);
  });

  it('a deck with no id is served after the saved ones', () => {
    const mine = new Map([['sol ring', 1]]);
    const [unsaved, saved] = deckShares([{ cards: [c('Sol Ring')] }, { id: 5, cards: [c('Sol Ring')] }], mine);
    expect(saved.pct).toBe(100);
    expect(unsaved.pct).toBe(0);
  });
});

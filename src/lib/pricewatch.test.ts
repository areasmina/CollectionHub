import { describe, expect, it } from 'vitest';
import type { Card, Entry } from './db';
import { movers } from './pricewatch';

const card = (id: string, usd: string, usdFoil?: string) => ({ id, usd, usdFoil }) as Card;
const e = (id: string, foil = false, qty = 1): Entry => ({ id: id.length, profile: 1, cardId: id, name: id, qty, foil });

describe('movers', () => {
  const cards = new Map([
    ['a', card('a', '10', '30')],
    ['b', card('b', '2')],
    ['c', card('c', '5')],
    ['d', card('d', '1')],
  ]);
  const then = new Map([
    ['a', { usd: 8, foil: 20 }],
    ['b', { usd: 3, foil: null }],
    ['c', { usd: 5, foil: null }],
    ['d', { usd: 0.5, foil: null }],
  ]);
  const entries = [e('a'), e('a', true), e('b'), e('c'), e('d'), e('d')];
  it('ranks risers by per-copy change at the owned finish, one row per printing+finish', () => {
    expect(movers(entries, cards, then, 'up').map((m) => [m.entry.cardId, m.entry.foil, m.diff])).toEqual([
      ['a', true, 10],
      ['a', false, 2],
      ['d', false, 0.5],
    ]);
  });
  it('ranks fallers, skips unchanged and cards without a past price', () => {
    expect(movers([...entries, e('zz')], cards, then, 'down').map((m) => [m.entry.cardId, m.diff])).toEqual([['b', -1]]);
  });
});

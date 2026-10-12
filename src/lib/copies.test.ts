import { describe, expect, it } from 'vitest';
import { shortfalls, shortText } from './copies';

const deck = (name: string, cards: [string, number][]) => ({ name, cards: cards.map(([n, qty]) => ({ name: n, qty })) });

describe('shortfalls', () => {
  const owned = new Map([['sol ring', 1], ['arcane signet', 2], ['relentless rats', 10], ['forest', 1]]);
  const decks = [deck('A', [['Sol Ring', 1], ['Arcane Signet', 1], ['Forest', 30], ['Cultivate', 1]]), deck('B', [['Sol Ring', 1], ['Arcane Signet', 1], ['Relentless Rats', 12]]), deck('C', [['Sol Ring', 1]])];
  const s = shortfalls(decks, owned);
  it('counts copies across decks against copies owned', () => {
    expect(s.map((x) => [x.name, x.own, x.need, x.short])).toEqual([
      ['Relentless Rats', 10, 12, 2],
      ['Sol Ring', 1, 3, 2],
    ]);
    expect(s[1].decks).toEqual(['A', 'B', 'C']);
  });
  it('skips basics, cards with enough copies and cards not owned at all', () => {
    expect(s.find((x) => /forest|signet|cultivate/i.test(x.name))).toBeUndefined();
  });
  it('words the alert', () => {
    expect(shortText({ name: 'X', own: 1, need: 2, short: 1, decks: [] })).toBe("You'll need 1 more copy of X to have it in all decks");
  });
});

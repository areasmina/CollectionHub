import { describe, expect, it } from 'vitest';
import { analyse, valueHistory, worthOf } from './analytics';
import type { Card, Deck, Entry } from './db';

const card = (id: string, o: Partial<Card>): Card => ({ id, name: id, key: id, type: 'Creature — Elf', text: '', ci: [], legal: true, ...o });
const entry = (cardId: string, o: Partial<Entry> = {}): Entry => ({ profile: 1, cardId, name: cardId, qty: 1, ...o });

const cards = new Map<string, Card>([
  ['sol', card('sol', { type: 'Artifact', ci: [], cmc: 1, usd: '1.50', set: 'c21' })],
  ['cobra', card('cobra', { type: 'Creature — Snake', ci: ['G'], cmc: 2, usd: '6.00', usdFoil: '12.00', set: 'znr' })],
  ['tatyova', card('tatyova', { type: 'Legendary Creature — Merfolk Druid', ci: ['G', 'U'], cmc: 5, usd: '0.40', set: 'dom' })],
  ['forest', card('forest', { type: 'Basic Land — Forest', ci: [], cmc: 0, usd: '0.10', set: 'znr' })],
  ['titan', card('titan', { type: 'Creature — Giant', ci: ['G'], cmc: 8, usd: '20.00', set: 'm12' })],
]);

const binder: Entry[] = [
  entry('sol'),
  entry('cobra', { foil: true }),
  entry('tatyova'),
  entry('forest', { qty: 10 }),
  entry('titan'),
];

const decks: Deck[] = [{ profile: 1, name: 'Tatyova Lands', commander: 'tatyova', cards: [{ name: 'sol', qty: 1 }, { name: 'forest', qty: 10 }], updated: 0 }];

describe('analyse', () => {
  const a = analyse(binder, cards, decks);

  it('counts copies, names and value at your printing and finish', () => {
    expect(a.cards).toBe(14); // 10 forests and four singles
    expect(a.unique).toBe(5);
    expect(a.usd).toBeCloseTo(1.5 + 12 + 0.4 + 1 + 20, 2); // the foil Cobra counts at its foil price
  });

  it('splits colours by colour identity, with multicolour counted on its own', () => {
    const by = Object.fromEntries(a.colours.map((s) => [s.key, s.cards]));
    expect(by.G).toBe(3); // Cobra, Tatyova, Titan
    expect(by.U).toBe(1); // Tatyova
    expect(by.M).toBe(1); // Tatyova again, as a multicolour card
    expect(by.C).toBe(11); // Sol Ring and ten Forests
    expect(by.R).toBe(0);
  });

  it('groups types and sets, biggest first', () => {
    expect(a.types[0]).toMatchObject({ key: 'Lands', cards: 10 });
    expect(a.types.find((t) => t.key === 'Creatures')?.cards).toBe(3);
    expect(a.sets[0]).toMatchObject({ key: 'ZNR', cards: 11 });
  });

  it('builds a mana curve without lands, with 7+ as one bucket', () => {
    const by = Object.fromEntries(a.curve.map((s) => [s.key, s.cards]));
    expect(by['0']).toBe(0); // the Forests are left out
    expect(by['1']).toBe(1);
    expect(by['2']).toBe(1);
    expect(by['5']).toBe(1);
    expect(by['7']).toBe(1); // the eight-drop lands in 7+
    expect(a.curve.at(-1)?.label).toBe('7+');
  });

  it('says what sits in a deck and what is idle', () => {
    expect(a.inDecks).toEqual({ used: 3, idle: 2, decks: 1 }); // Sol Ring, Forest and the commander
  });

  it('has no history until a snapshot exists', () => {
    expect(a.history).toEqual([]);
  });
});

describe('valueHistory', () => {
  const snap = (day: string, usd: number, foil: number) => ({ day, prices: new Map([['cobra', { usd, foil }], ['sol', { usd: 1, foil: null }]]) });

  it('values the cards you own today at each day’s prices, oldest first', () => {
    const h = valueHistory([entry('cobra', { foil: true }), entry('sol')], [snap('2026-11-10', 5, 10), snap('2026-11-08', 4, 8)]);
    expect(h).toEqual([
      { day: '2026-11-08', usd: 9 }, // foil Cobra 8 + Sol Ring 1
      { day: '2026-11-10', usd: 11 },
    ]);
  });

  it('falls back to the non-foil price when a day has no foil price, and skips cards that day did not know', () => {
    const h = valueHistory([entry('cobra', { foil: true }), entry('ghost')], [{ day: '2026-11-09', prices: new Map([['cobra', { usd: 3, foil: null }]]) }]);
    expect(h).toEqual([{ day: '2026-11-09', usd: 3 }]);
  });

  it('leaves out days where nothing you own had a price', () => {
    expect(valueHistory([entry('cobra')], [{ day: '2026-11-09', prices: new Map() }])).toEqual([]);
  });
});

describe('the full analysis page (Phase 2, Nov 23): at a glance and rarity', () => {
  const a = analyse(binder, cards, decks);

  it('counts the sets the copies come from (Sol Ring, Cobra and Forest, Tatyova, Titan: four)', () => {
    // entries carry no set of their own here, so the card's set is used; Cobra and the Forests share ZNR
    expect(a.setCount).toBe(4);
  });

  it('names the most valuable single copy at the finish you own', () => {
    expect(a.dearest).toEqual({ name: 'titan', usd: 20, foil: false }); // Titan 20 beats the foil Cobra at 12
    const foilWins = analyse([entry('cobra', { foil: true }), entry('sol')], cards, []);
    expect(foilWins.dearest).toEqual({ name: 'cobra', usd: 12, foil: true });
  });

  it('gives the worth per copy, the same total the Collection shows', () => {
    expect(a.average).toBeCloseTo((1.5 + 12 + 0.4 + 1 + 20) / 14, 2);
    expect(worthOf(binder, cards)).toBe(a.usd);
  });

  it('splits copies and worth by rarity; unknown rarities share Other', () => {
    const rc = new Map<string, Card>([
      ['m', card('m', { rarity: 'mythic', usd: '30' })],
      ['r', card('r', { rarity: 'rare', usd: '2' })],
      ['c', card('c', { rarity: 'common', usd: '0.10' })],
      ['s', card('s', { rarity: 'special', usd: '5' })],
      ['x', card('x', {})],
    ]);
    const r = analyse([entry('m'), entry('r', { qty: 2 }), entry('c', { qty: 10 }), entry('s'), entry('x')], rc, []);
    const by = Object.fromEntries(r.rarity.map((s) => [s.key, [s.cards, Math.round(s.usd * 100) / 100]]));
    expect(by).toEqual({ common: [10, 1], uncommon: [0, 0], rare: [2, 4], mythic: [1, 30], other: [2, 5] });
    expect(r.rarity.map((s) => s.key)).toEqual(['common', 'uncommon', 'rare', 'mythic', 'other']);
  });

  it('has no dearest copy and a zero average when nothing has a price', () => {
    const none = analyse([entry('x')], new Map([['x', card('x', {})]]), []);
    expect(none.dearest).toBeNull();
    expect(none.average).toBe(0);
  });
});

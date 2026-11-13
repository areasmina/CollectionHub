import { describe, expect, it } from 'vitest';
import { allocate } from '../lib/allocation';
import { inUseChip } from './chips';
import { buyGroups, coverage, coverageText, firstInCap, overCap, ownedOnly, preferOwned } from './modes';

const own = new Set(['sol ring', 'arcane signet', 'cultivate', 'forest']);
const owns = (n: string) => own.has(n.toLowerCase());

describe('coverage', () => {
  it('counts binder cards, stand-ins and cards to buy', () => {
    const c = coverage(
      [
        { slot: 'Sol Ring', name: 'Sol Ring', qty: 1 },
        { slot: 'Rhystic Study', name: 'Cultivate', qty: 1 },
        { slot: 'Mana Crypt', name: 'Mana Crypt', qty: 1 },
        { slot: 'Forest', name: 'Forest', qty: 10 },
      ],
      owns,
    );
    expect(c).toEqual({ binder: 11, standins: 1, buy: 1, total: 13 });
    expect(coverageText(c)).toBe('1 stand-in from your binder');
    expect(coverageText({ binder: 99, standins: 0, buy: 0, total: 99 })).toBe(''); // the hero already says how many you own
  });
});

describe('OWNED ONLY', () => {
  it('fills missing slots with owned stand-ins, keeps your swaps, never reuses a card', () => {
    const slots = [
      { slot: 'Mana Crypt', name: 'Mana Crypt', qty: 1 },
      { slot: 'Mana Vault', name: 'Mana Vault', qty: 1 },
      { slot: 'Rhystic Study', name: 'Arcane Signet', qty: 1 }, // your swap stays
      { slot: 'Sol Ring', name: 'Sol Ring', qty: 1 },
    ];
    const pool = ['Arcane Signet', 'Cultivate', 'Sol Ring'];
    const r = ownedOnly(slots, owns, (_s, used) => pool.find((p) => !used.has(p.toLowerCase())));
    expect([...r]).toEqual([['Mana Crypt', 'Cultivate']]); // Mana Vault: nothing left, so it stays (marked missing)
  });
});

describe('PREFER OWNED', () => {
  const items = [
    { n: 'Missing A', owned: false, score: 0.9 },
    { n: 'Owned B', owned: true, score: 0.8 },
    { n: 'Missing C', owned: false, score: 0.5 },
    { n: 'Owned D', owned: true, score: 0.2 },
  ];
  it('an owned card wins unless the missing one is clearly better', () => {
    expect(preferOwned(items, 'prefer', (t) => t).map((t) => t.n)).toEqual(['Owned B', 'Missing A', 'Missing C', 'Owned D']);
    const clear = [{ n: 'Missing', owned: false, score: 0.99 }, { n: 'Owned', owned: true, score: 0.5 }];
    expect(preferOwned(clear, 'prefer', (t) => t)[0].n).toBe('Missing');
  });
  it('OWNED ONLY drops missing cards from suggestions', () => {
    expect(preferOwned(items, 'owned', (t) => t).map((t) => t.n)).toEqual(['Owned B', 'Owned D']);
  });
});

describe('BUY CAP', () => {
  it('marks only known prices over the cap, and offers the next in-cap card', () => {
    expect(overCap(30, 25)).toBe(true);
    expect(overCap(undefined, 5)).toBe(false);
    expect(overCap(500, 0)).toBe(false);
    const c = [{ n: 'Pricey', p: 40 }, { n: 'Cheap', p: 3 }];
    expect(firstInCap(c, 10, (t) => t.p)?.n).toBe('Cheap');
    expect(firstInCap(c, 1, (t) => t.p)?.n).toBe('Pricey'); // none in cap: still offered, marked
  });
});

describe('in <deck> chip', () => {
  const owned = new Map([['sol ring', 1], ['cultivate', 2]]);
  const decks = [
    { id: 1, name: 'Atraxa', cards: [{ name: 'Sol Ring', qty: 1 }], alloc: 'reserved' as const },
    { id: 2, name: 'Kinnan', cards: [{ name: 'Sol Ring', qty: 1 }, { name: 'Cultivate', qty: 1 }] },
    { id: 3, name: 'Tatyova', cards: [{ name: 'Cultivate', qty: 1 }] },
  ];
  const a = allocate(decks, owned);
  it('says held by a reserved deck (lock), in a shared one, +N for more, nothing when unused', () => {
    expect(inUseChip(a, 'Sol Ring', () => false)).toEqual({ deck: 'Atraxa', lock: true, text: 'held by Atraxa +1' });
    expect(inUseChip(a, 'Cultivate', (d) => d === 'Tatyova')).toEqual({ deck: 'Kinnan', lock: false, text: 'in Kinnan' });
    expect(inUseChip(a, 'Arcane Signet', () => false)).toBeUndefined();
  });
});

describe('TO BUY groups', () => {
  it('bands by EDHREC play rate, cheapest first, with a subtotal', () => {
    const items = [
      { n: 'A', incl: 0.6, p: 30 },
      { n: 'B', incl: 0.7, p: 2 },
      { n: 'C', incl: 0.3, p: undefined },
      { n: 'D', incl: undefined, p: 1 },
    ];
    const g = buyGroups(items, (t) => t.incl, (t) => t.p);
    expect(g.map((x) => [x.label, x.items.map((t) => t.n), x.total])).toEqual([
      ['IN HALF THE DECKS OR MORE', ['B', 'A'], 32],
      ['IN 25–50% OF DECKS', ['C'], 0],
      ['UNDER 25% · NICE TO HAVE', ['D'], 1],
    ]);
  });
});

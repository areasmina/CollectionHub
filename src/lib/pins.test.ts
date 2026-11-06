import { describe, expect, it } from 'vitest';
import { arrange, noPins, pinOf, searchCards, togglePin, withPins } from './pins';

const slots = [
  { name: 'Atraxa', qty: 1, type: 'Legendary Creature' },
  { name: 'Sol Ring', qty: 1, type: 'Artifact', incl: 0.9 },
  { name: 'Mind Stone', qty: 1, type: 'Artifact', incl: 0.3 },
  { name: 'Grizzly Bears', qty: 1, type: 'Creature', incl: 0.1 },
  { name: 'Command Tower', qty: 1, type: 'Land', incl: 0.9 },
  { name: 'Forest', qty: 8, type: 'Basic Land — Forest' },
];
const none = () => undefined;

describe('pins', () => {
  it('toggles a side and clears the other', () => {
    let p = togglePin(noPins(), 'Sol Ring', 'in');
    expect(pinOf(p, 'sol ring')).toBe('in');
    p = togglePin(p, 'Sol Ring', 'out');
    expect(p).toEqual({ in: [], out: ['Sol Ring'] });
    expect(pinOf(togglePin(p, 'Sol Ring', 'out'), 'Sol Ring')).toBeUndefined();
  });

  it('keeps your swaps', () => {
    const m = arrange(slots, { 'Mind Stone': 'Arcane Signet' }, noPins(), none);
    expect(m.get('Mind Stone')).toEqual({ name: 'Arcane Signet', why: 'swap' });
    expect(m.get('Sol Ring')).toEqual({ name: 'Sol Ring' });
  });

  it('replaces a never-use card with the best fit not already in the deck', () => {
    const seen: string[][] = [];
    const m = arrange(slots, {}, { in: [], out: ['Sol Ring'] }, (_, used) => (seen.push([...used]), 'Arcane Signet'));
    expect(m.get('Sol Ring')).toEqual({ name: 'Arcane Signet', why: 'never' });
    expect(seen[0]).toContain('mind stone');
  });

  it('marks a never-use card it cannot replace and never touches the commander', () => {
    const m = arrange(slots, {}, { in: [], out: ['Sol Ring', 'Atraxa'] }, none, { commander: 'Atraxa' });
    expect(m.get('Sol Ring')).toEqual({ name: 'Sol Ring', why: 'never' });
    expect(m.get('Atraxa')).toEqual({ name: 'Atraxa' });
  });

  it('puts an always-in card in place of the least played card of its type', () => {
    const m = arrange(slots, {}, { in: ['Arcane Signet'], out: [] }, none, { typeOf: () => 'Artifact', commander: 'Atraxa' });
    expect(m.get('Mind Stone')).toEqual({ name: 'Arcane Signet', why: 'pin' });
    expect(m.get('Grizzly Bears')).toEqual({ name: 'Grizzly Bears' });
  });

  it('a pinned land takes a land slot, never a basic; a pin already in the deck changes nothing', () => {
    const m = arrange(slots, {}, { in: ['Reliquary Tower', 'Sol Ring'], out: [] }, none, { typeOf: (n) => (n === 'Reliquary Tower' ? 'Land' : undefined) });
    expect(m.get('Command Tower')).toEqual({ name: 'Reliquary Tower', why: 'pin' });
    expect(m.get('Forest')).toEqual({ name: 'Forest' });
    expect(m.get('Sol Ring')).toEqual({ name: 'Sol Ring' });
  });
});

describe('searchCards', () => {
  const cards = [{ name: 'Swords to Plowshares' }, { name: 'Path to Exile' }, { name: 'Exile Shrine' }, { name: 'Lim-Dûl the Necromancer' }];
  it('starts-with first, accents ignored, needs two letters', () => {
    expect(searchCards(cards, 'exile').map((c) => c.name)).toEqual(['Exile Shrine', 'Path to Exile']);
    expect(searchCards(cards, 'lim-dul').map((c) => c.name)).toEqual(['Lim-Dûl the Necromancer']);
    expect(searchCards(cards, 'e')).toEqual([]);
  });
});

describe('pins drive the EDHREC filter', () => {
  it('adds the first pins of each side after your own cards, no repeats, no basics', () => {
    expect(withPins({ inc: ['Sol Ring'], exc: [] }, { in: ['sol ring', 'Rhystic Study', 'Forest', 'Cultivate', 'Swords'], out: ['Cyclonic Rift'] })).toEqual({
      inc: ['Sol Ring', 'Rhystic Study', 'Cultivate'],
      exc: ['Cyclonic Rift'],
    });
    expect(withPins({ inc: [], exc: [] }, { in: [], out: [] })).toEqual({ inc: [], exc: [] });
  });
});

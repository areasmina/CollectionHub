import { describe, expect, it } from 'vitest';
import { onlyOk, shows, sortBy, type Facts } from './arrange';

const cards: Facts[] = [
  { name: 'Sol Ring', usd: 1.5, mv: 1, owned: true },
  { name: 'Rhystic Study', usd: 38, mv: 3, owned: false },
  { name: 'Arcane Signet', mv: 2, owned: true }, // no price
  { name: 'Cultivate', usd: 0.4, mv: 3, owned: false },
];
const names = (key: Parameters<typeof sortBy>[1]) => sortBy(cards, key, (c) => c).map((c) => c.name);

describe('sortBy', () => {
  it('sorts by name, mana value and price (unknown prices last)', () => {
    expect(names('name')).toEqual(['Arcane Signet', 'Cultivate', 'Rhystic Study', 'Sol Ring']);
    expect(names('mv')).toEqual(['Sol Ring', 'Arcane Signet', 'Cultivate', 'Rhystic Study']);
    expect(names('price-desc')).toEqual(['Rhystic Study', 'Sol Ring', 'Cultivate', 'Arcane Signet']);
    expect(names('price-asc')).toEqual(['Cultivate', 'Sol Ring', 'Rhystic Study', 'Arcane Signet']);
  });
  it('puts owned or missing cards first, then by mana value', () => {
    expect(names('owned')).toEqual(['Sol Ring', 'Arcane Signet', 'Cultivate', 'Rhystic Study']);
    expect(names('missing')).toEqual(['Cultivate', 'Rhystic Study', 'Sol Ring', 'Arcane Signet']);
    expect(names('list')).toEqual(cards.map((c) => c.name));
  });
  it('filters owned / missing', () => {
    expect(cards.filter((c) => shows('owned', c.owned)).length).toBe(2);
    expect(cards.filter((c) => shows('missing', c.owned)).length).toBe(2);
    expect(cards.filter((c) => shows('all', c.owned)).length).toBe(4);
  });
});

describe('ONLY: Game Changers and price filters', () => {
  it('keeps Game Changers, or cards in a CAD price band; unknown prices never pass a price filter', () => {
    expect(onlyOk('all', { gc: false })).toBe(true);
    expect(onlyOk('gc', { gc: true })).toBe(true);
    expect(onlyOk('gc', { gc: false, cad: 1 })).toBe(false);
    expect(onlyOk('under5', { gc: false, cad: 4.99 })).toBe(true);
    expect(onlyOk('under5', { gc: false, cad: 5 })).toBe(false);
    expect(onlyOk('under20', { gc: false, cad: 19 })).toBe(true);
    expect(onlyOk('over20', { gc: false, cad: 20 })).toBe(true);
    expect(onlyOk('over20', { gc: false })).toBe(false);
  });
});

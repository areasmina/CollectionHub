import { describe, expect, it } from 'vitest';
import { shows, sortBy, type Facts } from './arrange';

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

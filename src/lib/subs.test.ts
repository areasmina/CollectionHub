import { describe, expect, it } from 'vitest';
import { cad, shopUrl, toCad } from './prices';
import { mainType, rankSubs, reasonsFor, whyIn } from './subs';

describe('rankSubs', () => {
  const missing = { name: 'Swords to Plowshares', category: 'Instants', type: 'Instant', cmc: 1 };
  const owned = [
    { name: 'Path to Exile', category: 'Instants', type: 'Instant', cmc: 1, synergy: 0.05, incl: 0.4 },
    { name: 'Wrath of God', category: 'Sorceries', type: 'Sorcery', cmc: 4, synergy: 0.1, incl: 0.3 },
    { name: 'Generous Gift', category: 'Instants', type: 'Instant', cmc: 3, synergy: 0, incl: 0.2 },
    { name: 'Command Tower', category: 'Lands', type: 'Land', cmc: 0, synergy: 0.9, incl: 0.9 },
    { name: 'Ravenous Chupacabra', category: 'Creatures', type: 'Creature — Horror', cmc: 4, synergy: 0.2, incl: 0.5 },
  ];
  it('prefers same category, type and mana value, never lands for spells', () => {
    expect(rankSubs(missing, owned).map((c) => c.name)).toEqual(['Path to Exile', 'Generous Gift', 'Ravenous Chupacabra']);
  });
  it('only offers lands for a land', () => {
    expect(rankSubs({ name: 'Scrubland', type: 'Land', category: 'Lands' }, owned).map((c) => c.name)).toEqual(['Command Tower']);
  });
  it('reads the main card type', () => {
    expect(mainType('Artifact Creature — Golem')).toBe('Creature');
    expect(mainType('Legendary Land')).toBe('Land');
  });
});

describe('prices', () => {
  it('converts USD to CAD and rounds to cents', () => {
    expect(toCad('10.00', 1.4226)).toBe(14.23);
    expect(toCad(undefined, 1.4)).toBeUndefined();
    expect(cad(1234.5)).toBe('CA$1,234.50');
  });
  it('builds the shop search link with the front face name', () => {
    expect(shopUrl("Gaea's Cradle")).toBe("https://shop.com/search/results?query=Gaea's%20Cradle&inStock=true&shipsFrom=true");
    expect(shopUrl('Fire // Ice')).toContain('query=Fire&');
  });
});


describe('reasonsFor / whyIn', () => {
  const missing = { name: 'Cultivate', category: 'Ramp', type: 'Sorcery', cmc: 3, incl: 0.62, synergy: 0.02 };
  it('lists the matching role, type, mana value, synergy, inclusion and copies owned', () => {
    expect(reasonsFor(missing, { name: "Kodama's Reach", category: 'Ramp', type: 'Sorcery', cmc: 3, synergy: 0.12, incl: 0.41 }, 2)).toEqual([
      'Same role: Ramp',
      'Sorcery like it',
      'Same mana value (3)',
      '+12% synergy',
      'In 41% of decks',
      'You own ×2',
    ]);
    expect(reasonsFor(missing, { name: 'Farseek', type: 'Sorcery', cmc: 2 })).toEqual(['Sorcery like it', 'Mana value 2 (vs 3)']);
  });
  it('says why the missing card is in the deck (tiny synergy left out)', () => {
    expect(whyIn(missing)).toEqual(['Role: Ramp', 'In 62% of decks']);
  });
});

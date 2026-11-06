import { describe, expect, it } from 'vitest';
import { cad, shopUrl, toCad } from './prices';
import { edhSignal, mainType, rankSubs, reasonsFor, recInfoOf, whyIn } from './subs';

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

describe('lift (EDHREC replaced synergy with lift on Oct 1, 2026)', () => {
  it('turns lift into the old synergy scale and falls back to synergy on old pages', () => {
    expect(edhSignal({ name: 'a', lift: 4 })).toBe(1);
    expect(edhSignal({ name: 'a', lift: 2 })).toBe(0.5);
    expect(edhSignal({ name: 'a', lift: 1 })).toBe(0);
    expect(edhSignal({ name: 'a', lift: 0.5 })).toBe(-0.5);
    expect(edhSignal({ name: 'a', lift: 64 })).toBe(1);
    expect(edhSignal({ name: 'a', synergy: 0.3 })).toBe(0.3);
    expect(edhSignal({ name: 'a', lift: 2, synergy: 0.9 })).toBe(0.5);
    expect(edhSignal({ name: 'a' })).toBe(0);
  });
  it('ranks a high-lift stand-in above a plain one when the rest ties', () => {
    const missing = { name: 'Swords to Plowshares', category: 'Instants', type: 'Instant', cmc: 1 };
    const owned = [
      { name: 'Plain', category: 'Instants', type: 'Instant', cmc: 1, lift: 1, incl: 0.3 },
      { name: 'Loved here', category: 'Instants', type: 'Instant', cmc: 1, lift: 3, incl: 0.3 },
    ];
    expect(rankSubs(missing, owned).map((c) => c.name)).toEqual(['Loved here', 'Plain']);
  });
  it('shows lift in the reasons only when the card is clearly played more here', () => {
    expect(whyIn({ name: 'a', category: 'Ramp', incl: 0.5, lift: 2.44 })).toEqual(['Role: Ramp', 'In 50% of decks', '2.4x lift']);
    expect(whyIn({ name: 'a', incl: 0.5, lift: 1.1 })).toEqual(['In 50% of decks']);
    expect(reasonsFor({ name: 'm', type: 'Sorcery', cmc: 3 }, { name: 's', type: 'Sorcery', cmc: 3, lift: 1.8 })).toEqual(['Sorcery like it', 'Same mana value (3)', '1.8x lift']);
  });
  it('carries lift from the EDHREC page into the card info', () => {
    const info = recInfoOf([{ header: 'Ramp', cards: [{ name: 'Cultivate', lift: 1.6, decks: 50, potential: 100 }] }], (n) => n.toLowerCase(), () => undefined);
    expect(info.get('cultivate')).toMatchObject({ category: 'Ramp', lift: 1.6, incl: 0.5 });
  });
});

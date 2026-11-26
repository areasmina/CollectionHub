import { describe, expect, it } from 'vitest';
import type { Card, DeckCard } from '../../lib/db';
import type { StepPick } from '../../brain/guided';
import {
  WIZARD_STEPS,
  adjustDeckCard,
  autoFillBasics,
  filterByMaxPrice,
  groupForTabletop,
  matchCommandersForCards,
  totalCardsIn,
} from './guidedState';

function mkCard(name: string, partial: Partial<Card> = {}): Card {
  return {
    id: `id-${name}`,
    name,
    key: name.toLowerCase(),
    type: 'Creature',
    text: '',
    ci: [],
    legal: true,
    cmc: 2,
    ...partial,
  };
}

describe('guidedState', () => {
  it('defines the 9-step Guided Deckbuilder order', () => {
    expect(WIZARD_STEPS).toEqual([
      'commander',
      'lands',
      'ramp',
      'draw',
      'removal',
      'wipes',
      'plan',
      'rest',
      'review',
    ]);
  });

  it('matches commanders in binder that fit selected seed cards first', () => {
    const binder: Card[] = [
      mkCard('Atraxa, Praetors Voice', { type: 'Legendary Creature — Phyrexian Angel', ci: ['W', 'U', 'B', 'G'] }),
      mkCard('Krenko, Mob Boss', { type: 'Legendary Creature — Goblin Warrior', ci: ['R'] }),
      mkCard('Teysa Karlov', { type: 'Legendary Creature — Human Advisor', ci: ['W', 'B'] }),
      mkCard('Llanowar Elves', { type: 'Creature — Elf Druid', ci: ['G'] }),
    ];
    const seeds = [
      mkCard('Swords to Plowshares', { type: 'Instant', ci: ['W'] }),
      mkCard('Demonic Tutor', { type: 'Sorcery', ci: ['B'] }),
    ];

    const matches = matchCommandersForCards(seeds, binder);
    // Krenko fits 0 seeds so is omitted; Llanowar Elves is not legendary; Teysa fits all 2 in 2 colours so beats Atraxa (4 colours).
    expect(matches.map((m) => m.card.name)).toEqual(['Teysa Karlov', 'Atraxa, Praetors Voice']);
    expect(matches[0].fitsAllSeeds).toBe(true);
    expect(matches[0].matchedSeeds).toBe(2);
  });

  it('auto-fills basic lands evenly up to targetLands without exceeding maxDeckSize', () => {
    const deck: DeckCard[] = [
      { name: 'Teysa Karlov', qty: 1 },
      { name: 'Command Tower', qty: 1 },
      { name: 'Sol Ring', qty: 1 },
    ];
    const cardOf = (name: string) =>
      name === 'Command Tower'
        ? { type: 'Land' }
        : name === 'Teysa Karlov'
          ? { type: 'Legendary Creature' }
          : { type: 'Artifact' };

    const filled = autoFillBasics(deck, cardOf, ['W', 'B'], 5, 100);
    expect(totalCardsIn(filled)).toBe(7); // 1 Command Tower + 4 basics = 5 lands + 2 nonlands
    const plains = filled.find((c) => c.name === 'Plains')?.qty ?? 0;
    const swamps = filled.find((c) => c.name === 'Swamp')?.qty ?? 0;
    expect(plains).toBe(2);
    expect(swamps).toBe(2);

    // Colourless identity uses Wastes and respects maxDeckSize cap
    const capped = autoFillBasics([{ name: 'Karn', qty: 1 }], () => ({ type: 'Artifact' }), [], 37, 4);
    expect(totalCardsIn(capped)).toBe(4);
    expect(capped.find((c) => c.name === 'Wastes')?.qty).toBe(3);
  });

  it('groups deck cards into Tabletop piles by categories, card type, and mana value', () => {
    const cards: DeckCard[] = [
      { name: 'Teysa Karlov', qty: 1 },
      { name: 'Plains', qty: 4 },
      { name: 'Arcane Signet', qty: 1 },
      { name: 'Swords to Plowshares', qty: 1 },
      { name: 'Blood Artist', qty: 1 },
    ];
    const lookup: Record<string, Pick<Card, 'type' | 'text' | 'cmc'>> = {
      'Teysa Karlov': { type: 'Legendary Creature — Human Advisor', text: '', cmc: 4 },
      'Arcane Signet': { type: 'Artifact', text: '{T}: Add one mana of any color in your commander\'s color identity.', cmc: 2 },
      'Swords to Plowshares': { type: 'Instant', text: 'Exile target creature. Its controller gains life equal to its power.', cmc: 1 },
      'Blood Artist': { type: 'Creature — Vampire', text: 'Whenever Blood Artist or another creature dies, target player loses 1 life.', cmc: 2 },
    };
    const cardOf = (name: string) => lookup[name];

    const byCat = groupForTabletop(cards, cardOf, 'categories', 'Teysa Karlov');
    expect(byCat.find((p) => p.label === 'Commander')?.count).toBe(1);
    expect(byCat.find((p) => p.label === 'Lands')?.count).toBe(4);
    expect(byCat.find((p) => p.label === 'Ramp')?.cards.map((c) => c.name)).toEqual(['Arcane Signet']);
    expect(byCat.find((p) => p.label === 'Removal')?.cards.map((c) => c.name)).toEqual(['Swords to Plowshares']);
    expect(byCat.find((p) => p.label === 'Plan / Synergy')?.cards.map((c) => c.name)).toEqual(['Blood Artist']);

    const byType = groupForTabletop(cards, cardOf, 'type', 'Teysa Karlov');
    expect(byType.find((p) => p.label === 'Artifacts')?.count).toBe(1);
    expect(byType.find((p) => p.label === 'Instants')?.count).toBe(1);
    expect(byType.find((p) => p.label === 'Creatures')?.cards.map((c) => c.name)).toEqual(['Blood Artist']);

    const byMv = groupForTabletop(cards, cardOf, 'mv', 'Teysa Karlov');
    expect(byMv.find((p) => p.label === '0–1 MV')?.cards.map((c) => c.name)).toEqual(['Swords to Plowshares']);
    expect(byMv.find((p) => p.label === '2 MV')?.cards.map((c) => c.name)).toEqual(['Arcane Signet', 'Blood Artist']);
  });

  it('filters picks by per-card CAD cap while retaining unpriced offline cards', () => {
    const mkPick = (name: string): StepPick => ({
      name,
      total: 0.5,
      parts: [],
    });
    const picks = [mkPick('Sol Ring'), mkPick('Mana Crypt'), mkPick('Offline Brew')];
    const prices: Record<string, { usd?: string }> = {
      'Sol Ring': { usd: '1.50' },
      'Mana Crypt': { usd: '150.00' },
      'Offline Brew': {},
    };

    const filtered = filterByMaxPrice(picks, (n) => prices[n], 5);
    expect(filtered.map((p) => p.name)).toEqual(['Sol Ring', 'Offline Brew']);
    expect(filterByMaxPrice(picks, (n) => prices[n], null)).toHaveLength(3);
  });

  it('adjustDeckCard increments, decrements, and removes at zero', () => {
    const start: DeckCard[] = [{ name: 'Plains', qty: 2 }];
    expect(adjustDeckCard(start, 'Plains', 1)).toEqual([{ name: 'Plains', qty: 3 }]);
    expect(adjustDeckCard(start, 'Plains', -2)).toEqual([]);
    expect(adjustDeckCard(start, 'Island', 1)).toEqual([
      { name: 'Plains', qty: 2 },
      { name: 'Island', qty: 1 },
    ]);
  });
});

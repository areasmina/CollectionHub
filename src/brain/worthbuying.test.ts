import { describe, expect, it } from 'vitest';
import type { DeckContext } from './score';
import { worthBuying } from './worthbuying';

const meta: Record<string, { type: string; text: string; cmc: number; ci: string[]; legal: boolean }> = {
  'Discard Boss': { type: 'Legendary Creature — Human', text: 'Whenever an opponent discards a card, draw a card.', cmc: 3, ci: ['U', 'B'], legal: true },
  'Weak Fill': { type: 'Creature — Bird', text: 'Flying', cmc: 4, ci: ['U'], legal: true },
  'Expensive Gem': { type: 'Sorcery', text: 'Each player discards two cards.', cmc: 2, ci: ['B'], legal: true },
  'Budget Fit': { type: 'Sorcery', text: 'Target player discards two cards.', cmc: 3, ci: ['B'], legal: true },
  'Off Colour': { type: 'Sorcery', text: 'Target player discards two cards.', cmc: 2, ci: ['R'], legal: true },
  'Armageddon Spell': { type: 'Sorcery', text: 'Destroy all lands.', cmc: 4, ci: ['B'], legal: true },
};

const baseCtx: DeckContext = {
  deck: [
    { name: 'Discard Boss', qty: 1 },
    { name: 'Weak Fill', qty: 1 },
  ],
  cardOf: (n) => meta[n],
  commander: 'Discard Boss',
  bracket: 3,
  aggression: 'hungry',
};

describe('worthBuying (Missing Upgrades Worth Buying)', () => {
  it('ranks strictly by deck fit — changing price never alters scores or order', () => {
    const unowned = [
      { name: 'Expensive Gem', incl: 0.65, lift: 2.0, type: 'Sorcery', cmc: 2 },
      { name: 'Budget Fit', incl: 0.2, lift: 1.2, type: 'Sorcery', cmc: 3 },
    ];
    const cheapFirst = worthBuying({
      ctx: baseCtx,
      unowned,
      identity: ['U', 'B'],
      priceOf: (n) => (n === 'Expensive Gem' ? 85 : 0.25),
    });
    const flippedPrices = worthBuying({
      ctx: baseCtx,
      unowned,
      identity: ['U', 'B'],
      priceOf: (n) => (n === 'Expensive Gem' ? 0.25 : 85),
    });
    expect(cheapFirst.map((x) => [x.name, x.score])).toEqual(flippedPrices.map((x) => [x.name, x.score]));
    expect(cheapFirst[0].name).toBe('Expensive Gem');
  });

  it('filters over-budget cards only when hideOverBudget & maxCad are set, and excludes off-colour/blocked cards', () => {
    const unowned = [
      { name: 'Expensive Gem', incl: 0.65, lift: 2.0, type: 'Sorcery', cmc: 2 },
      { name: 'Budget Fit', incl: 0.25, lift: 1.3, type: 'Sorcery', cmc: 3 },
      { name: 'Off Colour', incl: 0.9, lift: 2.4, type: 'Sorcery', cmc: 2 },
      { name: 'Armageddon Spell', incl: 0.8, lift: 2.0, type: 'Sorcery', cmc: 4 },
    ];
    const all = worthBuying({
      ctx: baseCtx,
      unowned,
      identity: ['U', 'B'],
      priceOf: (n) => (n === 'Expensive Gem' ? 24 : 1.5),
    });
    expect(all.map((x) => x.name)).toEqual(['Expensive Gem', 'Budget Fit']);

    const capped = worthBuying({
      ctx: baseCtx,
      unowned,
      identity: ['U', 'B'],
      priceOf: (n) => (n === 'Expensive Gem' ? 24 : 1.5),
      maxCad: 5,
      hideOverBudget: true,
    });
    expect(capped.map((x) => x.name)).toEqual(['Budget Fit']);
  });
});

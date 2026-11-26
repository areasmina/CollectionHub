import { describe, expect, it } from 'vitest';
import {
  advanceTurn,
  availableMana,
  bottomGoldfishCard,
  canPlayHandCard,
  castFromCommandZone,
  dealGoldfish,
  playHandCard,
  returnCommanderToZone,
  simulateGoldfish,
} from './goldfish';

const cards: Record<string, { type: string; text: string; cmc: number }> = {
  Commander: { type: 'Legendary Creature — Wizard', text: 'Whenever you cast a spell, draw a card.', cmc: 2 },
  Forest: { type: 'Basic Land — Forest', text: '{T}: Add {G}.', cmc: 0 },
  Island: { type: 'Basic Land — Island', text: '{T}: Add {U}.', cmc: 0 },
  'Tap Dual': { type: 'Land', text: 'Tap Dual enters tapped.\n{T}: Add {G} or {U}.', cmc: 0 },
  'Sol Ring': { type: 'Artifact', text: '{T}: Add {C}{C}.', cmc: 1 },
  Cultivate: { type: 'Sorcery', text: 'Search your library for up to two basic land cards.', cmc: 3 },
  'Bear Cub': { type: 'Creature — Bear', text: '', cmc: 2 },
};

const cardOf = (n: string) => cards[n];

describe('goldfish playtester engine', () => {
  it('supports Commander free mulligan and London mulligan bottoming before plays', () => {
    const deck = [
      { name: 'Commander', qty: 1 },
      { name: 'Forest', qty: 10 },
      { name: 'Island', qty: 10 },
      { name: 'Bear Cub', qty: 10 },
    ];
    const m0 = dealGoldfish(deck, 'Commander', undefined, 0, () => 0.5);
    expect(m0.hand.length).toBe(7);
    expect(m0.toBottom).toBe(0);
    expect(m0.commandZone).toEqual([{ name: 'Commander', casts: 0 }]);

    const m1 = dealGoldfish(deck, 'Commander', undefined, 1, () => 0.5);
    expect(m1.toBottom).toBe(0);

    const m2 = dealGoldfish(deck, 'Commander', undefined, 2, () => 0.5);
    expect(m2.toBottom).toBe(1);
    const afterBottom = bottomGoldfishCard(m2, 0);
    expect(afterBottom.toBottom).toBe(0);
    expect(afterBottom.hand.length).toBe(6);
  });

  it('enforces 1 land drop per turn, taps lands & Sol Ring for mana, and untaps + draws on nextTurn', () => {
    let s = dealGoldfish([], 'Commander', undefined, 0);
    s = {
      ...s,
      hand: ['Forest', 'Island', 'Sol Ring', 'Cultivate', 'Bear Cub'],
      library: ['Forest'],
    };

    // Play 1st land
    s = playHandCard(s, 0, cardOf);
    expect(s.landsPlayedThisTurn).toBe(1);
    expect(availableMana(s)).toBe(1);

    // 2nd land same turn is refused
    expect(canPlayHandCard(s, 0, cardOf).ok).toBe(false);

    // Cast Sol Ring (1 mana) -> taps Forest, adds Sol Ring (+2 mana available!)
    const ringIdx = s.hand.indexOf('Sol Ring');
    s = playHandCard(s, ringIdx, cardOf);
    expect(availableMana(s)).toBe(2);

    // Cast Bear Cub (2 mana) -> taps Sol Ring, leaves 0 mana
    const bearIdx = s.hand.indexOf('Bear Cub');
    s = playHandCard(s, bearIdx, cardOf);
    expect(availableMana(s)).toBe(0);
    expect(s.battlefield.some((p) => p.name === 'Bear Cub')).toBe(true);

    // Advance turn -> untaps Forest (1) + Sol Ring (2) = 3 mana, draws Forest
    s = advanceTurn(s);
    expect(s.turn).toBe(2);
    expect(s.landsPlayedThisTurn).toBe(0);
    expect(availableMana(s)).toBe(3);

    // Cast Cultivate (3 mana Sorcery) -> goes to graveyard!
    const cultIdx = s.hand.indexOf('Cultivate');
    s = playHandCard(s, cultIdx, cardOf);
    expect(s.graveyard).toEqual(['Cultivate']);
  });

  it('tracks commander zone casting and +2 commander tax when returned to command zone', () => {
    let s = dealGoldfish([], 'Commander', undefined, 0);
    s = {
      ...s,
      hand: ['Forest', 'Island', 'Forest', 'Forest'],
      library: ['Forest', 'Island'],
    };

    // T1: Forest (1 mana) - cannot cast 2-CMC Commander
    s = playHandCard(s, 0, cardOf);
    expect(castFromCommandZone(s, 0, cardOf).commandZone.length).toBe(1);

    // T2: Island (2 mana total) - cast Commander for 2
    s = advanceTurn(s);
    s = playHandCard(s, s.hand.indexOf('Island'), cardOf);
    s = castFromCommandZone(s, 0, cardOf);
    expect(s.commandZone.length).toBe(0);
    const cmdPerm = s.battlefield.find((p) => p.isCommander)!;
    expect(cmdPerm.name).toBe('Commander');

    // Return commander -> next cast costs 4 (2 base + 2 tax)
    s = returnCommanderToZone(s, cmdPerm.id);
    expect(s.commandZone).toEqual([{ name: 'Commander', casts: 1 }]);
    s = advanceTurn(s);
    s = playHandCard(s, s.hand.indexOf('Forest'), cardOf); // 3 lands -> not enough for 4 mana!
    expect(castFromCommandZone(s, 0, cardOf).commandZone.length).toBe(1);
    s = advanceTurn(s);
    s = playHandCard(s, s.hand.indexOf('Forest'), cardOf); // 4 lands -> casts Commander for 4!
    s = castFromCommandZone(s, 0, cardOf);
    expect(s.commandZone.length).toBe(0);
    expect(s.commanderCasts.commander).toBe(2);
  });

  it('runs deterministic Monte Carlo Goldfish simulation across 4 turns', () => {
    const deck = [
      { name: 'Commander', qty: 1 },
      { name: 'Forest', qty: 37 },
      { name: 'Sol Ring', qty: 4 },
      { name: 'Bear Cub', qty: 58 },
    ];
    const a = simulateGoldfish(deck, cardOf, 'Commander', undefined, 200);
    const b = simulateGoldfish(deck, cardOf, 'Commander', undefined, 200);
    expect(a).toEqual(b);
    expect(a.keepablePct).toBeGreaterThan(40);
    expect(a.t4ManaAvg).toBeGreaterThanOrEqual(2.5);
    expect(a.t4ThreeLandsPct).toBeGreaterThan(30);
  });
});

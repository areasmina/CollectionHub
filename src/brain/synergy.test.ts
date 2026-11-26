import { describe, expect, it } from 'vitest';
import { landFit } from './build';
import { deckSynergy, profileOf, synergyParts, SYN_CAP } from './synergy';
import { scoreCard, suggestCards, type DeckContext } from './score';

const C = (type: string, text: string) => ({ type, text });
const cards: Record<string, { type: string; text: string; cmc?: number }> = {
  'Discard Lord': C('Legendary Creature — Human Wizard', 'Whenever an opponent discards a card, that player loses 2 life.'),
  'Mind Rot': C('Sorcery', 'Target player discards two cards.'),
  'Token Maker': C('Sorcery', 'Create two 1/1 white Soldier creature tokens.'),
  'Token Payoff': C('Enchantment', 'Creature tokens you control get +1/+1.'),
  'Blood Artist': C('Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.'),
  'Sac Outlet': C('Creature — Human Cleric', 'Sacrifice a creature: Scry 1.'),
  'Vanilla Bear': C('Creature — Bear', ''),
  'Ninja Boss': C('Legendary Creature — Human Ninja', 'Whenever a Ninja you control deals combat damage to a player, draw a card.'),
  'Sneaky Ninja': C('Creature — Human Ninja', 'Ninjutsu {1}{U}'),
  'Armageddon': C('Sorcery', 'Destroy all lands.'),
  'Time Warp': C('Sorcery', 'Target player takes an extra turn after this one.'),
  'Time Walk 2': C('Sorcery', 'Take an extra turn after this one.'),
  'Time Walk 3': C('Sorcery', 'Take an extra turn after this one.'),
};
const cardOf = (n: string) => cards[n];
const ctxOf = (commander: string, rest: string[] = [], bracket = 3): DeckContext => ({ deck: [commander, ...rest].map((name) => ({ name, qty: 1 })), cardOf, commander, bracket, aggression: 'hungry' });

describe('synergy: what a card makes and cares about', () => {
  it('reads engines from the rules text', () => {
    const has = (name: string, side: 'makes' | 'cares') => profileOf(cards[name])[side] !== 0;
    expect(has('Mind Rot', 'makes')).toBe(true);
    expect(has('Discard Lord', 'cares')).toBe(true);
    expect(profileOf(cards['Vanilla Bear'])).toMatchObject({ makes: 0, cares: 0, tribes: ['Bear'] });
  });
  it('a card that feeds the commander says so, with no EDHREC numbers at all', () => {
    const s = scoreCard({ name: 'Mind Rot' }, ctxOf('Discard Lord'));
    expect(s.parts.map((p) => p.label)).toContain('feeds Discard Lord: discard');
    expect(s.total).toBeGreaterThan(scoreCard({ name: 'Vanilla Bear' }, ctxOf('Discard Lord')).total);
  });
  it("a payoff counts once the deck has the engine's makers, and the reason names how many", () => {
    const deck = ['Token Maker', 'Token Maker', 'Token Maker', 'Token Maker'];
    const syn = deckSynergy([{ name: 'Vanilla Bear', qty: 1 }, { name: 'Token Maker', qty: 4 }], cardOf, 'Vanilla Bear');
    expect(synergyParts(cards['Token Payoff'], syn).map((p) => p.label)).toContain("pays off the deck's 4 tokens cards");
    expect(synergyParts(cards['Token Payoff'], deckSynergy([{ name: 'Vanilla Bear', qty: 1 }], cardOf, 'Vanilla Bear'))).toEqual([]);
    void deck;
  });
  it('a creature of the type the commander rewards fits', () => {
    const s = scoreCard({ name: 'Sneaky Ninja' }, ctxOf('Ninja Boss'));
    expect(s.parts.some((p) => /^Ninja: the type/.test(p.label))).toBe(true);
  });
  it('synergy is capped, so it never outweighs a staple by itself', () => {
    const syn = deckSynergy(['Discard Lord', 'Blood Artist', 'Blood Artist', 'Sac Outlet', 'Sac Outlet', 'Token Payoff', 'Token Payoff'].map((name) => ({ name, qty: 3 })), cardOf, 'Discard Lord');
    const total = synergyParts(C('Creature — Human', 'Sacrifice a creature: Create two 1/1 tokens. Target player discards a card. Whenever another creature dies, draw a card.'), syn).reduce((n, p) => n + p.value, 0);
    expect(total).toBeLessThanOrEqual(SYN_CAP + 1e-9);
  });
  it('ranks owned cards with no popularity by what they do for this deck', () => {
    const top = suggestCards([{ name: 'Vanilla Bear' }, { name: 'Token Maker' }, { name: 'Mind Rot' }], ctxOf('Discard Lord'), 3);
    expect(top[0].name).toBe('Mind Rot');
  });
});

describe('bracket rules beyond combos', () => {
  it('below bracket IV: mass land denial is blocked, and so is a third extra-turn card', () => {
    expect(scoreCard({ name: 'Armageddon' }, ctxOf('Discard Lord')).blocked).toMatch(/mass land denial/);
    expect(scoreCard({ name: 'Armageddon' }, ctxOf('Discard Lord', [], 4)).blocked).toBeUndefined();
    expect(scoreCard({ name: 'Time Walk 3' }, ctxOf('Discard Lord', ['Time Warp'])).blocked).toBeUndefined();
    expect(scoreCard({ name: 'Time Walk 3' }, ctxOf('Discard Lord', ['Time Warp', 'Time Walk 2'])).blocked).toMatch(/third extra-turn/);
    expect(scoreCard({ name: 'Time Walk 3' }, ctxOf('Discard Lord', ['Time Warp', 'Time Walk 2'], 4)).blocked).toBeUndefined();
  });
});

describe('copies: a card whose every copy sits in another deck', () => {
  const taken = (own: number, used: number, by = ['Atraxa']) => (n: string) => (n === 'Mind Rot' ? { own, used, by } : undefined);
  const base = scoreCard({ name: 'Mind Rot' }, ctxOf('Discard Lord'));
  it('is marked down, and the reason names the deck', () => {
    const s = scoreCard({ name: 'Mind Rot' }, { ...ctxOf('Discard Lord'), taken: taken(1, 1) });
    expect(s.parts.map((p) => p.label)).toContain('all 1 copy is in Atraxa');
    expect(s.total).toBeLessThan(base.total);
    expect(scoreCard({ name: 'Mind Rot' }, { ...ctxOf('Discard Lord'), taken: taken(2, 3, ['Atraxa', 'Kinnan']) }).parts.map((p) => p.label)).toContain('all 2 copies are in Atraxa +1');
  });
  it('is left alone while a copy is spare, and when no other deck uses it', () => {
    expect(scoreCard({ name: 'Mind Rot' }, { ...ctxOf('Discard Lord'), taken: taken(2, 1) }).total).toBe(base.total);
    expect(scoreCard({ name: 'Mind Rot' }, { ...ctxOf('Discard Lord'), taken: () => undefined }).total).toBe(base.total);
  });
  it('a card with a spare copy now outranks one with none, all else equal', () => {
    const ctx: DeckContext = { ...ctxOf('Discard Lord'), taken: (n) => (n === 'Mind Rot' ? { own: 1, used: 1, by: ['Atraxa'] } : undefined) };
    const order = suggestCards([{ name: 'Mind Rot' }, { name: 'Vanilla Bear' }], ctx).map((s) => s.name);
    expect(order[0]).toBe('Vanilla Bear');
  });
});

describe('Brain v2: trigger doublers, synergy lands, and restricted-mana guard', () => {
  it('recognizes trigger doublers when the deck/commander supports the matching engine', () => {
    const etbCommander = C('Legendary Creature — Merfolk Wizard', 'When Etb Commander enters, draw two cards.');
    const doubler = C('Artifact', 'If an artifact or creature entering causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.');
    const deck = [
      { name: 'Etb Commander', qty: 1 },
      { name: 'Etb Ally', qty: 6 },
    ];
    const localCardOf = (n: string) =>
      n === 'Etb Commander' ? etbCommander : n === 'Etb Ally' ? C('Creature — Elf', 'When Etb Ally enters, create a 1/1 token.') : cards[n];
    const syn = deckSynergy(deck, localCardOf, 'Etb Commander');
    const parts = synergyParts(doubler, syn, 'Etb Commander');
    expect(parts.some((p) => p.label.includes('enter-the-battlefield triggers'))).toBe(true);

    // Silent when deck has no ETB triggers at all
    const vanillaSyn = deckSynergy([{ name: 'Vanilla Bear', qty: 1 }], cardOf, 'Vanilla Bear');
    expect(synergyParts(doubler, vanillaSyn, 'Vanilla Bear')).toEqual([]);
  });

  it('penalizes restricted coloured mana unless tribal synergy matches, and rewards utility land synergy', () => {
    const restricted = C('Land', '{T}: Add {C}. {T}: Add one mana of any color. Spend this mana only to cast a Goblin spell.');
    const clean = C('Land', '{T}: Add {U} or {B}.');
    const synNonTribal = deckSynergy([{ name: 'Discard Lord', qty: 1 }, { name: 'Sac Outlet', qty: 5 }], cardOf, 'Discard Lord');
    const nonTribalFit = landFit(restricted, ['U', 'B'], () => 0.5, synNonTribal, 'Discard Lord');
    expect(nonTribalFit.restricted).toBe(-0.06);
    expect(landFit(clean, ['U', 'B'], () => 0.5, synNonTribal, 'Discard Lord').restricted).toBe(0);

    // Tribal commander excuses the creature-type restriction
    const goblinBoss = C('Legendary Creature — Goblin', 'Goblin creatures you control get +1/+1.');
    const synTribal = deckSynergy([{ name: 'Goblin Boss', qty: 1 }], () => goblinBoss, 'Goblin Boss');
    expect(landFit(restricted, ['R'], () => 0.5, synTribal, 'Goblin Boss').restricted).toBe(0);

    // Utility land with sacrifice synergy gets a capped synergy boost
    const synWithPayoffs = deckSynergy([{ name: 'Discard Lord', qty: 1 }, { name: 'Blood Artist', qty: 4 }], cardOf, 'Discard Lord');
    const phyTower = C('Land', '{T}, Sacrifice a creature: Add {B}{B}.');
    const fitTower = landFit(phyTower, ['B'], () => 0.5, synWithPayoffs, 'Discard Lord');
    expect(fitTower.synergy).toBeGreaterThan(0);
    expect(fitTower.synergy).toBeLessThanOrEqual(0.14);
  });
});

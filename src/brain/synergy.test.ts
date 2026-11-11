import { describe, expect, it } from 'vitest';
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

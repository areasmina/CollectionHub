import { describe, expect, it } from 'vitest';
import { STEPS, stepPicks } from './guided';
import { setBrainData } from './data';
import type { DeckContext } from './score';
import type { Combo } from './data';

const C = (type: string, text: string, cmc = 2, mana = '') => ({ type, text, cmc, mana });
const cards: Record<string, ReturnType<typeof C>> = {
  'Grave Lord': C('Legendary Creature — Zombie', 'Whenever a creature you control dies, each opponent loses 1 life.', 4, '{2}{B}{G}'),
  'Cheap Rock': C('Artifact', '{T}: Add one mana of any color.', 2),
  'Big Rock': C('Artifact', '{T}: Add {C}{C}{C}.', 6),
  'Elf': C('Creature — Elf Druid', '{T}: Add {G}.', 1, '{G}'),
  'Engine': C('Enchantment', 'Whenever a creature you control dies, draw a card.', 3, '{2}{B}'),
  'Burst': C('Sorcery', 'Draw three cards.', 4, '{3}{B}'),
  'Answer': C('Instant', 'Destroy target nonland permanent.', 2, '{1}{B}'),
  'Slow Kill': C('Sorcery', 'Destroy target creature.', 4, '{3}{B}'),
  'Wipe': C('Sorcery', 'Destroy all creatures.', 4, '{2}{B}{B}'),
  'Finisher': C('Creature — Hydra', 'Trample. Creatures you control get +3/+3 and gain trample until end of turn.', 6, '{4}{G}{G}'),
  'Bear': C('Creature — Bear', '', 2, '{1}{G}'),
  'Dual': C('Land', '{T}: Add {B} or {G}.', 0),
  'Tapped Dual': C('Land', 'This land enters tapped. {T}: Add {B} or {G}.', 0),
  'Off Land': C('Land', '{T}: Add {B}.', 0),
};
const cardOf = (n: string) => cards[n];
const ctx = (deck: string[] = []): DeckContext => ({ deck: ['Grave Lord', ...deck].map((name) => ({ name, qty: 1 })), cardOf, commander: 'Grave Lord', bracket: 3, aggression: 'hungry' });
const pool = Object.keys(cards).filter((n) => n !== 'Grave Lord').map((name) => ({ name, type: cards[name].type, cmc: cards[name].cmc }));
const names = (r: ReturnType<typeof stepPicks>) => r.picks.map((p) => p.name);

describe('guided builder: one step at a time, your cards in our order', () => {
  setBrainData({ roles: null, combos: null });
  it('has the EDHspace order: mana base, ramp, card advantage, targeted and mass disruption, plan, the rest', () => {
    expect(STEPS).toEqual(['lands', 'ramp', 'draw', 'removal', 'wipes', 'plan', 'rest']);
  });
  it('ramp lists only ramp, cheap fixing first, with the dial target and what the deck has', () => {
    const r = stepPicks('ramp', pool, ctx(['Elf']));
    expect(names(r)).toEqual(['Cheap Rock', 'Big Rock']); // Elf is already in the deck
    expect(r.have).toBe(1);
    expect(r.target).toEqual([9, 12]); // Hungry
  });
  it('card advantage: the engine before the one-off burst', () => {
    const d = stepPicks('draw', pool, ctx());
    expect(names(d)).toEqual(['Engine', 'Burst']);
  });
  it('targeted disruption: instant, flexible and cheap before sorcery-speed creature-only', () => {
    expect(names(stepPicks('removal', pool, ctx()))).toEqual(['Answer', 'Slow Kill']);
  });
  it('mass disruption lists the wipe; plan lists the ways to win', () => {
    expect(names(stepPicks('wipes', pool, ctx()))).toEqual(['Wipe']);
    expect(names(stepPicks('plan', pool, ctx()))).toContain('Finisher');
    expect(names(stepPicks('plan', pool, ctx()))).not.toContain('Bear');
  });
  it('mana base: only lands, both colours untapped first, the tapped one next', () => {
    const r = stepPicks('lands', pool, ctx(['Engine', 'Elf']), { identity: ['B', 'G'] });
    expect(names(r)).toEqual(['Dual', 'Tapped Dual', 'Off Land']);
    expect(r.target).toEqual([35, 38]);
  });
  it('the rest lists every spell not yet in the deck, no lands', () => {
    const r = stepPicks('rest', pool, ctx(['Bear']));
    expect(names(r)).not.toContain('Bear');
    expect(names(r)).not.toContain('Dual');
    expect(r.picks.length).toBe(9);
  });
  it('EDHREC rides along for the reference but never changes our order', () => {
    const plain = stepPicks('removal', pool, ctx());
    const withEdh = stepPicks('removal', pool.map((c) => (c.name === 'Slow Kill' ? { ...c, incl: 0.9, lift: 5 } : c)), ctx());
    expect(names(withEdh)).toEqual(names(plain));
    expect(withEdh.picks.find((p) => p.name === 'Slow Kill')!.incl).toBe(0.9);
    expect(withEdh.picks.every((p) => p.parts.every((x) => x.source !== 'EDHREC'))).toBe(true);
  });
  it('a combo the bracket forbids is listed last and marked, never hidden', () => {
    const k: Combo = { cards: ['Engine', 'Bear'], infinite: true, relevant: true, definite: true, mv: 5, id: 'x', tag: '', mustBeCommander: [false, false] };
    setBrainData({ roles: null, combos: new Map([['engine', [k]], ['bear', [k]]]) });
    const r = stepPicks('plan', pool, { ...ctx(['Engine']), bracket: 2 });
    expect(r.picks.at(-1)).toMatchObject({ name: 'Bear' });
    expect(r.picks.at(-1)!.blocked).toMatch(/bracket 2/);
    setBrainData({ roles: null, combos: null });
  });
});

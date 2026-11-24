import { describe, expect, it } from 'vitest';
import { jobQuality, Q } from './jobquality';
import { setBrainData } from './data';
import { scoreCard, type DeckContext } from './score';

setBrainData({ roles: null, combos: null }); // card text only, so each rule is tested on the words it reads

const card = (name: string, type: string, text: string, cmc: number) => ({ name, type, text, cmc });
const labels = (c: ReturnType<typeof card>) => jobQuality(c).map((p) => p.label);
const sum = (c: ReturnType<typeof card>) => jobQuality(c).reduce((n, p) => n + p.value, 0);

describe('job quality: how good a card is at its job, from its own text', () => {
  it('ramp: cheaper is better, and a rock that makes any colour fixes the mana', () => {
    const signet = card('Signet', 'Artifact', '{1}, {T}: Add {U}{B}.', 2);
    const prism = card('Prism', 'Artifact', '{T}: Add one mana of any color.', 2);
    const monolith = card('Big Rock', 'Artifact', '{T}: Add {C}{C}{C}.', 6);
    expect(labels(signet)).toContain('cheap ramp: 2 mana');
    expect(labels(prism)).toContain('fixes colours');
    expect(labels(monolith)).toContain('slow ramp: 6 mana');
    expect(sum(prism)).toBeGreaterThan(sum(signet));
    expect(sum(signet)).toBeGreaterThan(sum(monolith));
  });
  it('ramp: a land that arrives tapped is marked down a little', () => {
    const cultivate = card('Spread', 'Sorcery', 'Search your library for a basic land card, put it onto the battlefield tapped.', 3);
    expect(labels(cultivate)).toEqual(['ramp at 3 mana', 'its land enters tapped']);
    expect(sum(cultivate)).toBeCloseTo(Q.okRamp + Q.tapped);
  });
  it('removal: instant speed, any permanent and cheap each count; sorcery-speed creature-only gets none', () => {
    const anyPerm = card('Answer', 'Instant', 'Exile target nonland permanent.', 2);
    const slow = card('Slow Kill', 'Sorcery', 'Destroy target creature.', 4);
    expect(labels(anyPerm)).toEqual(['instant speed', 'answers more than creatures', 'cheap answer: 2 mana']);
    expect(labels(slow)).toEqual([]);
    const flash = card('Flash Guy', 'Creature — Elf', 'Flash\nWhen this enters, destroy target artifact or enchantment.', 3);
    expect(labels(flash)).toEqual(['instant speed', 'answers more than creatures']);
  });
  it('draw: a permanent that keeps drawing beats a one-off; "whenever you draw" is a payoff, not more cards', () => {
    const engine = card('Engine', 'Enchantment', 'Whenever a creature you control dies, draw a card.', 3);
    const tapper = card('Tapper', 'Artifact', '{2}, {T}: Draw a card.', 3);
    const burst = card('Burst', 'Sorcery', 'Draw three cards.', 4);
    const payoff = card('Payoff', 'Creature — Human', 'Whenever you draw a card, each opponent loses 1 life. Draw a card when this enters.', 3);
    expect(labels(engine)).toEqual(['keeps drawing']);
    expect(labels(tapper)).toEqual(['keeps drawing']);
    expect(labels(burst)).toEqual(['draws several at once']);
    expect(labels(payoff)).not.toContain('keeps drawing');
  });
  it('wipes: one that spares your board and a cheap one each count', () => {
    const oneSided = card('Their Wipe', 'Sorcery', 'Destroy all creatures you don\'t control.', 6);
    const cheap = card('Cheap Wipe', 'Sorcery', 'Destroy all creatures.', 4);
    expect(labels(oneSided)).toEqual(['spares your board']);
    expect(labels(cheap)).toEqual(['wipe at 4 mana']);
  });
  it('a card with no job and a land get no parts; reminder text is not read', () => {
    expect(labels(card('Bear', 'Creature — Bear', '', 2))).toEqual([]);
    expect(labels(card('Dual', 'Land', '{T}: Add {U} or {B}.', 0))).toEqual([]);
    expect(labels(card('Hint', 'Creature — Elf', '(Whenever a creature dies, draw a card.)', 2))).toEqual([]);
  });
});

describe('own evidence: our order leaves EDHREC out', () => {
  const meta: Record<string, { type: string; text: string; cmc: number }> = {
    Lord: { type: 'Legendary Creature — Human', text: '', cmc: 3 },
    Answer: { type: 'Instant', text: 'Exile target nonland permanent.', cmc: 2 },
  };
  const ctx = (evidence?: 'own'): DeckContext => ({ deck: [{ name: 'Lord', qty: 1 }], cardOf: (n) => meta[n], commander: 'Lord', bracket: 3, aggression: 'hungry', ...(evidence ? { evidence } : {}) });
  it('the default still counts EDHREC play rate and lift, and has no job-quality parts (the Forge is unchanged)', () => {
    const s = scoreCard({ name: 'Answer', incl: 0.6, lift: 4 }, ctx());
    expect(s.parts.filter((p) => p.source === 'EDHREC').map((p) => p.label)).toEqual(['in 60% of decks', '4.0x lift']);
    expect(s.parts.map((p) => p.label)).not.toContain('instant speed');
  });
  it("'own' drops both EDHREC parts, adds job quality, and the same card scores the same with or without EDHREC numbers", () => {
    const withEdh = scoreCard({ name: 'Answer', incl: 0.6, lift: 4 }, ctx('own'));
    const without = scoreCard({ name: 'Answer' }, ctx('own'));
    expect(withEdh.parts.some((p) => p.source === 'EDHREC')).toBe(false);
    expect(withEdh.parts.map((p) => p.label)).toContain('instant speed');
    expect(withEdh.total).toBeCloseTo(without.total);
  });
});

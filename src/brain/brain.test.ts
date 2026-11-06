import { afterEach, describe, expect, it } from 'vitest';
import { parseCombos, setBrainData } from './data';
import { finisherPlans, killCheck } from './win';
import { pickWildcards, seedOf } from './wildcard';
import { addTaste, tasteFor, tasteSummary, type TasteEvent } from './taste';
import { scoreCard, suggestCards, type DeckContext } from './score';

const t = (type: string, text: string, cmc = 2) => ({ type, text, cmc, mana: '' });
const CARDS: Record<string, ReturnType<typeof t>> = {
  'Craterhoof Behemoth': t('Creature — Beast', 'Haste\nWhen Craterhoof Behemoth enters, creatures you control gain trample and get +X/+X until end of turn, where X is the number of creatures you control.', 8),
  'Torment of Hailfire': t('Sorcery', 'Repeat the following process X times. Each opponent loses 3 life unless that player sacrifices a nonland permanent or discards a card.', 2),
  'Blood Artist': t('Creature — Vampire', 'Whenever Blood Artist or another creature dies, target player loses 1 life and you gain 1 life.', 2),
  "Thassa's Oracle": t('Creature — Merfolk Wizard', "When Thassa's Oracle enters, look at the top X cards of your library, where X is your devotion to blue. Put up to one of them on top of your library and the rest on the bottom of your library in a random order. If X is greater than or equal to the number of cards in your library, you win the game.", 2),
  'Demonic Consultation': t('Instant', 'Choose a card name. Exile the top six cards of your library, then reveal cards from the top of your library until you reveal the named card. Put that card into your hand and exile all other cards revealed this way.', 1),
  'Cultivate': t('Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', 3),
  "Kodama's Reach": t('Sorcery', 'Search your library for up to two basic land cards, reveal those cards, put one onto the battlefield tapped and the other into your hand, then shuffle.', 3),
  'Harmonize': t('Sorcery', 'Draw three cards.', 4),
  'Grizzly Bears': t('Creature — Bear', '', 2),
  Forest: t('Basic Land — Forest', '({T}: Add {G}.)', 0),
};
const cardOf = (n: string) => CARDS[n];
const combos = parseCombos({ v: 1, rows: [['Demonic Consultation', "Thassa's Oracle", 7, 3, '742-1295', 'R']] })!;
afterEach(() => setBrainData({ combos: null, roles: null }));

describe('kill check', () => {
  it('reads finishers from text, never from reminder text', () => {
    expect(finisherPlans(CARDS['Craterhoof Behemoth'])).toEqual(['overrun']);
    expect(finisherPlans(CARDS['Torment of Hailfire'])).toEqual(['drain']);
    expect(finisherPlans(CARDS['Blood Artist'])).toEqual([]); // 1 life to one target: not a finisher by itself
    expect(finisherPlans(CARDS["Thassa's Oracle"])).toEqual(['alt']);
    expect(finisherPlans({ text: 'Flying (This creature can’t be blocked except by creatures with flying or reach.)' })).toEqual([]);
  });
  it('counts combos as routes only where the bracket allows them', () => {
    const deck = ["Thassa's Oracle", 'Demonic Consultation', 'Craterhoof Behemoth'].map((name) => ({ name, card: cardOf(name) }));
    const b4 = killCheck(deck, 4, combos);
    expect(b4.count).toBe(3); // Oracle alone, the combo, Craterhoof
    expect(b4.verdict).toBe('lethal');
    const b3 = killCheck(deck, 3, combos);
    expect(b3.count).toBe(2);
    expect(b3.says).toMatch(/1 combo this bracket doesn't allow/);
    expect(killCheck([{ name: 'Grizzly Bears', card: cardOf('Grizzly Bears') }], 4, combos).verdict).toBe('none');
  });
});

describe('WILDCARD', () => {
  const pool = ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, why: 'hidden gem' }));
  it('same seed, same picks; a reroll changes them; never a card already in the deck', () => {
    const s = seedOf('Tymna the Weaver|My deck');
    expect(pickWildcards(pool, 2, s)).toEqual(pickWildcards([...pool].reverse(), 2, s));
    const many = new Set(Array.from({ length: 10 }, (_, i) => pickWildcards(pool, 2, s + i).map((c) => c.name).join()));
    expect(many.size).toBeGreaterThan(1);
    expect(pickWildcards(pool, 3, s, new Set(['A', 'B', 'C', 'D'])).map((c) => c.name).sort()).toEqual(['E', 'F']);
    expect(pickWildcards(pool, 9, s)).toHaveLength(3);
  });
});

describe('taste', () => {
  const ev = (card: string, action: TasteEvent['action'], deck: string): TasteEvent => ({ card, action, deck, at: 0 });
  it('a habit counts after 3 different decks, says why, and is capped', () => {
    let e: TasteEvent[] = [];
    for (const d of ['a', 'b']) e = addTaste(e, ev('swiftfoot boots', 'cut', d));
    expect(tasteFor(e, 'swiftfoot boots')).toBeNull();
    e = addTaste(e, ev('swiftfoot boots', 'cut', 'b')); // same deck again: still 2 decks
    expect(tasteFor(e, 'swiftfoot boots')).toBeNull();
    e = addTaste(e, ev('swiftfoot boots', 'never', 'c'));
    expect(tasteFor(e, 'swiftfoot boots', 'Swiftfoot Boots')).toEqual({ delta: -0.05, why: 'you cut Swiftfoot Boots in 3 decks' });
    for (const d of 'defghijklm') e = addTaste(e, ev('swiftfoot boots', 'cut', d));
    expect(tasteFor(e, 'swiftfoot boots')!.delta).toBe(-0.15);
    expect(tasteSummary(e)[0].card).toBe('swiftfoot boots');
  });
});

describe('suggestions follow the deck (proof the brain is personal and live)', () => {
  const base = (deck: string[], over: Partial<DeckContext> = {}): DeckContext => ({
    deck: deck.map((name) => ({ name, qty: 1 })),
    cardOf,
    bracket: 4,
    aggression: 'hungry',
    ...over,
  });
  const candidates = [
    { name: 'Cultivate', incl: 0.3 },
    { name: 'Harmonize', incl: 0.3 },
    { name: 'Craterhoof Behemoth', incl: 0.3 },
    { name: 'Grizzly Bears', incl: 0.52 },
  ];
  it('a deck short of ramp is offered ramp; once the ramp is in, the same list changes', () => {
    const thin = suggestCards(candidates, base(['Grizzly Bears', 'Forest']));
    expect(thin[0].parts.map((p) => p.source)).toContain('card text');
    const rampy = base(['Forest', ...Array.from({ length: 13 }, (_, i) => `Ramp ${i}`)], {
      cardOf: (n) => (n.startsWith('Ramp') ? CARDS["Kodama's Reach"] : CARDS[n]),
    });
    const after = suggestCards(candidates, rampy);
    expect(after.find((s) => s.name === 'Cultivate')!.parts.some((p) => /already has 13 ramp/.test(p.label))).toBe(true);
    expect(after.findIndex((s) => s.name === 'Cultivate')).toBeGreaterThan(thin.findIndex((s) => s.name === 'Cultivate'));
  });
  it('a finisher scores higher on the Lethal dial than on Patient', () => {
    const lethal = scoreCard({ name: 'Craterhoof Behemoth', incl: 0.3 }, base(['Forest'], { aggression: 'lethal' }));
    const patient = scoreCard({ name: 'Craterhoof Behemoth', incl: 0.3 }, base(['Forest', 'Torment of Hailfire', "Thassa's Oracle"], { aggression: 'patient' }));
    expect(lethal.parts.some((p) => /a way to win/.test(p.label))).toBe(true);
    expect(patient.parts.some((p) => /a way to win/.test(p.label))).toBe(false);
  });
  it('flags a card that completes a combo the bracket forbids, and rewards it where allowed', () => {
    setBrainData({ combos });
    const b3 = scoreCard({ name: 'Demonic Consultation' }, base(["Thassa's Oracle"], { bracket: 3 }));
    expect(b3.blocked).toMatch(/bracket 3 doesn't allow/);
    const b4 = scoreCard({ name: 'Demonic Consultation' }, base(["Thassa's Oracle"], { bracket: 4 }));
    expect(b4.blocked).toBeUndefined();
    expect(b4.parts.find((p) => p.source === 'Commander Spellbook')?.label).toBe("combo with Thassa's Oracle");
  });
  it("the player's habits move the order", () => {
    const taste: TasteEvent[] = ['a', 'b', 'c'].map((deck) => ({ card: 'grizzly bears', action: 'cut' as const, deck, at: 0 }));
    const plain = suggestCards(candidates, base(['Forest']));
    const mine = suggestCards(candidates, base(['Forest'], { taste }));
    expect(mine.findIndex((s) => s.name === 'Grizzly Bears')).toBeGreaterThan(plain.findIndex((s) => s.name === 'Grizzly Bears'));
    expect(mine.find((s) => s.name === 'Grizzly Bears')!.parts.at(-1)).toEqual({ label: 'you cut Grizzly Bears in 3 decks', value: -0.05, source: 'your taste' });
  });
});

import { describe, expect, it } from 'vitest';
import { bracketFit, deckRules, karstenLands, karstenSources, landColours, readiness, rulesLabel } from './validate';
import { whyCard } from './why';
import { setBrainData } from './data';

type C = { type: string; text: string; cmc?: number; mana?: string; ci: string[]; legal: boolean };
const cards: Record<string, C> = {
  Cmdr: { type: 'Legendary Creature — Human', text: '', cmc: 3, mana: '{1}{U}{B}', ci: ['U', 'B'], legal: true },
  Island: { type: 'Basic Land — Island', text: '({T}: Add {U}.)', ci: ['U'], legal: true },
  Swamp: { type: 'Basic Land — Swamp', text: '({T}: Add {B}.)', ci: ['B'], legal: true },
  'Sol Ring': { type: 'Artifact', text: '{T}: Add {C}{C}.', cmc: 1, mana: '{1}', ci: [], legal: true },
  'Mana Crypt': { type: 'Artifact', text: '{T}: Add {C}{C}.', cmc: 0, mana: '{0}', ci: [], legal: false },
  Kaya: { type: 'Legendary Planeswalker — Kaya', text: '', cmc: 7, mana: '{3}{W}{W}{B}{B}', ci: ['W', 'B'], legal: true },
  Bear: { type: 'Creature — Bear', text: '', cmc: 2, mana: '{1}{B}', ci: ['B'], legal: true },
  HeavyBlack: { type: 'Creature — Demon', text: '', cmc: 4, mana: '{1}{B}{B}{B}', ci: ['B'], legal: true },
};
const cardOf = (n: string) => cards[n.replace(/ \d+$/, '')] ?? cards.Bear;
const deck = (extra: [string, number][] = []) => [
  { name: 'Cmdr', qty: 1 },
  { name: 'Island', qty: 18 },
  { name: 'Swamp', qty: 18 },
  { name: 'Sol Ring', qty: 1 },
  ...Array.from({ length: 62 - extra.reduce((n, [, q]) => n + q, 0) }, (_, i) => ({ name: `Bear ${i}`, qty: 1 })),
  ...extra.map(([name, qty]) => ({ name, qty })),
];

describe('readiness', () => {
  it('a legal 100 with weak roles is "not ready", with every check stated', () => {
    const r = readiness({ deck: deck(), cardOf, commander: 'Cmdr', identity: ['U', 'B'] });
    expect(r.checks.find((c) => c.key === 'cards')).toMatchObject({ ok: true, value: '100' });
    expect(r.checks.filter((c) => c.kind === 'rules').every((c) => c.ok)).toBe(true);
    expect(r.checks.find((c) => c.key === 'lands')).toMatchObject({ ok: true, value: '36' });
    expect(r.checks.find((c) => c.key === 'colours')).toMatchObject({ ok: true, value: 'U 18' });
    expect(r.checks.find((c) => c.key === 'draw')!.ok).toBe(false);
    expect(r.verdict).toBe('not ready');
  });
  it('banned, doubled and off-colour cards make it "not legal" and name the cards', () => {
    const r = readiness({ deck: deck([['Mana Crypt', 1], ['Kaya', 1], ['Sol Ring', 1]]), cardOf, commander: 'Cmdr', identity: ['U', 'B'] });
    expect(r.verdict).toBe('not legal');
    expect(r.checks.find((c) => c.key === 'legal')!.cards).toEqual(['Mana Crypt']);
    expect(r.checks.find((c) => c.key === 'identity')!.cards).toEqual(['Kaya']);
    expect(r.checks.find((c) => c.key === 'singleton')!.cards).toEqual(['Sol Ring']);
  });
});

describe('deckRules + rulesLabel (My Decks tiles, Nov 14)', () => {
  it('are exactly the rules checks readiness starts with', () => {
    const d = deck([['Mana Crypt', 1], ['Kaya', 1], ['Sol Ring', 1]]);
    const o = { deck: d, cardOf, commander: 'Cmdr', identity: ['U', 'B'] };
    expect(deckRules(o)).toEqual(readiness(o).checks.filter((c) => c.kind === 'rules'));
  });
  it('a legal 100 has no label', () => {
    expect(rulesLabel(deckRules({ deck: deck(), cardOf, commander: 'Cmdr', identity: ['U', 'B'] }))).toBeUndefined();
  });
  it('a short deck says how many of 100, and lists every reason', () => {
    const short = deck().slice(0, 30);
    const r = rulesLabel(deckRules({ deck: short, cardOf, commander: 'Cmdr', identity: ['U', 'B'] }))!;
    const total = short.reduce((n, c) => n + c.qty, 0);
    expect(r.label).toBe(`${total}/100 CARDS`);
    expect(r.says).toContain('a Commander deck has exactly 100');
  });
  it('banned comes before off-colour and doubled; the rest is counted', () => {
    const d = deck([['Mana Crypt', 1], ['Kaya', 1], ['Sol Ring', 1]]);
    const r = rulesLabel(deckRules({ deck: d, cardOf, commander: 'Cmdr', identity: ['U', 'B'] }))!;
    expect(r.label).toBe('1 BANNED +2');
    expect(r.says).toContain('Mana Crypt');
    expect(r.says).toContain('Kaya');
    expect(r.says).toContain('More than one copy of Sol Ring');
  });
  it('no commander yet: colours are not judged', () => {
    const checks = deckRules({ deck: deck([['Kaya', 1]]), cardOf, identity: [], skipIdentity: true });
    expect(checks.map((c) => c.key)).toEqual(['cards', 'singleton', 'legal']);
  });
});

describe('Karsten mana & colour math', () => {
  it('karstenLands scales with average mana value, cheap ramp/draw flow, and bracket', () => {
    expect(karstenLands({ avgMv: 2.5, cheapFlow: 14, bracket: 4 })).toBe(35);
    expect(karstenLands({ avgMv: 3.8, cheapFlow: 6, bracket: 3 })).toBe(40);
    expect(karstenLands({ avgMv: 1.9, cheapFlow: 18, bracket: 5 })).toBe(26);
  });
  it('karstenSources raises colour source targets for pip-heavy and multi-pip colours', () => {
    const heavyB = [
      { name: 'Cmdr', qty: 1 },
      ...Array.from({ length: 12 }, (_, i) => ({ name: `HeavyBlack ${i}`, qty: 1 })),
    ];
    const targets = karstenSources({ deck: heavyB, cardOf, identity: ['U', 'B'] });
    expect(targets.U).toBe(10); // light splash stays at baseline 10
    expect(targets.B).toBeGreaterThanOrEqual(16); // heavy triple-pip black demands 16+ sources
  });
});

describe('landColours', () => {
  it('reads basic types, Add text, any-colour lands and fetches', () => {
    expect([...landColours({ type: 'Land — Island Swamp', text: '' })].sort()).toEqual(['B', 'U']);
    expect([...landColours({ type: 'Land', text: '{T}: Add {R} or {G}.' })].sort()).toEqual(['G', 'R']);
    expect(landColours({ type: 'Land', text: '{T}: Add one mana of any color.' }).size).toBe(5);
    expect([...landColours({ type: 'Land', text: '{T}, Pay 1 life, Sacrifice this land: Search your library for a Plains or Island card, put it onto the battlefield.' })].sort()).toEqual(['U', 'W']);
  });
});

describe('bracketFit', () => {
  const call = (o: Partial<Parameters<typeof bracketFit>[0]>) => ({ bracket: 2 as const, reasons: [], gameChangers: [], mld: [], extraTurns: [], tutors: [], combos: [], combosChecked: true, ...o });
  it('fits, over with the cause, under', () => {
    expect(bracketFit(call({ bracket: 3, gameChangers: ['Rhystic Study'] }), 3).fit).toBe('fits');
    const o = bracketFit(call({ bracket: 4, combos: [{ cards: ["Thassa's Oracle", 'Demonic Consultation'], early: true, mv: 2, id: 'x' }] }), 3);
    expect(o).toMatchObject({ fit: 'over', est: 4 });
    expect(o.over[0]).toContain('early two-card combo');
    expect(bracketFit(call({ bracket: 2 }), 4).fit).toBe('under');
    expect(bracketFit(call({ bracket: 4 }), 5).fit).toBe('fits');
  });
  it('handles empty deck (bracket 0) with clear explanation', () => {
    const empty = bracketFit(call({ bracket: 0 }), 4);
    expect(empty.est).toBe(0);
    expect(empty.fit).toBe('under');
    expect(empty.says).toContain('No bracket yet. Add cards to your deck to calculate its bracket');
  });
  it('explains why a deck fits bracket IV or III dynamically', () => {
    const b4 = bracketFit(call({
      bracket: 4,
      gameChangers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
      combos: [
        { cards: ['X', 'Y'], early: true, mv: 2, id: '1' },
        { cards: ['W', 'Z'], early: true, mv: 3, id: '2' },
      ],
    }), 4);
    expect(b4.says).toBe('Fits bracket IV. Driven by 8 Game Changers and 2 early two-card combos.');

    const b3 = bracketFit(call({ bracket: 3, gameChangers: ['Rhystic Study'] }), 3);
    expect(b3.says).toBe('Fits bracket III. Driven by 1 Game Changer.');
  });
});

describe('whyCard', () => {
  it('states how it got in, its job with the source, combos and what cutting it breaks', () => {
    setBrainData({ combos: new Map([['basalt monolith', [{ cards: ['Kinnan, Bonder Prodigy', 'Basalt Monolith'], infinite: true, relevant: true, definite: true, mv: 5, id: 'k1', tag: 'R', mustBeCommander: [true, false] }]], ['kinnan, bonder prodigy', []]]) as never });
    const cardOf = (n: string) => ({ 'Basalt Monolith': { type: 'Artifact', text: '{T}: Add {C}{C}{C}.', cmc: 3, mana: '{3}' }, 'Kinnan, Bonder Prodigy': { type: 'Legendary Creature', text: '', cmc: 2, mana: '{G}{U}' } })[n];
    const w = whyCard({ name: 'Basalt Monolith', ctx: { deck: [{ name: 'Kinnan, Bonder Prodigy', qty: 1 }, { name: 'Basalt Monolith', qty: 1 }], cardOf: cardOf as never, commander: 'Kinnan, Bonder Prodigy', bracket: 4, aggression: 'hungry' }, rec: { name: 'Basalt Monolith', incl: 0.6 } });
    expect(w.how).toBe('edhrec');
    expect(w.headline).toContain('60%');
    expect(w.roles.map((r) => r.role)).toContain('ramp');
    expect(w.combos).toEqual([{ with: 'Kinnan, Bonder Prodigy', early: false, allowed: true }]);
    expect(w.notes.join(' ')).toContain('breaks Kinnan, Bonder Prodigy + Basalt Monolith');
    setBrainData({ combos: null as never });
  });
});

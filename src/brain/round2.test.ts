import { afterEach, describe, expect, it } from 'vitest';
import { parseCombos, parseRoles, setBrainData } from './data';
import { comboBreaks, nearCombos, swapEffect } from './combos';
import { rankSubs, reasonsFor } from '../lib/subs';
import { statusOf } from '../lib/compare';
import { analysis, refShapeOf, type DeckStats } from '../lib/deckstats';

// Veteran playtest round 2 (real data, Kinnan cEDH): the cases that failed.
const combos = parseCombos({
  v: 1,
  rows: [
    ['Kinnan, Bonder Prodigy', 'Basalt Monolith', 23, 3, '4131-5016', 'R'], // 1|2|4|16: Kinnan must be the commander
    ['Dramatic Reversal', 'Isochron Scepter', 5, 0, '1530-1549', 'S'],
    ['Power Artifact', 'Basalt Monolith', 7, 4, '1550-4131', 'R'],
  ],
})!;
// bits: ramp 1, draw 2, removal 4, wipes 8, tutors 16, counters 32
const roles = parseRoles({ v: 1, cards: { 'basalt monolith': 1, 'grim monolith': 1, 'sylvan library': 2, 'cryptolith rite': 1, 'isochron scepter': 0, 'consecrated sphinx': 2, "thassa's oracle": 0, 'rhystic study': 2, 'counterspell': 32, 'mana drain': 33 } })!;
afterEach(() => setBrainData({ combos: null, roles: null }));
const kinnan = ['Kinnan, Bonder Prodigy', 'Basalt Monolith', 'Dramatic Reversal', 'Isochron Scepter', 'Sol Ring'];

describe('combos in the views', () => {
  it('says which combos a swap would break (Basalt Monolith, Dramatic Reversal)', () => {
    setBrainData({ combos });
    expect(comboBreaks('Basalt Monolith', kinnan).map((c) => c.cards.join(' + '))).toEqual(['Kinnan, Bonder Prodigy + Basalt Monolith']);
    expect(comboBreaks('Dramatic Reversal', kinnan)).toHaveLength(1);
    expect(comboBreaks('Sol Ring', kinnan)).toEqual([]);
    const e = swapEffect('Sol Ring', 'Power Artifact', kinnan, 3);
    expect(e.lost).toEqual([]);
    expect(e.gained.map((c) => c.id)).toEqual(['1550-4131']);
    expect(e.gainedBlocked.map((c) => c.id)).toEqual(['1550-4131']); // early (4 mana, definite): not in bracket III
  });
  it('lists combos one card away, owned cards first', () => {
    setBrainData({ combos });
    const near = nearCombos(['Basalt Monolith', 'Isochron Scepter'], new Set(['power artifact']));
    expect(near.map((n) => [n.add, n.owned])).toEqual([['Power Artifact', true], ['Kinnan, Bonder Prodigy', false], ['Dramatic Reversal', false]]);
  });
});

describe('swaps that understand what a card does', () => {
  it('Basalt Monolith gets a mana rock, not Sylvan Library', () => {
    setBrainData({ roles });
    const cands = [
      { name: 'Sylvan Library', category: 'Enchantments', type: 'Enchantment', cmc: 2, incl: 0.8 },
      { name: 'Isochron Scepter', category: 'Artifacts', type: 'Artifact', cmc: 2, incl: 0.6 },
      { name: 'Grim Monolith', category: 'Mana Artifacts', type: 'Artifact', cmc: 2, incl: 0.4 },
      { name: 'Cryptolith Rite', category: 'Enchantments', type: 'Enchantment', cmc: 2, incl: 0.5 },
    ];
    const top = rankSubs({ name: 'Basalt Monolith', category: 'Mana Artifacts', type: 'Artifact', cmc: 3 }, cands).map((c) => c.name);
    expect(top[0]).toBe('Grim Monolith');
    expect(top.indexOf('Sylvan Library')).toBe(-1);
    expect(reasonsFor({ name: 'Counterspell', type: 'Instant', cmc: 2 }, { name: 'Mana Drain', type: 'Instant', cmc: 2 })[0]).toBe('Same job: counters (Scryfall Tagger)');
  });
  it('never offers a basic land from "your binder"', () => {
    const cands = [{ name: 'Snow-Covered Forest', type: 'Basic Snow Land — Forest' }, { name: 'Exotic Orchard', type: 'Land' }, { name: 'Forest', type: 'Basic Land — Forest' }];
    expect(rankSubs({ name: "Gaea's Cradle", type: 'Legendary Land' }, cands).map((c) => c.name)).toEqual(['Exotic Orchard']);
  });
  it('snow-covered basics count as owned only when you own them', () => {
    expect(statusOf('Forest', new Map())).toBe('owned');
    expect(statusOf('Snow-Covered Forest', new Map())).toBe('missing');
    expect(statusOf('Snow-Covered Forest', new Map([['snow-covered forest', 4]]))).toBe('owned');
  });
});

describe('deck read follows the bracket (cEDH lists run ~25 lands)', () => {
  const s: DeckStats = { total: 100, lands: 25, avgMv: 1.9, curve: [], groups: new Map(), roles: { ramp: 16, draw: 10, removal: 15, wipes: 1, tutors: 9 }, pips: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, unknown: 0 };
  it('compares lands with EDHREC’s average deck for that bracket', () => {
    const ref = refShapeOf({ lists: [{ header: 'Land', cards: Array.from({ length: 25 }, () => ({ qty: 1 })) }] }, "EDHREC's cEDH average deck");
    expect(ref).toEqual({ lands: 25, label: "EDHREC's cEDH average deck" });
    const lines = analysis(s, { bracket: 5, ref });
    expect(lines.find((l) => /lands/.test(l.text))!.tone).toBe('ok');
    expect(lines.find((l) => /removal/.test(l.text))!.tone).toBe('ok');
    expect(lines.find((l) => /board wipes/.test(l.text))!.tone).toBe('ok');
  });
  it('still warns on 25 lands in a bracket 3 deck', () => {
    expect(analysis(s, { bracket: 3 }).find((l) => /lands/.test(l.text))!.tone).toBe('low');
    expect(analysis(s).find((l) => /lands/.test(l.text))!.tone).toBe('low');
  });
});

import { binderCandidates } from './candidates';
describe('candidates include owned cards EDHREC does not list', () => {
  it('Mind Stone comes up for a UG deck; off-colour, illegal, basics and never-use cards do not', () => {
    const b = (name: string, type: string, ci: string[], legal = true) => ({ name, key: name.toLowerCase(), type, cmc: 2, ci, legal });
    const out = binderCandidates([{ name: 'Mox Amber', incl: 0.5 }], [b('Mox Amber', 'Legendary Artifact', []), b('Mind Stone', 'Artifact', []), b('Talisman of Dominance', 'Artifact', ['U', 'B']), b('Mana Crypt', 'Artifact', [], false), b('Island', 'Basic Land — Island', ['U']), b('Fellwar Stone', 'Artifact', [])], ['U', 'G'], new Set(['fellwar stone']));
    expect(out.map((c) => c.name)).toEqual(['Mox Amber', 'Mind Stone']);
  });
});

import { identityGate, inIdentity, offIdentity } from './identity';
describe('colour identity is a hard rule (WILDCARD put Kaya in a Grixis deck, Nov 6)', () => {
  const grixis = ['U', 'B', 'R'];
  const ci: Record<string, string[]> = { 'Kaya, Intangible Slayer': ['W', 'B'], 'Felidar Guardian': ['W'], 'Glint-Horn Buccaneer': ['R'], 'Sol Ring': [] };
  it('EDHREC-listed owned cards outside the identity never become candidates', () => {
    const b = (name: string) => ({ name, key: name.toLowerCase(), type: 'Creature', cmc: 3, ci: ci[name], legal: true });
    const out = binderCandidates([{ name: 'Kaya, Intangible Slayer' }, { name: 'Glint-Horn Buccaneer' }, { name: 'Not In Binder' }], ['Kaya, Intangible Slayer', 'Glint-Horn Buccaneer', 'Felidar Guardian', 'Sol Ring'].map(b), grixis);
    expect(out.map((c) => c.name)).toEqual(['Glint-Horn Buccaneer', 'Sol Ring']);
  });
  it('the gate refuses off-colour and unknown cards; offIdentity flags only known ones', () => {
    const gate = identityGate(grixis, (n) => ci[n]);
    expect(['Kaya, Intangible Slayer', 'Felidar Guardian', 'Glint-Horn Buccaneer', 'Sol Ring', 'Unknown'].filter(gate)).toEqual(['Glint-Horn Buccaneer', 'Sol Ring']);
    expect(offIdentity(['Kaya, Intangible Slayer', 'Sol Ring', 'Unknown'], grixis, (n) => ci[n])).toEqual(['Kaya, Intangible Slayer']);
    expect(inIdentity([], [])).toBe(true);
    expect(inIdentity(['U'], [])).toBe(false);
  });
});

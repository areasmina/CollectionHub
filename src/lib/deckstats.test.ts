import { describe, expect, it } from 'vitest';
import { analysis, bracketOf, deckStats, groupOf, roleOf } from './deckstats';

const c = (type: string, text = '', cmc = 0, mana = '') => ({ type, text, cmc, mana });

describe('groupOf', () => {
  it('sorts by front-face type, lands and creatures first', () => {
    expect(groupOf('Legendary Creature — Elf')).toBe('Creatures');
    expect(groupOf('Artifact Creature — Golem')).toBe('Creatures');
    expect(groupOf('Land Creature — Forest Dryad')).toBe('Creatures');
    expect(groupOf('Artifact Land')).toBe('Lands');
    expect(groupOf('Sorcery // Land')).toBe('Sorceries');
    expect(groupOf('Artifact')).toBe('Artifacts');
    expect(groupOf(undefined)).toBe('Other');
  });
});

describe('roleOf', () => {
  it('reads ramp, draw, removal and wipes from Oracle text', () => {
    expect(roleOf(c('Artifact', '{T}: Add {C}{C}.'))).toEqual(['ramp']);
    expect(roleOf(c('Sorcery', 'Search your library for up to two basic land cards, reveal those cards'))).toEqual(['ramp']);
    expect(roleOf(c('Enchantment', 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.'))).toEqual(['draw']);
    expect(roleOf(c('Instant', 'Exile target creature. Its controller gains life equal to its power.'))).toEqual(['removal']);
    expect(roleOf(c('Sorcery', 'Destroy all creatures. They can\'t be regenerated.'))).toEqual(['wipes']);
    expect(roleOf(c('Sorcery', 'Search your library for a card, put that card into your hand'))).toEqual(['tutors']);
    expect(roleOf(c('Land', '{T}: Add {G}.'))).toEqual([]);
  });
});

describe('bracketOf', () => {
  const gc = new Set(['rhystic study', 'demonic tutor', 'cyclonic rift', 'smothering tithe']);
  it('floors at II and moves up on Game Changers', () => {
    expect(bracketOf([{ name: 'Sol Ring', card: c('Artifact', 'Add {C}{C}') }], gc).bracket).toBe(2);
    expect(bracketOf([{ name: 'Rhystic Study' }], gc).bracket).toBe(3);
    expect(bracketOf(['Rhystic Study', 'Demonic Tutor', 'Cyclonic Rift', 'Smothering Tithe'].map((name) => ({ name })), gc).bracket).toBe(4);
  });
  it('mass land denial is IV; offline is said', () => {
    const r = bracketOf([{ name: 'Armageddon', card: c('Sorcery', 'Destroy all lands.') }], null);
    expect(r.bracket).toBe(4);
    expect(r.reasons.join(' ')).toMatch(/couldn't be checked/);
  });
});

describe('deckStats + analysis', () => {
  const cards: Record<string, ReturnType<typeof c>> = {
    'Sol Ring': c('Artifact', '{T}: Add {C}{C}.', 1, '{1}'),
    'Llanowar Elves': c('Creature — Elf Druid', '{T}: Add {G}.', 1, '{G}'),
    Forest: c('Basic Land — Forest', '({T}: Add {G}.)'),
    'Craterhoof Behemoth': c('Creature — Beast', 'Haste', 8, '{5}{G}{G}{G}'),
  };
  const s = deckStats(
    [{ name: 'Llanowar Elves', qty: 1 }, { name: 'Sol Ring', qty: 1 }, { name: 'Forest', qty: 30 }, { name: 'Craterhoof Behemoth', qty: 1 }, { name: 'Mystery', qty: 1 }],
    (n) => cards[n],
    'Llanowar Elves',
  );
  it('counts groups, lands, curve, pips and unknown cards', () => {
    expect(s.total).toBe(34);
    expect(s.lands).toBe(30);
    expect(s.groups.get('Commander')).toBe(1);
    expect(s.groups.get('Lands')).toBe(30);
    expect(s.curve[1]).toBe(2);
    expect(s.curve[7]).toBe(1);
    expect(s.roles.ramp).toBe(2);
    expect(s.pips.G).toBe(4);
    expect(s.unknown).toBe(1);
    expect(s.avgMv).toBeCloseTo(10 / 3);
  });
  it('says what is light', () => {
    const a = analysis(s);
    expect(a[0].text).toMatch(/34 cards/);
    expect(a.find((x) => x.text.startsWith('30 lands'))?.tone).toBe('low');
  });
});

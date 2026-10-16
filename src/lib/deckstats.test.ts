import { describe, expect, it } from 'vitest';
import type { Card } from './db';
import { analyse, deckStats, estimateBracket, groupOf } from './deckstats';
import { norm } from './names';

const card = (name: string, type: string, cmc: number, text = '', mana = ''): Card => ({ id: name, name, key: norm(name), type, text, ci: [], cmc, mana, legal: true });
const cards = new Map(
  [
    card('Atraxa', 'Legendary Creature — Phyrexian Angel', 7, 'Flying', '{3}{G}{W}{U}{B}'),
    card('Sol Ring', 'Artifact', 1, '{T}: Add {C}{C}.', '{1}'),
    card('Cultivate', 'Sorcery', 3, 'Search your library for up to two basic land cards…', '{2}{G}'),
    card('Rhystic Study', 'Enchantment', 3, 'Whenever an opponent casts a spell, you may draw a card unless that player pays {1}.', '{2}{U}'),
    card('Swords to Plowshares', 'Instant', 1, 'Exile target creature. Its controller gains life equal to its power.', '{W}'),
    card('Wrath of God', 'Sorcery', 4, "Destroy all creatures. They can't be regenerated.", '{2}{W}{W}'),
    card('Demonic Tutor', 'Sorcery', 2, 'Search your library for a card, put that card into your hand, then shuffle.', '{1}{B}'),
    card('Time Warp', 'Sorcery', 5, 'Target player takes an extra turn after this one.', '{3}{U}{U}'),
    card('Temporal Manipulation', 'Sorcery', 5, 'Target player takes an extra turn after this one.', '{3}{U}{U}'),
    card('Armageddon', 'Sorcery', 4, 'Destroy all lands.', '{3}{W}'),
    card('Forest', 'Basic Land — Forest', 0),
    card('Dryad Arbor', 'Land Creature — Forest Dryad', 0),
  ].map((c) => [c.key, c]),
);
const of = (n: string) => cards.get(norm(n));
const deck = (names: string[]) => names.map((name) => ({ name, qty: name === 'Forest' ? 30 : 1 }));

describe('deckstats', () => {
  it('groups by main type, commander first, creature lands as lands', () => {
    expect(groupOf('Artifact Creature — Golem')).toBe('Creatures');
    expect(groupOf('Land Creature — Forest Dryad')).toBe('Lands');
    expect(groupOf('Instant // Sorcery')).toBe('Instants');
    const st = deckStats(deck(['Sol Ring', 'Atraxa', 'Forest', 'Dryad Arbor']), of, 'Atraxa');
    expect(st.groups.map((g) => [g.group, g.count])).toEqual([['Commander', 1], ['Artifacts', 1], ['Lands', 31]]);
    expect(st.lands).toBe(31);
    expect(st.curve[1]).toBe(1);
    expect(st.curve[7]).toBe(1);
    expect(st.pips).toEqual({ W: 1, U: 1, B: 1, R: 0, G: 1 });
  });

  it('finds roles from oracle text', () => {
    const st = deckStats(deck(['Sol Ring', 'Cultivate', 'Rhystic Study', 'Swords to Plowshares', 'Wrath of God', 'Demonic Tutor']), of);
    expect(st.roles.ramp).toEqual(['Sol Ring', 'Cultivate']);
    expect(st.roles.draw).toEqual(['Rhystic Study']);
    expect(st.roles.removal).toEqual(['Swords to Plowshares']);
    expect(st.roles.wipe).toEqual(['Wrath of God']);
    expect(st.roles.tutor).toEqual(['Demonic Tutor']); // Cultivate fetches lands: not a tutor
  });

  it('estimates the bracket with reasons', () => {
    const gcs = new Set(['rhystic study', 'demonic tutor']);
    const casual = deckStats(deck(['Sol Ring', 'Cultivate']), of);
    expect(estimateBracket(['Sol Ring', 'Cultivate'], casual, gcs).bracket).toBe(2);
    const names = ['Rhystic Study', 'Demonic Tutor'];
    const e = estimateBracket(names, deckStats(deck(names), of), gcs);
    expect(e.bracket).toBe(3);
    expect(e.gc).toEqual(names);
    const turns = ['Time Warp', 'Temporal Manipulation'];
    expect(estimateBracket(turns, deckStats(deck(turns), of), gcs).bracket).toBe(4);
    expect(estimateBracket(['Armageddon'], deckStats(deck(['Armageddon']), of), gcs).bracket).toBe(4);
  });

  it('reads low land counts as low', () => {
    const st = deckStats(deck(['Forest', 'Sol Ring']), of);
    const a = analyse(st);
    expect(a[0].tone).toBe('low');
    expect(a[0].text).toMatch(/^30 lands/);
  });
});

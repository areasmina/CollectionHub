import { describe, expect, it } from 'vitest';
import type { Card, Entry } from './db';
import { applyFilter, filterChips, filterCount, matches, noFilter, toggled, type FilterEnv } from './collfilter';

const card = (name: string, type: string, ci: string[]): Card => ({ id: name, name, key: name.toLowerCase(), type, text: '', ci, pv: 2, at: 1 } as Card);
const cards = new Map<string, Card>([
  ['Tatyova', card('Tatyova', 'Legendary Creature — Merfolk Druid', ['G', 'U'])],
  ['Sol Ring', card('Sol Ring', 'Artifact', [])],
  ['Cultivate', card('Cultivate', 'Sorcery', ['G'])],
  ['Wurmcoil', card('Wurmcoil', 'Artifact Creature — Phyrexian Wurm', [])],
]);
const e = (name: string): Entry => ({ profile: 1, cardId: name, name, qty: 1 });
const all = ['Tatyova', 'Sol Ring', 'Cultivate', 'Wurmcoil', 'Unknown'].map(e);
const env: FilterEnv = { cardOf: (x) => cards.get(x.name), inDeck: (n) => n === 'Sol Ring', isCommander: (c) => c.name === 'Tatyova' };
const names = (f: ReturnType<typeof noFilter>) => applyFilter(all, f, env).map((x) => x.name);

describe('binder filters', () => {
  it('no filter leaves everything, including cards whose data has not loaded', () => {
    expect(names(noFilter())).toHaveLength(5);
    expect(filterCount(noFilter())).toBe(0);
  });
  it('colours: any picked colour matches; C is the cards with none', () => {
    expect(names({ ...noFilter(), colours: ['G'] })).toEqual(['Tatyova', 'Cultivate']);
    expect(names({ ...noFilter(), colours: ['U', 'C'] })).toEqual(['Tatyova', 'Sol Ring', 'Wurmcoil']);
  });
  it('types: an artifact creature counts as both', () => {
    expect(names({ ...noFilter(), types: ['Creature'] })).toEqual(['Tatyova', 'Wurmcoil']);
    expect(names({ ...noFilter(), types: ['Artifact'] })).toEqual(['Sol Ring', 'Wurmcoil']);
  });
  it('groups together narrow further (all of them)', () => {
    expect(names({ ...noFilter(), colours: ['C'], types: ['Creature'] })).toEqual(['Wurmcoil']);
  });
  it('show: commanders, in a deck, not in a deck', () => {
    expect(names({ ...noFilter(), show: 'commanders' })).toEqual(['Tatyova']);
    expect(names({ ...noFilter(), show: 'indeck' })).toEqual(['Sol Ring']);
    expect(names({ ...noFilter(), show: 'free' })).toEqual(['Tatyova', 'Cultivate', 'Wurmcoil', 'Unknown']);
  });
  it('a card whose data is missing is left out only when a colour or type is asked for', () => {
    expect(matches(e('Unknown'), { ...noFilter(), colours: ['G'] }, env)).toBe(false);
    expect(matches(e('Unknown'), { ...noFilter(), show: 'free' }, env)).toBe(true);
  });
  it('the button counts groups; chips list every picked value; toggling twice undoes', () => {
    const f = toggled(toggled(toggled(noFilter(), 'colours', 'U'), 'colours', 'G'), 'show', 'indeck');
    expect(filterCount(f)).toBe(2);
    expect(filterChips(f).map((c) => c.label)).toEqual(['Blue', 'Green', 'In a deck']);
    expect(toggled(toggled(noFilter(), 'types', 'Land'), 'types', 'Land')).toEqual(noFilter());
    expect(toggled(toggled(noFilter(), 'show', 'free'), 'show', 'free').show).toBe('all');
  });
});

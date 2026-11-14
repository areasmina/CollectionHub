import { describe, expect, it } from 'vitest';
import type { Card, Entry } from './db';
import { applyFilter, filterChips, filterCount, matches, mvOf, noFilter, priceBand, toggled, type FilterEnv } from './collfilter';

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

  // Collection filters, round 2 (Nov 14): mana value, price per copy (≈CA$ at 1.4 here) and finish
  const priced = new Map<string, Card>([
    ['Land', { ...card('Land', 'Land', []), cmc: 0, usd: '0.10' }],
    ['Signet', { ...card('Signet', 'Artifact', []), cmc: 2, usd: '0.50', usdFoil: '4.00' }],
    ['Rhystic', { ...card('Rhystic', 'Enchantment', ['U']), cmc: 3, usd: '30.00' }],
    ['Titan', { ...card('Titan', 'Creature', ['G']), cmc: 8, usd: '10.00' }],
    ['NoPrice', { ...card('NoPrice', 'Sorcery', ['R']), cmc: 1 }],
  ]);
  const pe = (name: string, foil = false): Entry => ({ profile: 1, cardId: name, name, qty: 1, foil });
  const binder = [pe('Land'), pe('Signet'), pe('Signet', true), pe('Rhystic'), pe('Titan'), pe('NoPrice'), pe('Missing')];
  const penv: FilterEnv = { ...env, cardOf: (x) => priced.get(x.name) };
  const show = (f: Partial<ReturnType<typeof noFilter>>) => applyFilter(binder, { ...noFilter(), ...f }, penv).map((x) => x.name + (x.foil ? '*' : ''));
  it('mana value: picked buckets, 7+ holds everything from 7 up, lands are 0', () => {
    expect(show({ mv: ['0', '2'] })).toEqual(['Land', 'Signet', 'Signet*']);
    expect(show({ mv: ['7+'] })).toEqual(['Titan']);
    expect(mvOf(7)).toBe('7+');
    expect(mvOf(15)).toBe('7+');
    expect(mvOf(0)).toBe('0');
  });
  it('price: the band of one copy at its own finish; a card with no price never passes', () => {
    // Signet non-foil 0.50 USD → CA$0.70 (under 1); foil 4.00 USD → CA$5.60 (5 to 20)
    expect(show({ prices: ['u1'] })).toEqual(['Land', 'Signet']);
    expect(show({ prices: ['u20'] })).toEqual(['Signet*', 'Titan']);
    expect(show({ prices: ['o20'] })).toEqual(['Rhystic']);
    expect(show({ prices: ['u1', 'u5', 'u20', 'o20'] })).not.toContain('NoPrice');
    expect(priceBand({ usd: '3.5' })).toBe('u5'); // 3.50 × 1.4 = CA$4.90
    expect(priceBand({ usd: '10' })).toBe('u20'); // CA$14 (a band starts at its own number: 5 is in 5–20)
    expect(priceBand({})).toBeUndefined();
  });
  it('finish: foil or non-foil copies', () => {
    expect(show({ finish: 'foil' })).toEqual(['Signet*']);
    expect(show({ finish: 'nonfoil' })).toHaveLength(6);
  });
  it('new groups count once each, show as chips, and toggle off', () => {
    const f = toggled(toggled(toggled(noFilter(), 'mv', '3'), 'prices', 'o20'), 'finish', 'foil');
    expect(filterCount(f)).toBe(3);
    expect(filterChips(f).map((c) => c.label)).toEqual(['MV 3', 'CA$20 and up', 'Foil']);
    expect(toggled(f, 'finish', 'foil').finish).toBe('all');
    expect(toggled(toggled(toggled(f, 'mv', '3'), 'prices', 'o20'), 'finish', 'foil')).toEqual(noFilter());
  });
});

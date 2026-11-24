import { describe, expect, it } from 'vitest';
import { deckArena, deckCsv, deckText } from './export';

const deck = { profile: 1, name: 'T', commander: 'Tatyova, Benthic Druid', cards: [{ name: 'Tatyova, Benthic Druid', qty: 1 }, { name: 'Sol Ring', qty: 1, foil: true }, { name: 'Forest', qty: 20 }], updated: 0 };

describe('deck export', () => {
  it('Moxfield text marks foils; Arena drops them; CSV flags the commander', () => {
    expect(deckText(deck)).toBe('Commander\n1 Tatyova, Benthic Druid\n\nDeck\n1 Sol Ring *F*\n20 Forest');
    expect(deckArena(deck)).toBe('Commander\n1 Tatyova, Benthic Druid\n\nDeck\n1 Sol Ring\n20 Forest');
    expect(deckCsv(deck).split('\n')[1]).toBe('"Tatyova, Benthic Druid",1,true,normal');
  });
});

import { allBindersCsv, binderShareText, collectionCsv, collectionText } from './export';
import { mergeRows, parseImport } from './importers';

const e = (name: string, qty: number, extra: Partial<import('./db').Entry> = {}) => ({ profile: 1, cardId: `id-${name}`, name, qty, set: 'cmm', cn: '1', ...extra });
const binderA = [e('Sol Ring', 2, { foil: true }), e('Kodama, of the "East" Tree', 1, { list: 'Trade' })];
const binderB = [e('Counterspell', 4, { profile: 2, set: undefined, cn: undefined })];

describe('collection export', () => {
  it('one-binder CSV reads back to the same cards', () => {
    const back = parseImport(collectionCsv(binderA));
    expect(back.errors).toEqual([]);
    expect(back.rows).toEqual([
      { name: 'Sol Ring', qty: 2, set: 'cmm', cn: '1', id: 'id-Sol Ring', foil: true, added: undefined },
      { name: 'Kodama, of the "East" Tree', qty: 1, set: 'cmm', cn: '1', id: 'id-Kodama, of the "East" Tree', foil: false, added: undefined },
    ]);
  });

  it('all-binders CSV: one row per printing per binder, ManaBox binder column, every card reads back', () => {
    const csv = allBindersCsv([{ name: 'My Cards', entries: binderA }, { name: 'Second', entries: binderB }]);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('Binder Name,Name,Quantity,Set code,Collector number,Foil,Scryfall ID,List');
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe('Second,Counterspell,4,,,normal,id-Counterspell,');
    const back = parseImport(csv);
    expect(back.errors).toEqual([]);
    expect(back.rows.map((r) => [r.name, r.qty, r.foil, r.id])).toEqual([
      ['Sol Ring', 2, true, 'id-Sol Ring'],
      ['Kodama, of the "East" Tree', 1, false, 'id-Kodama, of the "East" Tree'],
      ['Counterspell', 4, false, 'id-Counterspell'],
    ]);
    // Quantities add up to the whole collection.
    expect(back.rows.reduce((n, r) => n + r.qty, 0)).toBe(7);
  });

  it('binder and list names a spreadsheet could run as formulas are defused; card names are kept exact', () => {
    const csv = allBindersCsv([{ name: '=HYPERLINK("x")', entries: [e('+2 Mace', 1, { list: '@trade' })] }]);
    expect(csv.split('\n')[1]).toBe(`"'=HYPERLINK(""x"")",+2 Mace,1,cmm,1,normal,id-+2 Mace,'@trade`);
    expect(parseImport(csv).rows[0].name).toBe('+2 Mace');
  });

  it('shared binder list: a heading the importer skips, then lines that read back with set, number and foil', () => {
    const text = binderShareText('My Cards', binderA);
    expect(text.split('\n')[0]).toBe('# My Cards: 3 cards, 2 unique');
    expect(text.endsWith(collectionText(binderA))).toBe(true);
    const back = mergeRows(parseImport(text).rows);
    expect(back.map((r) => [r.name, r.qty, r.set, r.cn, r.foil])).toEqual([
      ['Sol Ring', 2, 'CMM', '1', true],
      ['Kodama, of the "East" Tree', 1, 'CMM', '1', false],
    ]);
  });
});

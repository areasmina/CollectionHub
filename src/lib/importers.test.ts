import { describe, expect, it } from 'vitest';
import { mergeRows, parseCsv, parseImport } from './importers';
import { slug } from './names';

describe('parseCsv', () => {
  it('handles quotes, escaped quotes and CRLF', () => {
    expect(parseCsv('a,b\r\n"Alesha, Who Laughs at Fate","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['Alesha, Who Laughs at Fate', 'say "hi"'],
    ]);
  });
});

describe('parseImport', () => {
  it('reads a ManaBox export', () => {
    const csv =
      'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Added\n' +
      '"Alesha, Who Laughs at Fate",FDN,Foundations,115,normal,rare,1,100953,a93e3406-4e29-4bc0-ae52-cbd2ac1f99a4,3.52,2026-10-01T23:45:32.777Z\n' +
      'Sol Ring,CMM,Commander Masters,410,foil,uncommon,2,1,bf6a2f02-0000-0000-0000-000000000000,1,\n';
    const p = parseImport('﻿' + csv);
    expect(p.format).toBe('manabox');
    expect(p.errors).toEqual([]);
    expect(p.rows[0]).toMatchObject({ name: 'Alesha, Who Laughs at Fate', qty: 1, set: 'FDN', cn: '115', id: 'a93e3406-4e29-4bc0-ae52-cbd2ac1f99a4', foil: false, added: '2026-10-01T23:45:32.777Z' });
    expect(p.rows[1]).toMatchObject({ name: 'Sol Ring', qty: 2, foil: true });
  });

  it('reads a generic CSV with name/quantity columns and reports bad lines', () => {
    const p = parseImport('Count,Card Name\n3,Lightning Bolt\nx,Opt\n2,\n');
    expect(p.format).toBe('csv');
    expect(p.rows).toEqual([expect.objectContaining({ name: 'Lightning Bolt', qty: 3 })]);
    expect(p.errors.map((e) => e.line)).toEqual([3, 4]);
  });

  it('reads Moxfield / Arena text with sections, set codes and foil marks', () => {
    const p = parseImport("Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1x Sol Ring (CMM) 410 *F*\n2 Island\nSIDEBOARD:\n1 Opt (ELD) 59\n");
    expect(p.format).toBe('text');
    expect(p.rows).toEqual([
      { name: "Atraxa, Praetors' Voice", qty: 1, set: undefined, cn: undefined, foil: false, section: 'Commander', edge: true },
      { name: 'Sol Ring', qty: 1, set: 'CMM', cn: '410', foil: true, section: 'Deck' },
      { name: 'Island', qty: 2, set: undefined, cn: undefined, foil: false, section: 'Deck' },
      { name: 'Opt', qty: 1, set: 'ELD', cn: '59', foil: false, section: 'SIDEBOARD', edge: true },
    ]);
  });

  it('reads Archidekt text with categories and tags', () => {
    const p = parseImport('1x Atraxa, Praetors\' Voice (2x2) 190 [Commander{top}] ^Have,#37d67a^\n1x Arcane Signet (cmm) 375 [Ramp]\n');
    expect(p.rows[0]).toMatchObject({ name: "Atraxa, Praetors' Voice", set: '2x2', cn: '190', section: 'Commander' });
    expect(p.rows[1]).toMatchObject({ name: 'Arcane Signet', set: 'cmm', cn: '375' });
  });

  it('reads a plain card list and skips headers like "Creatures (25)"', () => {
    const p = parseImport('// Lands\nCommand Tower\nCreatures (25)\n4 Llanowar Elves\n');
    expect(p.rows.map((r) => [r.qty, r.name, r.section])).toEqual([
      [1, 'Command Tower', 'Lands'],
      [4, 'Llanowar Elves', 'Creatures'],
    ]);
  });
});

describe('mergeRows / slug', () => {
  it('adds up the same printing', () => {
    expect(mergeRows([{ name: 'Opt', qty: 1 }, { name: 'opt', qty: 2 }, { name: 'Opt', qty: 1, foil: true }]).map((r) => r.qty)).toEqual([3, 1]);
  });
  it('builds EDHREC slugs', () => {
    expect(slug("Atraxa, Praetors' Voice")).toBe('atraxa-praetors-voice');
    expect(slug('Grishnákh, Brash Instigator')).toBe('grishnakh-brash-instigator');
    expect(slug("Urza's Saga")).toBe('urzas-saga');
  });
});

describe('text import quirks (veteran playtest A8)', () => {
  it('reads "SB: 1 Card" as a sideboard card', () => {
    const p = parseImport('1 Sol Ring\nSB: 1 Force of Will');
    expect(p.rows.map((r) => [r.name, r.qty, r.section])).toEqual([['Sol Ring', 1, undefined], ['Force of Will', 1, 'Sideboard']]);
  });
  it('reads a quantity after the name', () => {
    const p = parseImport('Sol Ring x2\nArcane Signet ×3\nCounterspell 3\nForest');
    expect(p.rows.map((r) => [r.name, r.qty])).toEqual([['Sol Ring', 2], ['Arcane Signet', 3], ['Counterspell', 3], ['Forest', 1]]);
  });
  it("skips Arena's About / Name header", () => {
    const p = parseImport('About\nName Kinnan cEDH\n\nDeck\n1 Kinnan, Bonder Prodigy\n1 Basalt Monolith');
    expect(p.rows.map((r) => r.name)).toEqual(['Kinnan, Bonder Prodigy', 'Basalt Monolith']);
  });
});

describe('a whole collection in one file', () => {
  it('reads and merges 100,000 ManaBox rows quickly and without losing any', () => {
    const head = 'Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency';
    const id = (i: number) => `${i.toString(16).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(i).padStart(12, '0')}`;
    const csv = [head, ...Array.from({ length: 100_000 }, (_, i) => `"Card, Number ${i}",tst,Test Set,${i + 1},${i % 7 ? 'normal' : 'foil'},common,${(i % 3) + 1},${i},${id(i)},0.25,false,false,near_mint,en,CAD`)].join('\n');
    const t = performance.now();
    const p = parseImport(csv);
    const rows = mergeRows(p.rows);
    const ms = performance.now() - t;
    expect(p.format).toBe('manabox');
    expect(p.errors).toEqual([]);
    expect(rows).toHaveLength(100_000);
    expect(rows.reduce((n, r) => n + r.qty, 0)).toBe(199_999);
    expect(rows[99_999]).toMatchObject({ name: 'Card, Number 99999', id: id(99_999), set: 'tst', cn: '100000' });
    expect(ms).toBeLessThan(5000); // a slow CI machine still does this in well under a second or two
  });
});

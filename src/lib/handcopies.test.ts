import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { collectionCsv } from './export';
import { copiesOf, moveOneCopy } from './handcopies';
import { mergeRows, parseImport } from './importers';
import { mergeSync } from './syncmerge';

const row = (id: number, qty: number, more: Partial<Entry> = {}): Entry => ({ id, profile: 1, cardId: 'sol-cmm', name: 'Sol Ring', qty, set: 'cmm', cn: '410', added: 100, ...more });
const total = (list: Entry[]) => list.reduce((n, e) => n + e.qty, 0);
/** The binder after a move: rows put replace (or join) the old ones, deleted ids go. */
const apply = (list: Entry[], { put, del }: { put: Entry[]; del: number[] }) => {
  let next = Math.max(0, ...list.map((e) => e.id ?? 0)) + 1; // like Dexie: a new row gets a fresh id
  const out = list.filter((e) => !del.includes(e.id!) && !put.some((p) => p.id === e.id));
  return [...out, ...put.map((p) => (p.id === undefined ? { ...p, id: next++ } : p))];
};

describe('copiesOf', () => {
  it('lists every copy of a card one by one, any printing or finish, and nothing else', () => {
    const list = [row(1, 2), row(2, 1, { foil: true }), row(3, 1, { cardId: 'sol-c21', set: 'c21', cn: '263' }), row(4, 3, { cardId: 'bolt', name: 'Lightning Bolt' })];
    const c = copiesOf(list, 'sol ring');
    expect(c).toHaveLength(4);
    expect(c.map((x) => [x.rowId, x.nth])).toEqual([
      [3, 0], // c21 sorts before cmm
      [1, 0],
      [1, 1],
      [2, 0], // non-foil before foil within a printing
    ]);
  });
  it('skips rows without an id or with no copies', () => {
    expect(copiesOf([row(1, 0), { ...row(2, 1), id: undefined }], 'Sol Ring')).toEqual([]);
  });
});

describe('moveOneCopy', () => {
  it('makes one of three copies foil: a new foil row, two stay non-foil', () => {
    const list = [row(1, 3)];
    const r = moveOneCopy(list, 1, { foil: true });
    expect(r.del).toEqual([]);
    expect(r.put).toEqual([row(1, 2), { ...row(1, 1), id: undefined, foil: true }]);
    expect(total(apply(list, r))).toBe(3);
  });
  it('joins a row that already matches, and drops the emptied row', () => {
    const list = [row(1, 1), row(2, 2, { foil: true, added: 50 })];
    const r = moveOneCopy(list, 1, { foil: true });
    expect(r).toEqual({ put: [row(2, 3, { foil: true, added: 50 })], del: [1] });
  });
  it('keeps the earliest added date when copies join', () => {
    const r = moveOneCopy([row(1, 1, { added: 10 }), row(2, 1, { foil: true, added: 90 })], 1, { foil: true });
    expect(r.put[0].added).toBe(10);
  });
  it('changes the artwork of one copy only', () => {
    const list = [row(1, 2)];
    const r = moveOneCopy(list, 1, { printing: { cardId: 'sol-c21', set: 'C21', cn: '263' } });
    const after = apply(list, r);
    expect(after.map((e) => [e.cardId, e.set, e.cn, e.qty])).toEqual([
      ['sol-cmm', 'cmm', '410', 1],
      ['sol-c21', 'c21', '263', 1],
    ]);
  });
  it('keeps finish and list when only the printing changes', () => {
    const r = moveOneCopy([row(1, 1, { foil: true, list: 'Trade' })], 1, { printing: { cardId: 'sol-c21', set: 'c21', cn: '263' } });
    expect(r.put[0]).toMatchObject({ foil: true, list: 'Trade', cardId: 'sol-c21' });
  });
  it('moves one copy into a list and back out', () => {
    const list = [row(1, 2)];
    const inList = apply(list, moveOneCopy(list, 1, { list: 'Trade' }));
    expect(inList.find((e) => e.list === 'Trade')?.qty).toBe(1);
    const back = apply(inList, moveOneCopy(inList, inList.find((e) => e.list === 'Trade')!.id!, { list: null }));
    expect(back).toEqual([row(1, 2)]);
  });
  it('does nothing when the change leaves the copy as it was, or the row is gone', () => {
    expect(moveOneCopy([row(1, 1)], 1, { foil: false })).toEqual({ put: [], del: [] });
    expect(moveOneCopy([row(1, 1, { foil: true })], 1, { foil: true })).toEqual({ put: [], del: [] });
    expect(moveOneCopy([row(1, 1)], 1, { printing: { cardId: 'sol-cmm', set: 'CMM', cn: '410' } })).toEqual({ put: [], del: [] });
    expect(moveOneCopy([row(1, 1)], 9, { foil: true })).toEqual({ put: [], del: [] });
  });
  it('never changes how many copies the binder holds, over many changes', () => {
    let list: Entry[] = [row(1, 4), row(2, 1, { foil: true }), row(3, 2, { cardId: 'sol-c21', set: 'c21', cn: '263' })];
    const steps: Parameters<typeof moveOneCopy>[2][] = [{ foil: true }, { printing: { cardId: 'sol-c21', set: 'c21', cn: '263' } }, { list: 'Trade' }, { foil: false }, { list: null }, { printing: { cardId: 'sol-cmm', set: 'cmm', cn: '410' } }];
    for (let i = 0; i < 30; i++) {
      const copies = copiesOf(list, 'Sol Ring');
      list = apply(list, moveOneCopy(list, copies[(i * 7) % copies.length].rowId, steps[i % steps.length]));
      expect(total(list)).toBe(7);
      expect(list.every((e) => e.qty > 0)).toBe(true);
    }
  });
});

describe('copies changed one by one still export, import and sync as before', () => {
  const before = [row(1, 3)];
  const after = apply(before, moveOneCopy(before, 1, { foil: true }));

  it('the export has one line per printing and finish, and the importer reads it back', () => {
    const parsed = mergeRows(parseImport(collectionCsv(after)).rows);
    expect(parsed.map((r) => [r.name, r.qty, r.set?.toLowerCase(), r.cn, !!r.foil]).sort()).toEqual([
      ['Sol Ring', 1, 'cmm', '410', true],
      ['Sol Ring', 2, 'cmm', '410', false],
    ]);
  });

  it('a sync takes the split from this device without losing or doubling copies', () => {
    const at = (e: Entry[]) => ({ profiles: [{ id: 1, name: 'Main' }], entries: e, decks: [] });
    const { data } = mergeSync(at(before), at(after), at(before));
    expect(data.entries.map((e) => [e.foil ? 'foil' : 'plain', e.qty]).sort()).toEqual([
      ['foil', 1],
      ['plain', 2],
    ]);
  });

  it('a sync takes the split from the other device too', () => {
    const at = (e: Entry[]) => ({ profiles: [{ id: 1, name: 'Main' }], entries: e, decks: [] });
    const { data } = mergeSync(at(before), at(before), at(after));
    expect(total(data.entries)).toBe(3);
    expect(data.entries.find((e) => e.foil)?.qty).toBe(1);
  });
});

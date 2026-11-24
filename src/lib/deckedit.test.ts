import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { flipAllCopies, flipOneCopy } from './deckedit';

const e = (id: number, qty: number, foil = false): Entry => ({ id, profile: 1, cardId: 'sol', name: 'Sol Ring', qty, set: 'cmm', cn: '410', foil });

describe('flipOneCopy', () => {
  it('turns the only copy foil', () => {
    expect(flipOneCopy([e(1, 1)], 'Sol Ring', true)).toEqual({ put: [{ ...e(1, 1), id: undefined, foil: true }], del: [1] });
  });
  it('moves one of several copies, into the existing foil entry', () => {
    expect(flipOneCopy([e(1, 2), e(2, 1, true)], 'Sol Ring', true)).toEqual({ put: [e(1, 1), e(2, 2, true)], del: [] });
  });
  it('back to non-foil', () => {
    expect(flipOneCopy([e(2, 1, true)], 'sol ring', false).put).toEqual([{ ...e(2, 1), id: undefined }]);
  });
  it('does nothing when no copy has the other finish', () => {
    expect(flipOneCopy([e(1, 1, true)], 'Sol Ring', true)).toEqual({ put: [], del: [] });
    expect(flipOneCopy([], 'Sol Ring', true)).toEqual({ put: [], del: [] });
  });
});

describe('flipAllCopies (MARK AS FOIL turns the whole card, Nov 24)', () => {
  const total = (rows: Entry[]) => rows.reduce((n, r) => n + r.qty, 0);
  it('turns every copy foil in one row: the card stays one tile', () => {
    expect(flipAllCopies([e(1, 2)], 'Sol Ring', true)).toEqual({ put: [{ ...e(1, 2), id: undefined, foil: true }], del: [1] });
  });
  it('joins the copies to an existing foil row of the same printing, count unchanged', () => {
    const r = flipAllCopies([e(1, 2), e(2, 1, true)], 'Sol Ring', true);
    expect(r).toEqual({ put: [e(2, 3, true)], del: [1] });
    expect(total(r.put)).toBe(3);
  });
  it('keeps different printings and lists apart', () => {
    const other: Entry = { ...e(3, 1), set: 'c21', cn: '263' };
    const listed: Entry = { ...e(4, 1), list: 'trade' };
    const r = flipAllCopies([e(1, 2), other, listed], 'sol ring', true);
    expect(r.del.sort()).toEqual([1, 3, 4]);
    expect(r.put).toHaveLength(3);
    expect(r.put.every((p) => p.foil && p.id === undefined)).toBe(true);
    expect(total(r.put)).toBe(4);
  });
  it('back to non-foil, and nothing when every copy already has that finish', () => {
    expect(flipAllCopies([e(2, 3, true)], 'Sol Ring', false)).toEqual({ put: [{ ...e(2, 3), id: undefined }], del: [2] });
    expect(flipAllCopies([e(1, 2)], 'Sol Ring', false)).toEqual({ put: [], del: [] });
    expect(flipAllCopies([], 'Sol Ring', true)).toEqual({ put: [], del: [] });
  });
  it('leaves other cards alone', () => {
    const bolt: Entry = { id: 9, profile: 1, cardId: 'bolt', name: 'Lightning Bolt', qty: 2 };
    expect(flipAllCopies([e(1, 1), bolt], 'Sol Ring', true).del).toEqual([1]);
  });
});

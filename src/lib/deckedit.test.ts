import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { flipOneCopy } from './deckedit';

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

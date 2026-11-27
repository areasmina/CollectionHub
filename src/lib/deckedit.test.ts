import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { flipOneCopy, formatRecord, nextPartnerState, nextRecordState } from './deckedit';

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

describe('formatRecord', () => {
  it('returns empty string when unplayed and formats win rate otherwise', () => {
    expect(formatRecord()).toBe('');
    expect(formatRecord(0, 0)).toBe('');
    expect(formatRecord(3, 1)).toBe('3W–1L (75%)');
    expect(formatRecord(0, 2)).toBe('0W–2L (0%)');
  });
});

describe('nextPartnerState & nextRecordState', () => {
  it('computes partner transitions cleanly', () => {
    expect(nextPartnerState({}, 'Thrasios, Triton Hero')).toEqual({ next: 'Thrasios, Triton Hero', prev: undefined });
    expect(nextPartnerState({ partner: 'Thrasios, Triton Hero' }, undefined)).toEqual({ next: undefined, prev: 'Thrasios, Triton Hero' });
  });
  it('computes win, loss, and reset transitions cleanly', () => {
    const s1 = nextRecordState({}, 'win');
    expect(s1).toEqual({ next: { wins: 1, losses: 0 }, prev: { wins: undefined, losses: undefined } });
    const s2 = nextRecordState(s1.next, 'loss');
    expect(s2).toEqual({ next: { wins: 1, losses: 1 }, prev: { wins: 1, losses: 0 } });
    expect(nextRecordState(s2.next, 'reset')).toEqual({ next: { wins: undefined, losses: undefined }, prev: { wins: 1, losses: 1 } });
  });
});

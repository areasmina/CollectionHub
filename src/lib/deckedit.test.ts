import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { flipOneCopy, swapCards } from './deckedit';

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

describe('swapCards', () => {
  const cards = [{ name: 'Sol Ring', qty: 1 }, { name: 'Forest', qty: 10, foil: true }, { name: 'Island', qty: 5 }];
  it('replaces a card in place with the same count, normal finish', () => {
    expect(swapCards(cards, 'Forest', 'Snow-Covered Forest')).toEqual([{ name: 'Sol Ring', qty: 1 }, { name: 'Snow-Covered Forest', qty: 10 }, { name: 'Island', qty: 5 }]);
  });
  it('adds the copies when the new card is already in the deck', () => {
    expect(swapCards(cards, 'Forest', 'island')).toEqual([{ name: 'Sol Ring', qty: 1 }, { name: 'Island', qty: 15 }]);
  });
  it('leaves the list alone for an unknown card', () => {
    expect(swapCards(cards, 'Nope', 'X')).toBe(cards);
  });
});

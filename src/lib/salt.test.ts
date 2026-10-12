import { describe, expect, it } from 'vitest';
import { deckSalt } from './edhrec';

describe('deckSalt', () => {
  it('sums known salt once per card, saltiest first', () => {
    const salt = new Map([['stasis', 3], ['rhystic study', 2.5], ['sol ring', 1]]);
    const s = deckSalt(['Sol Ring', 'Stasis', 'Forest', 'Rhystic Study', 'Stasis'], salt);
    expect(s.total).toBe(6.5);
    expect(s.top.map((c) => c.name)).toEqual(['Stasis', 'Rhystic Study', 'Sol Ring']);
  });
});

import { fetchedNote, finishUsd } from './prices';

describe('prices', () => {
  it('uses the foil price for foil copies and falls back to non-foil', () => {
    expect(finishUsd({ usd: '1.00', usdFoil: '5.00' }, true)).toBe('5.00');
    expect(finishUsd({ usd: '1.00', usdFoil: '5.00' }, false)).toBe('1.00');
    expect(finishUsd({ usd: '1.00' }, true)).toBe('1.00');
  });
  it('states when prices were fetched, never inventing a date', () => {
    expect(fetchedNote([undefined])).toBe('prices not fetched yet');
    const d = new Date(2026, 9, 12).getTime();
    expect(fetchedNote([d, d])).toBe(`Scryfall prices fetched ${new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}`);
    expect(fetchedNote([d - 2 * 864e5, d])).toMatch(/–/);
  });
});

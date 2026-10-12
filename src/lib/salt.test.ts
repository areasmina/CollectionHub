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

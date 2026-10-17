import { describe, expect, it } from 'vitest';
import { comboIndex, comboNote, parseCombos } from './combos';

const answer = {
  results: {
    identity: 'U',
    included: [
      { uses: [{ card: { name: 'Dramatic Reversal' } }, { card: { name: 'Isochron Scepter' } }], produces: [{ feature: { name: 'Infinite colorless mana' } }, { feature: { name: 'Infinite storm count' } }, { feature: { name: 'x' } }] },
      { uses: [{ card: { name: 'Lonely' } }], produces: [] },
    ],
    almostIncluded: [{ uses: [{ card: { name: 'Thassa’s Oracle' } }, { card: { name: 'Demonic Consultation' } }] }],
  },
};

describe('combos', () => {
  it('keeps only combos complete in the deck', () => {
    const c = parseCombos(answer);
    expect(c).toEqual([{ cards: ['Dramatic Reversal', 'Isochron Scepter'], result: 'Infinite colorless mana, Infinite storm count' }]);
    expect(parseCombos(null)).toEqual([]);
  });
  it('indexes cards and writes a note without the card itself', () => {
    const by = comboIndex(parseCombos(answer));
    expect([...by.keys()]).toEqual(['dramatic reversal', 'isochron scepter']);
    expect(comboNote('Isochron Scepter', by.get('isochron scepter'))).toBe('combo: Dramatic Reversal → Infinite colorless mana, Infinite storm count');
  });
});

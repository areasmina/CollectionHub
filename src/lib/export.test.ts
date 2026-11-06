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

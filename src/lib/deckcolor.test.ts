import { describe, expect, it } from 'vitest';
import { colourByCard, deckColour, DECK_COLOURS } from './deckcolor';

describe('deck colours', () => {
  it('uses the picked colour, else a steady default by id', () => {
    expect(deckColour({ id: 3, color: '#123456' })).toBe('#123456');
    expect(deckColour({ id: 1 })).toBe(DECK_COLOURS[0][0]);
    expect(deckColour({ id: 2 })).toBe(DECK_COLOURS[1][0]);
    expect(deckColour({ id: 1 + DECK_COLOURS.length })).toBe(DECK_COLOURS[0][0]);
  });
  it('maps each card to the colours of the active decks it is in', () => {
    const m = colourByCard(
      [
        { id: 1, cards: [{ name: 'Sol Ring', qty: 1 }], inactive: false },
        { id: 2, color: '#ff0000', cards: [{ name: 'Sol Ring', qty: 1 }, { name: 'Forest', qty: 9 }] },
        { id: 3, cards: [{ name: 'Island', qty: 1 }], inactive: true },
      ],
      (n) => n.toLowerCase(),
    );
    expect(m.get('sol ring')).toEqual([DECK_COLOURS[0][0], '#ff0000']);
    expect(m.get('forest')).toEqual(['#ff0000']);
    expect(m.has('island')).toBe(false);
  });
});

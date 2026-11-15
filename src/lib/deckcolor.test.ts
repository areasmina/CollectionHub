import { describe, expect, it } from 'vitest';
import { colourByCard, deckColour, DECK_COLOURS, wheelColour } from './deckcolor';

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

describe('the deck colour wheel', () => {
  const R = 50;
  it('reads the angle as the hue, clockwise from the top', () => {
    expect(wheelColour(0, -R, R)).toBe('#ff0000'); // top: red
    expect(wheelColour(R, 0, R)).toBe('#80ff00'); // right: a quarter turn on
    expect(wheelColour(0, R, R)).toBe('#00ffff'); // bottom: cyan, the opposite of red
    expect(wheelColour(-R, 0, R)).toBe('#8000ff'); // left: three quarters round
  });
  it('fades to white at the centre and is full ink at the rim', () => {
    expect(wheelColour(0, 0, R)).toBe('#ffffff');
    expect(wheelColour(0, -R / 2, R)).toBe('#ff8080'); // halfway out, half the ink
    expect(wheelColour(0, -R * 3, R)).toBe('#ff0000'); // past the rim is the rim
  });
  it('a radius of nothing cannot divide by zero', () => {
    expect(wheelColour(3, 4, 0)).toBe('#ffffff');
  });
});

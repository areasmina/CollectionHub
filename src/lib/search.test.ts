import { describe, expect, it } from 'vitest';
import { matchRank, searchByText } from './search';

const cards = [
  { name: 'Lotus Cobra', type: 'Creature — Snake', text: 'Landfall — Whenever a land enters the battlefield under your control, add one mana of any color.' },
  { name: 'Viscera Seer', type: 'Creature — Vampire Wizard', text: 'Sacrifice a creature: Scry 1. (Look at the top card of your library. You may put that card on the bottom.)' },
  { name: 'Landfall Lord', type: 'Creature', text: '' },
  { name: 'Jötun Grunt', type: 'Creature — Giant Soldier', text: 'Cumulative upkeep' },
];

describe('card search by name and rules text', () => {
  it('matches the name first, then the Oracle text', () => {
    expect(searchByText(cards, 'landfall', (c) => c).map((c) => c.name)).toEqual(['Landfall Lord', 'Lotus Cobra']);
  });
  it('reads reminder text and the type line', () => {
    expect(matchRank('bottom library', cards[1])).toBe(1);
    expect(matchRank('vampire', cards[1])).toBe(1);
    expect(matchRank('haste', cards[1])).toBe(0);
  });
  it('ignores case and accents; empty query keeps everything', () => {
    expect(matchRank('jotun', cards[3])).toBe(2);
    expect(searchByText(cards, '  ', (c) => c)).toHaveLength(4);
  });
});

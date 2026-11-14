import { describe, expect, it } from 'vitest';
import { notOffered, type OwnedCard } from './collsearch';

const card = (name: string, ci: string[], text = ''): OwnedCard => ({ name, key: name.toLowerCase(), ci, text, type: 'Instant' });
const binder = [card('Counterspell', ['U'], 'Counter target spell.'), card('Lightning Bolt', ['R'], 'deals 3 damage'), card('Sol Ring', []), card('Cultivate', ['G']), card('Swan Song', ['U'], 'Counter target enchantment, instant, or sorcery spell.')];

describe('notOffered: why a card of yours is missing from the deck search', () => {
  it('names owned cards outside the commander colours', () => {
    expect(notOffered('bolt', binder, ['G', 'U'], new Set()).offColour).toEqual(['Lightning Bolt']);
  });
  it('names owned cards already in the deck, and never calls them off-colour', () => {
    const r = notOffered('counter', binder, ['G'], new Set(['counterspell']));
    expect(r.inDeck).toEqual(['Counterspell']);
    expect(r.offColour).toEqual(['Swan Song']);
  });
  it('names cards marked NEVER USE', () => {
    expect(notOffered('sol', binder, ['G', 'U'], new Set(), new Set(['sol ring'])).never).toEqual(['Sol Ring']);
  });
  it('a colourless card fits any commander; a card that can be added is in no list', () => {
    expect(notOffered('sol ring', binder, ['G'], new Set())).toEqual({ inDeck: [], offColour: [], never: [] });
    expect(notOffered('cultivate', binder, ['G', 'U'], new Set())).toEqual({ inDeck: [], offColour: [], never: [] });
  });
  it('no commander yet: nothing is off-colour', () => {
    expect(notOffered('bolt', binder, undefined, new Set()).offColour).toEqual([]);
  });
  it('searches rules text too, needs two letters, and caps each list', () => {
    expect(notOffered('damage', binder, ['G'], new Set()).offColour).toEqual(['Lightning Bolt']);
    expect(notOffered('s', binder, ['G'], new Set()).offColour).toEqual([]);
    expect(notOffered('counter', binder, ['G'], new Set(), new Set(), 1).offColour).toHaveLength(1);
  });
});

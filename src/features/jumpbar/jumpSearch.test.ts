import { describe, expect, it } from 'vitest';
import type { Card, Deck } from '../../lib/db';
import { searchJumpItems } from './jumpSearch';

function mkCard(name: string, type = 'Creature'): Card {
  return {
    id: `id-${name}`,
    name,
    key: name.toLowerCase(),
    type,
    text: '',
    ci: [],
    legal: true,
  };
}

describe('jumpSearch', () => {
  const decks: Deck[] = [
    { id: 1, profile: 1, name: 'Teysa Aristocrats', commander: 'Teysa Karlov', cards: [], updated: 1 },
    { id: 2, profile: 1, name: 'Krenko Goblins', commander: 'Krenko, Mob Boss', cards: [], updated: 1 },
  ];
  const cards: Card[] = [
    mkCard('Sol Ring', 'Artifact'),
    mkCard('Swords to Plowshares', 'Instant'),
  ];
  const tags = [
    { slug: 'ramp', name: 'Ramp', count: 420 },
    { slug: 'aristocrats', name: 'Aristocrats', count: 150 },
  ];

  it('returns quick views and decks when query is empty', () => {
    const items = searchJumpItems('', { decks, cards, tags });
    expect(items.some((i) => i.badge === 'VIEW' && i.title === 'Guided Deckbuilder')).toBe(true);
    expect(items.some((i) => i.badge === 'DECK' && i.title === 'Teysa Aristocrats')).toBe(true);
    expect(items.some((i) => i.badge === 'CARD')).toBe(false);
  });

  it('ranks matching decks, owned cards, and Scryfall tags when querying', () => {
    const mine = new Map([['sol ring', 2]]);
    const items = searchJumpItems('sol', { decks, cards, tags, mine });
    expect(items[0].badge).toBe('CARD');
    expect(items[0].title).toBe('Sol Ring');
    expect(items[0].subtitle).toContain('2 owned');

    const tagItems = searchJumpItems('aristo', { decks, cards, tags });
    expect(tagItems.some((i) => i.badge === 'DECK' && i.title === 'Teysa Aristocrats')).toBe(true);
    expect(tagItems.some((i) => i.badge === 'TAG' && i.title === 'Aristocrats')).toBe(true);
  });
});

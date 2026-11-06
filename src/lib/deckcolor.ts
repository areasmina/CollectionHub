import type { Deck } from './db';

/** Deck colours: bright inks that read on the dark grid and stay apart from red (actions) and yellow (money). */
export const DECK_COLOURS: [string, string][] = [
  ['#18c5d8', 'Cyan'],
  ['#e0368f', 'Magenta'],
  ['#8fd14f', 'Lime'],
  ['#ff8a2a', 'Orange'],
  ['#9b7bff', 'Violet'],
  ['#3fd0a8', 'Teal'],
  ['#ff6f91', 'Pink'],
  ['#5b9dff', 'Blue'],
];

/** A deck's colour: the one picked for it, else a steady default from its id (no two neighbours alike). */
export function deckColour(d: Pick<Deck, 'id' | 'color'>): string {
  return d.color ?? DECK_COLOURS[((d.id ?? 1) - 1 + DECK_COLOURS.length) % DECK_COLOURS.length][0];
}

/** Card key → colours of the active decks it's in (first = the deck it glows for). */
export function colourByCard(decks: Pick<Deck, 'id' | 'color' | 'cards' | 'inactive'>[], key: (name: string) => string): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const d of decks.filter((x) => !x.inactive)) {
    const c = deckColour(d);
    for (const card of d.cards) {
      const k = key(card.name);
      const have = out.get(k) ?? [];
      if (!have.includes(c)) out.set(k, [...have, c]);
    }
  }
  return out;
}

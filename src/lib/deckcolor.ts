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

/**
 * The colour wheel (Guillermo, Nov 15: "a rainbow circle we can click and choose colour from").
 * A point on the wheel, given as an offset from its centre in pixels and the wheel's radius, becomes a colour the same
 * way the wheel is drawn: the angle (clockwise from the top) is the hue, and the distance from the centre is how much
 * of it there is, so the middle is white and the rim is the full ink. Anything past the rim is clamped to the rim.
 */
export function wheelColour(dx: number, dy: number, radius: number): string {
  const hue = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
  const sat = radius > 0 ? Math.min(1, Math.hypot(dx, dy) / radius) : 0;
  return hsvHex(hue, sat, 1);
}

/** Hue (0–360), saturation and value (0–1) as a #rrggbb string. */
export function hsvHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    const x = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(x * 255).toString(16).padStart(2, '0');
  };
  return `#${f(5)}${f(3)}${f(1)}`;
}

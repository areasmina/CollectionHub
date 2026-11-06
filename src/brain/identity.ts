/**
 * Colour identity, the one hard rule every suggestion path goes through (Guillermo, Nov 6 2026: WILDCARD put a
 * white card in a Grixis deck). A card's identity is Scryfall's `color_identity`, which already counts hybrid
 * symbols, colour indicators, mana symbols in rules text and both faces.
 *
 * - `inIdentity`: every colour of the card is in the commander's (or the partner pair's) identity.
 * - `identityGate`: a name check for candidate lists. A card whose identity is unknown is refused: a suggestion we
 *   can't verify is never offered.
 * - `offIdentity`: cards known to be outside (unknown ones aren't flagged), for saved swaps, pins and decks.
 */
export const inIdentity = (ci: readonly string[], identity: readonly string[]) => ci.every((x) => identity.includes(x));

export function identityGate(identity: readonly string[], ciOf: (name: string) => readonly string[] | undefined) {
  return (name: string) => {
    const ci = ciOf(name);
    return ci !== undefined && inIdentity(ci, identity);
  };
}

export function offIdentity(names: string[], identity: readonly string[], ciOf: (name: string) => readonly string[] | undefined) {
  return names.filter((n) => {
    const ci = ciOf(n);
    return ci !== undefined && !inIdentity(ci, identity);
  });
}

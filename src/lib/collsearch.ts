import { searchByText, type Searchable } from './search';

/** A card you own, as the deck search needs it. `key` is the normalised name. */
export type OwnedCard = Searchable & { key: string; ci?: readonly string[] };

export type NotOffered = { inDeck: string[]; offColour: string[]; never: string[] };

/**
 * Searching your own cards for a deck: the cards of yours that match the search but can't be offered, and why.
 * The deck search only lists cards you can add (owned, in the commander's colours, not already in the deck, not
 * marked NEVER USE). Without this a card you know you own would simply be missing from the results, with no reason.
 * Verified facts only: colour identity and deck contents; nothing here is a recommendation. At most `max` names each.
 */
export function notOffered(q: string, binder: readonly OwnedCard[], identity: readonly string[] | undefined, inDeck: ReadonlySet<string>, never: ReadonlySet<string> = new Set(), max = 3): NotOffered {
  const out: NotOffered = { inDeck: [], offColour: [], never: [] };
  if (q.trim().length < 2) return out;
  for (const c of searchByText([...binder], q, (x) => x)) {
    const to = inDeck.has(c.key) ? out.inDeck : never.has(c.key) ? out.never : identity && !(c.ci ?? []).every((x) => identity.includes(x)) ? out.offColour : null;
    if (to && to.length < max) to.push(c.name);
  }
  return out;
}

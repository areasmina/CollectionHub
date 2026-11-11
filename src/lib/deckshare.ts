import { FREE_BASICS } from './compare';
import { norm } from './names';
import type { DeckCard } from './db';

/**
 * Each owned copy counts for one deck only. Decks are filled oldest first (lowest id, else list order): the first deck
 * that wants a card takes the copies you own, and a later deck that shares it finds them gone and shows the card missing.
 * Quantities count (a deck with 4 of a card needs 4 copies). Basic lands are always owned.
 */
export interface DeckShare {
  total: number;
  owned: number;
  missing: number;
  pct: number;
}

export function deckShares(decks: { id?: number; cards: DeckCard[] }[], mine: Map<string, number>): DeckShare[] {
  const left = new Map(mine);
  const out: DeckShare[] = new Array(decks.length);
  const order = decks.map((d, i) => i).sort((a, b) => (decks[a].id ?? Infinity) - (decks[b].id ?? Infinity) || a - b);
  for (const i of order) {
    let total = 0;
    let owned = 0;
    // A deck may list the same card on two lines (foil + non-foil): add them up before taking copies.
    const want = new Map<string, number>();
    for (const c of decks[i].cards) {
      const k = norm(c.name);
      want.set(k, (want.get(k) ?? 0) + c.qty);
    }
    for (const [k, qty] of want) {
      total += qty;
      if (FREE_BASICS.has(k)) {
        owned += qty;
        continue;
      }
      const take = Math.min(qty, left.get(k) ?? 0);
      owned += take;
      if (take > 0) left.set(k, (left.get(k) ?? 0) - take);
    }
    const missing = total - owned;
    out[i] = { total, owned, missing, pct: total ? Math.round((100 * owned) / total) : 0 };
  }
  return out;
}

/** One deck's share, within all the decks it is filled alongside (the same answer the list shows). */
export function deckShareOf(decks: { id?: number; cards: DeckCard[] }[], id: number | undefined, mine: Map<string, number>): DeckShare {
  const i = decks.findIndex((d) => d.id === id);
  return i < 0 ? { total: 0, owned: 0, missing: 0, pct: 0 } : deckShares(decks, mine)[i];
}

import { BASICS } from './compare';
import type { DeckCard } from './db';
import { norm } from './names';

export interface Shortfall {
  name: string;
  own: number;
  need: number; // copies all the decks use together
  short: number; // need - own
  decks: string[];
}

/**
 * Decks are virtual lists that may share cards. A card is short when the decks together use more copies than the
 * binder holds. Only cards you own at least once are listed; cards you don't own at all are "missing" elsewhere.
 */
export function shortfalls(decks: { name: string; cards: DeckCard[]; inactive?: boolean }[], owned: Map<string, number>): Shortfall[] {
  const use = new Map<string, { name: string; need: number; decks: string[] }>();
  // Decks with their light off aren't being played: their cards don't take copies.
  for (const d of decks.filter((x) => !x.inactive))
    for (const c of d.cards) {
      const k = norm(c.name);
      if (BASICS.has(k)) continue;
      const u = use.get(k) ?? { name: c.name, need: 0, decks: [] };
      u.need += c.qty;
      if (!u.decks.includes(d.name)) u.decks.push(d.name);
      use.set(k, u);
    }
  const out: Shortfall[] = [];
  for (const [k, u] of use) {
    const own = owned.get(k) ?? 0;
    if (own > 0 && u.need > own) out.push({ ...u, own, short: u.need - own });
  }
  return out.sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
}

/** Active decks using each card (key = norm(name)), for "in 2 decks" marks in the binder. */
export function inUse(decks: { name: string; cards: DeckCard[]; inactive?: boolean }[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const d of decks.filter((x) => !x.inactive))
    for (const c of d.cards) {
      const k = norm(c.name);
      if (!out.get(k)?.includes(d.name)) out.set(k, [...(out.get(k) ?? []), d.name]);
    }
  return out;
}

export const shortText = (s: Shortfall) => `You'll need ${s.short} more ${s.short === 1 ? 'copy' : 'copies'} of ${s.name} to have it in all decks`;

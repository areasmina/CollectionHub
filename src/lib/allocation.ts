import { BASICS } from './compare';
import type { DeckCard } from './db';
import { norm } from './names';

/**
 * Physical copy allocation, optional per deck (Guillermo, Nov 6 2026: shared stays the default).
 *
 * - shared (default): the deck is a virtual list. It may use any copy you own, exactly as before; `copies.ts`
 *   (`shortfalls`, `inUse`) keeps its meaning and is not changed by this module.
 * - reserved: the deck holds real copies. Reserved decks are served first, oldest deck first (lowest id, else list
 *   order), so a copy never moves between decks on its own. A copy held by one reserved deck is never available to
 *   another reserved deck, and suggestions rank free copies first.
 *
 * Inactive decks (light off) hold nothing. Basic lands are never counted.
 */
export type AllocPolicy = 'shared' | 'reserved';

export interface AllocDeck {
  id?: number;
  name: string;
  cards: DeckCard[];
  inactive?: boolean;
  alloc?: AllocPolicy;
}

export interface CardAlloc {
  name: string;
  own: number;
  /** Copies held by reserved decks, in the order they were served. */
  held: { deck: string; qty: number }[];
  /** Copies no reserved deck holds (shared decks may still use these, and every other copy). */
  free: number;
  /** Shared decks that use the card (they don't hold copies). */
  sharedBy: string[];
}

export interface ReservedShort {
  name: string;
  deck: string; // the reserved deck that couldn't get all its copies
  need: number;
  got: number;
  heldBy: string[]; // reserved decks that were served first
}

export interface Allocation {
  cards: Map<string, CardAlloc>; // key = norm(name)
  short: ReservedShort[];
}

const policy = (d: AllocDeck): AllocPolicy => d.alloc ?? 'shared';

export function allocate(decks: AllocDeck[], owned: Map<string, number>): Allocation {
  const active = decks.map((d, i) => ({ d, i })).filter(({ d }) => !d.inactive);
  const order = (a: { d: AllocDeck; i: number }, b: { d: AllocDeck; i: number }) => (a.d.id ?? Infinity) - (b.d.id ?? Infinity) || a.i - b.i;
  const cards = new Map<string, CardAlloc>();
  const entry = (name: string) => {
    const k = norm(name);
    let c = cards.get(k);
    if (!c) cards.set(k, (c = { name, own: owned.get(k) ?? 0, held: [], free: owned.get(k) ?? 0, sharedBy: [] }));
    return c;
  };
  const short: ReservedShort[] = [];
  for (const { d } of active.filter(({ d }) => policy(d) === 'reserved').sort(order)) {
    // A deck may list the same card on two lines (foil + non-foil): add them up first.
    const want = new Map<string, { name: string; qty: number }>();
    for (const c of d.cards) {
      const k = norm(c.name);
      if (BASICS.has(k)) continue;
      want.set(k, { name: c.name, qty: (want.get(k)?.qty ?? 0) + c.qty });
    }
    for (const { name, qty } of want.values()) {
      const c = entry(name);
      const got = Math.min(qty, c.free);
      if (got > 0) {
        c.held.push({ deck: d.name, qty: got });
        c.free -= got;
      }
      if (got < qty && c.own > 0) short.push({ name: c.name, deck: d.name, need: qty, got, heldBy: c.held.filter((h) => h.deck !== d.name).map((h) => h.deck) });
    }
  }
  for (const { d } of active.filter(({ d }) => policy(d) === 'shared'))
    for (const c of d.cards) {
      if (BASICS.has(norm(c.name))) continue;
      const e = entry(c.name);
      if (!e.sharedBy.includes(d.name)) e.sharedBy.push(d.name);
    }
  return { cards, short };
}

/**
 * How many copies of a card a deck can count on, and who holds the rest. A shared deck can use every copy you own
 * (as always), but `free` still tells suggestions which copies nobody has reserved.
 */
export function availability(a: Allocation, name: string, forDeck: AllocDeck | undefined, owned: Map<string, number>) {
  const k = norm(name);
  const c = a.cards.get(k);
  const own = owned.get(k) ?? 0;
  const free = c ? c.free : own;
  const mine = c?.held.find((h) => h.deck === forDeck?.name)?.qty ?? 0;
  const heldBy = (c?.held ?? []).filter((h) => h.deck !== forDeck?.name).map((h) => h.deck);
  const usable = forDeck && policy(forDeck) === 'reserved' ? mine + free : own;
  return { own, free, usable, heldBy };
}

/** One line for a suggestion: "free", "in Atraxa", "in Atraxa, Kinnan". */
export function availabilityNote(v: { free: number; heldBy: string[] }) {
  return v.free > 0 ? 'free' : v.heldBy.length ? `in ${v.heldBy.join(', ')}` : '';
}

export const reservedShortText = (s: ReservedShort) =>
  `${s.deck} is short ${s.need - s.got} ${s.name}${s.heldBy.length ? `: ${s.heldBy.join(', ')} ${s.heldBy.length === 1 ? 'holds' : 'hold'} yours` : ''}`;

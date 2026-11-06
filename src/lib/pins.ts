import { norm } from './names';
import { mainType } from './subs';

/** Per commander (every bracket, budget and tag): cards that always go in, and cards never to use. */
export interface Pins {
  in: string[];
  out: string[];
}
export type PinSide = 'in' | 'out';

export const noPins = (): Pins => ({ in: [], out: [] });

/** Pins a card on one side (taking it off the other); pinning it again on the same side un-pins it. */
export function togglePin(p: Pins, name: string, side: PinSide): Pins {
  const k = norm(name);
  const other: PinSide = side === 'in' ? 'out' : 'in';
  const on = p[side].some((n) => norm(n) === k);
  return {
    [side]: on ? p[side].filter((n) => norm(n) !== k) : [...p[side], name],
    [other]: p[other].filter((n) => norm(n) !== k),
  } as unknown as Pins;
}

export const pinOf = (p: Pins, name: string): PinSide | undefined =>
  p.in.some((n) => norm(n) === norm(name)) ? 'in' : p.out.some((n) => norm(n) === norm(name)) ? 'out' : undefined;

export interface SlotIn {
  name: string; // EDHREC's card in this slot
  qty: number;
  type?: string;
  incl?: number; // share of decks that play it (lower = first to make room for a pin)
}
/** What fills a slot: `why` says what changed it (your swap, a never-use pin, an always-in pin). */
export interface Slot {
  name: string;
  why?: 'swap' | 'never' | 'pin' | 'auto'; // auto = OWNED ONLY's stand-in for a card you don't own
}

const BASIC = /^(Plains|Island|Swamp|Mountain|Forest|Wastes)$|^Snow-Covered /;

/**
 * The deck after your swaps and pins, slot by slot (key = EDHREC's card):
 * 1. your swap for a slot wins;
 * 2. a card you never use is replaced by the best owned fit (`pick`, given the names already used);
 *    with none it stays, marked, so the slot isn't left empty;
 * 3. each always-in card not yet in the deck takes the slot of the least played card of the same kind
 *    (lands for lands, else same card type first), never the commander, another pin, or a basic land.
 */
export function arrange(
  slots: SlotIn[],
  swaps: Record<string, string>,
  pins: Pins,
  pick: (slot: string, used: Set<string>) => string | undefined,
  { commander, typeOf: typeHint }: { commander?: string; typeOf?: (name: string) => string | undefined } = {},
): Map<string, Slot> {
  const typeOf = (name: string) => typeHint?.(name) ?? slots.find((s) => norm(s.name) === norm(name))?.type;
  const out = new Map<string, Slot>();
  const never = new Set(pins.out.map(norm));
  const used = new Set<string>();
  for (const s of slots) {
    const sw = swaps[s.name];
    out.set(s.name, sw ? { name: sw, why: 'swap' } : { name: s.name });
    used.add(norm(sw ?? s.name));
  }
  for (const s of slots) {
    const cur = out.get(s.name)!;
    if (!never.has(norm(cur.name)) || (commander && norm(s.name) === norm(commander))) continue;
    const r = pick(s.name, used);
    if (!r) {
      out.set(s.name, { ...cur, why: 'never' });
      continue;
    }
    used.delete(norm(cur.name));
    used.add(norm(r));
    out.set(s.name, { name: r, why: 'never' });
  }
  const pinned = new Set(pins.in.map(norm));
  const info = new Map(slots.map((s) => [s.name, s]));
  for (const p of pins.in) {
    if (used.has(norm(p))) continue;
    const land = mainType(typeOf(p)) === 'Land';
    const free = [...out.entries()].filter(([orig, sl]) => {
      const s = info.get(orig)!;
      return s.qty === 1 && !BASIC.test(sl.name) && !pinned.has(norm(sl.name)) && sl.why !== 'pin' && !(commander && norm(orig) === norm(commander)) && (mainType(s.type) === 'Land') === land;
    });
    if (!free.length) continue;
    const want = mainType(typeOf(p));
    free.sort(([a], [b]) => {
      const sa = info.get(a)!;
      const sb = info.get(b)!;
      return Number(mainType(sb.type) === want) - Number(mainType(sa.type) === want) || (sa.incl ?? 1) - (sb.incl ?? 1) || a.localeCompare(b);
    });
    const [orig, sl] = free[0];
    used.delete(norm(sl.name));
    used.add(norm(p));
    out.set(orig, { name: p, why: 'pin' });
  }
  return out;
}

const fold = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, '');
/** Card search for the swap window: matches anywhere in the name, accents and case ignored, starts-with first. */
export function searchCards<T>(cards: T[], q: string, n = 6, nameOf: (c: T) => string = (c) => (c as { name: string }).name): T[] {
  const f = fold(q);
  if (f.length < 2) return [];
  return cards
    .map((c) => ({ c, i: fold(nameOf(c)).indexOf(f) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => Number(a.i !== 0) - Number(b.i !== 0) || nameOf(a.c).localeCompare(nameOf(b.c)))
    .slice(0, n)
    .map((x) => x.c);
}

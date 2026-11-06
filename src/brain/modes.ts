/**
 * Deck modes (Guillermo's "Send it", Nov 6 2026; definitions from the allocation plan):
 * - OWNED ONLY: the deck uses owned cards only. A missing slot takes the best owned stand-in; with none it stays
 *   EDHREC's card, marked as still missing (the slot is never left empty).
 * - PREFER OWNED (default): today's deck. In suggestion lists an owned card wins over a missing one unless the
 *   missing one is clearly better (`PREFER_MARGIN`).
 * - BUY CAP $N: a per-card price ceiling on buy suggestions only. It never changes the 99 or any score; cards over
 *   the cap stay listed and marked, owned cards are never filtered, and the full missing total is still shown.
 * Pure functions only: the views call these, so the rules live in one place with tests.
 */
export type OwnMode = 'owned' | 'prefer';
export const OWN_MODES: [OwnMode, string][] = [
  ['owned', 'OWNED ONLY'],
  ['prefer', 'PREFER OWNED'],
];
/** CA$ per card; 0 = no cap. */
export const BUY_CAPS: [string, string][] = [
  ['0', 'ANY'],
  ['5', '$5'],
  ['10', '$10'],
  ['25', '$25'],
];

/** How far (in score units, 0–1 scale) a missing card must beat an owned one to rank above it. */
export const PREFER_MARGIN = 0.15;

export interface SlotNow {
  /** EDHREC's card in this slot */
  slot: string;
  /** what fills it now */
  name: string;
  qty: number;
}

/** The coverage line under The 99: how much of the deck comes from your binder, as stand-ins, or still to buy. */
export function coverage(slots: SlotNow[], owns: (name: string) => boolean) {
  const c = { binder: 0, standins: 0, buy: 0, total: 0 };
  for (const s of slots) {
    c.total += s.qty;
    if (!owns(s.name)) c.buy += s.qty;
    else if (s.name !== s.slot) c.standins += s.qty;
    else c.binder += s.qty;
  }
  return c;
}

export function coverageText(c: ReturnType<typeof coverage>) {
  const parts = [`${c.binder} from your binder`];
  if (c.standins) parts.push(`${c.standins} stand-in${c.standins === 1 ? '' : 's'}`);
  parts.push(c.buy ? `${c.buy} to buy` : 'nothing to buy');
  return parts.join(' · ');
}

/**
 * OWNED ONLY: every slot still holding a card you don't own gets the best owned stand-in (`pick`, given the names
 * already used). Slots you swapped or pinned keep your choice. Returns the slots that changed (slot → stand-in).
 */
export function ownedOnly(slots: SlotNow[], owns: (name: string) => boolean, pick: (slot: string, used: Set<string>) => string | undefined, key: (n: string) => string = (n) => n.toLowerCase()) {
  const used = new Set(slots.map((s) => key(s.name)));
  const out = new Map<string, string>();
  for (const s of slots) {
    if (owns(s.name) || s.name !== s.slot) continue;
    const r = pick(s.slot, used);
    if (!r) continue;
    used.delete(key(s.name));
    used.add(key(r));
    out.set(s.slot, r);
  }
  return out;
}

/** PREFER OWNED ordering for suggestion lists: owned cards get `PREFER_MARGIN` on top of their score. Stable. */
export function preferOwned<T>(items: T[], mode: OwnMode, f: (t: T) => { owned: boolean; score: number }): T[] {
  if (mode === 'owned') return items.filter((t) => f(t).owned);
  const s = (t: T) => f(t).score + (f(t).owned ? PREFER_MARGIN : 0);
  return items
    .map((t, i) => ({ t, i, v: s(t) }))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .map((x) => x.t);
}

/** BUY CAP: is this buy suggestion over the cap? Unknown prices are never over (they show "price unknown"). */
export const overCap = (cad: number | undefined, cap: number) => cap > 0 && cad !== undefined && cad > cap;

/** The buy suggestion to offer for a slot: the first in-cap card, else the first card (marked over cap by the view). */
export function firstInCap<T>(cands: T[], cap: number, price: (t: T) => number | undefined): T | undefined {
  return cands.find((t) => !overCap(price(t), cap)) ?? cands[0];
}

/** TO BUY grouped by how much EDHREC plays each card (owner's yes, Nov 6), cheapest first inside a group. */
export const BUY_BANDS: [number, string][] = [
  [0.5, 'IN HALF THE DECKS OR MORE'],
  [0.25, 'IN 25–50% OF DECKS'],
  [0, 'UNDER 25% · NICE TO HAVE'],
];
export function buyGroups<T>(items: T[], incl: (t: T) => number | undefined, price: (t: T) => number | undefined) {
  const groups = BUY_BANDS.map(([min, label]) => ({ min, label, items: [] as T[], total: 0 }));
  for (const t of items) {
    const g = groups.find((x) => (incl(t) ?? 0) >= x.min)!;
    g.items.push(t);
    g.total += price(t) ?? 0;
  }
  for (const g of groups) g.items.sort((a, b) => (price(a) ?? Infinity) - (price(b) ?? Infinity));
  return groups.filter((g) => g.items.length);
}

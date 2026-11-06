import type { Allocation } from '../lib/allocation';
import { norm } from '../lib/names';

/**
 * The "in <deck>" chip on a suggestion (design verdict, Nov 6): only when a copy is already used by another deck.
 * No "free" chip (free copies already show as filled diamonds). A reserved deck holding it reads "held by <deck>"
 * with a lock; several decks read "in Atraxa +2". `skip` = decks that count as this one (same commander).
 */
export function inUseChip(a: Allocation, name: string, skip: (deck: string) => boolean) {
  const c = a.cards.get(norm(name));
  if (!c) return undefined;
  const held = [...new Set(c.held.map((h) => h.deck))].filter((d) => !skip(d));
  const all = [...new Set([...held, ...c.sharedBy])].filter((d) => !skip(d));
  if (!all.length) return undefined;
  const first = held[0] ?? all[0];
  const more = all.length > 1 ? ` +${all.length - 1}` : '';
  return { deck: first, lock: held.length > 0, text: `${held.length ? 'held by' : 'in'} ${first}${more}` };
}

import { FREE_BASICS } from './compare';
import { norm } from './names';
import type { EdhPage } from './edhrec';

/** The Discover tile menu's lists, all read from the same EDHREC average deck the tile's % owned comes from
 *  (lib/cmdrstats statOf). Display only: nothing here changes how ownership is counted. */
export type ListCard = { name: string; qty: number };

/** The average deck as one list: the commander first, then EDHREC's cards, each name once (the same cards statOf counts). */
export function averageDeckCards(page: EdhPage, commander: string): ListCard[] {
  const byName = new Map<string, ListCard>([[norm(commander), { name: commander, qty: 1 }]]);
  for (const c of page.lists.flatMap((l) => l.cards)) if (!byName.has(norm(c.name))) byName.set(norm(c.name), { name: c.name, qty: c.qty ?? 1 });
  return [...byName.values()];
}

/** The copies of each card you still need: wanted minus owned, basic lands always owned (same rule as ownShare). */
export function missingCards(cards: ListCard[], mine: Map<string, number>): ListCard[] {
  const out: ListCard[] = [];
  for (const c of cards) {
    const k = norm(c.name);
    if (FREE_BASICS.has(k)) continue;
    const short = c.qty - Math.min(c.qty, mine.get(k) ?? 0);
    if (short > 0) out.push({ name: c.name, qty: short });
  }
  return out;
}

/** "1 Sol Ring" lines: the text Moxfield, Archidekt and ManaBox all import. */
export const listText = (cards: ListCard[]) => cards.map((c) => `${c.qty} ${c.name}`).join('\n');

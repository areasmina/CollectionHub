import type { EdhCard, EdhList } from './edhrec';
import { norm } from './names';

/** Card sections of an average deck, in the order they are shown (same on the commander page and the deck page). */
export const SECTION_ORDER = ['Commander', 'Planeswalkers', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Lands'] as const;

/** EDHREC's category names ("Creatures", "Mana Artifacts", "Utility Lands", "Basic Lands"…) → one of the sections above. */
export function sectionOf(header: string): string {
  const h = header.toLowerCase();
  if (/commander/.test(h)) return 'Commander';
  if (/planeswalker/.test(h)) return 'Planeswalkers';
  if (/creature/.test(h)) return 'Creatures';
  if (/instant/.test(h)) return 'Instants';
  if (/sorcer/.test(h)) return 'Sorceries';
  if (/enchantment/.test(h)) return 'Enchantments';
  if (/artifact/.test(h)) return 'Artifacts';
  if (/land/.test(h)) return 'Lands';
  return header; // battles, "Other"…: kept as they are, after the known sections
}

/** Regroup an average deck's lists into the standard sections, with the commander as its own first section.
 *  Categories that map to the same section (Basic Lands + Utility Lands) are merged; the commander is removed from
 *  wherever EDHREC listed it so it isn't counted twice. */
export function orderSections(lists: EdhList[], commander?: EdhCard): EdhList[] {
  const ck = commander ? norm(commander.name) : '';
  const by = new Map<string, EdhCard[]>();
  for (const l of lists) {
    const key = sectionOf(l.header);
    const cards = l.cards.filter((c) => !ck || norm(c.name) !== ck);
    by.set(key, [...(by.get(key) ?? []), ...cards]);
  }
  if (commander) by.set('Commander', [commander, ...(by.get('Commander') ?? [])]);
  const known = SECTION_ORDER.filter((k) => by.has(k));
  const rest = [...by.keys()].filter((k) => !(SECTION_ORDER as readonly string[]).includes(k));
  return [...known, ...rest].map((header) => ({ header, cards: by.get(header)! })).filter((l) => l.cards.length);
}

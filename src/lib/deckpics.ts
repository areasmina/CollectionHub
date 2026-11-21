import { db } from './db';
import { deckPics } from './offlinepics';
import { norm } from './names';

/** The pictures of every card in your decks (all binders), the printing you own when you own one (Phase 5B). */
export async function deckPicUrls(): Promise<string[]> {
  const decks = await db.decks.toArray();
  if (!decks.length) return [];
  const names = [...new Set(decks.flatMap((d) => [d.commander, d.partner, ...d.cards.map((c) => c.name)]).filter((n): n is string => !!n).map(norm))];
  const entries = await db.entries.toArray();
  const ownedCards = (await db.cards.bulkGet([...new Set(entries.map((e) => e.cardId))])).filter((c) => !!c);
  const owned = new Map<string, string>();
  for (const c of ownedCards) if (c.img && !owned.has(c.key)) owned.set(c.key, c.img);
  const known = new Map<string, string>();
  for (const c of await db.cards.where('key').anyOf(names.filter((k) => !owned.has(k))).toArray()) if (c.img && !known.has(c.key)) known.set(c.key, c.img);
  return deckPics(decks, owned, known, norm);
}

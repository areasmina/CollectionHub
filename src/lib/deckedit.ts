import { db, type Deck, type Entry } from './db';
import { norm } from './names';
import { noPins, togglePin, type PinSide } from './pins';

/**
 * Moves one owned copy of a card to the other finish (foil <-> non-foil), so the binder matches the deck.
 * Returns the entries to save and the ids to delete; nothing when no copy has the other finish.
 */
export function flipOneCopy(entries: Entry[], name: string, toFoil: boolean): { put: Entry[]; del: number[] } {
  const k = norm(name);
  const from = entries.find((e) => norm(e.name) === k && !!e.foil !== toFoil);
  if (!from) return { put: [], del: [] };
  const same = (e: Entry) => e.cardId === from.cardId && (e.set ?? '') === (from.set ?? '') && (e.cn ?? '') === (from.cn ?? '');
  const into = entries.find((e) => same(e) && !!e.foil === toFoil);
  const put: Entry[] = [];
  const del: number[] = [];
  if (from.qty > 1) put.push({ ...from, qty: from.qty - 1 });
  else if (from.id !== undefined) del.push(from.id);
  if (into) put.push({ ...into, qty: into.qty + 1 });
  else put.push({ ...from, id: undefined, qty: 1, foil: toFoil });
  return { put, del };
}

const saveDeck = (deck: Deck, cards: Deck['cards']) => db.decks.update(deck.id!, { cards, updated: Date.now() });

/** Deck card to foil / non-foil, and one binder copy with it when you own one. */
export async function setFoil(deck: Deck, profile: number, name: string, foil: boolean) {
  await db.transaction('rw', db.decks, db.entries, async () => {
    await saveDeck(deck, deck.cards.map((c) => (c.name === name ? { ...c, foil: foil || undefined } : c)));
    const { put, del } = flipOneCopy(await db.entries.where('profile').equals(profile).toArray(), name, foil);
    if (del.length) await db.entries.bulkDelete(del);
    if (put.length) await db.entries.bulkPut(put.map((e) => (e.id === undefined ? (({ id: _, ...r }) => r)(e) : e)) as Entry[]);
  });
}

/** Removes a card from the deck; returns an undo that puts the deck back as it was. */
export async function removeFromDeck(deck: Deck, name: string) {
  const before = deck.cards;
  await saveDeck(deck, before.filter((c) => c.name !== name));
  return () => saveDeck(deck, before);
}

export const changeQty = (deck: Deck, name: string, by: number) =>
  saveDeck(deck, deck.cards.flatMap((c) => (c.name !== name ? [c] : c.qty + by > 0 ? [{ ...c, qty: c.qty + by }] : [])));

/** Takes one copy of a card out of the binder (the finish the deck uses first); returns an undo. */
export async function removeOneFromBinder(profile: number, name: string, foil?: boolean) {
  const k = norm(name);
  const own = (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === k);
  const e = own.find((x) => !!x.foil === !!foil) ?? own[0];
  if (!e) return () => Promise.resolve();
  if (e.qty > 1) await db.entries.update(e.id!, { qty: e.qty - 1 });
  else await db.entries.delete(e.id!);
  return async () => void (await db.entries.put(e));
}

/** Puts `to` in the deck in place of `from` (same copies, no foil); returns an undo. */
export async function replaceInDeck(deck: Deck, from: string, to: string) {
  const before = deck.cards;
  const has = before.some((c) => norm(c.name) === norm(to));
  await saveDeck(deck, has ? before.filter((c) => c.name !== from) : before.map((c) => (c.name === from ? { name: to, qty: c.qty } : c)));
  return () => saveDeck(deck, before);
}

/** Pins a card for every deck of a commander (📌 always in / 💀 never use); the same side again un-pins it. */
export async function savePin(profile: number, commander: string, card: string, side: PinSide) {
  const p = (await db.profiles.get(profile))!;
  await db.profiles.update(profile, { pins: { ...(p.pins ?? {}), [commander]: togglePin(p.pins?.[commander] ?? noPins(), card, side) } });
}

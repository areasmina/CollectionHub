import { db, type Card, type Deck, type Entry } from './db';
import { norm } from './names';
import { noPins, togglePin, type PinSide } from './pins';

/** Profile ID designated for Loose / Unassigned Cards */
export const UNASSIGNED_PROFILE = 0;
export const UNASSIGNED_NAME = 'Unassigned Cards';

/** Ensures the Unassigned Cards binder profile exists in IndexedDB */
export async function ensureUnassignedProfile() {
  const p = await db.profiles.get(UNASSIGNED_PROFILE);
  if (!p) {
    await db.profiles.put({ id: UNASSIGNED_PROFILE, name: UNASSIGNED_NAME });
  }
}

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

import { saveDeckSnapshot } from './deckhistory';

const saveDeck = (deck: Deck, cards: Deck['cards'], label?: string) => {
  // Automatically capture snapshot before making modifications
  saveDeckSnapshot(deck, label);
  return db.decks.update(deck.id!, { cards, updated: Date.now() });
};

/** Collection: turns one binder copy of a card foil (or back to non-foil). Nothing is added or lost: the copy moves
 *  between the foil and non-foil rows of the same printing. Returns an undo that puts the rows back as they were. */
export async function setBinderFoil(profile: number, name: string, toFoil: boolean) {
  const before = (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === norm(name));
  await db.transaction('rw', db.entries, async () => {
    const { put, del } = flipOneCopy(before, name, toFoil);
    if (del.length) await db.entries.bulkDelete(del);
    if (put.length) await db.entries.bulkPut(put.map((e) => (e.id === undefined ? (({ id: _, ...r }) => r)(e) : e)) as Entry[]);
  });
  return async () => {
    await db.transaction('rw', db.entries, async () => {
      const now = (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === norm(name));
      await db.entries.bulkDelete(now.map((e) => e.id!));
      await db.entries.bulkPut(before);
    });
  };
}

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
  let p = await db.profiles.get(profile);
  if (!p) {
    p = { id: profile, name: 'Binder 1' };
    await db.profiles.put(p);
  }
  await db.profiles.update(profile, { pins: { ...(p.pins ?? {}), [commander]: togglePin(p.pins?.[commander] ?? noPins(), card, side) } });
}

/** Deck light on / off (active decks mark their cards as in use in the binder). */
export const setActive = (deck: Deck, on: boolean) => db.decks.update(deck.id!, { inactive: on ? undefined : true });

export const setCommander = (deck: Deck, name: string) => db.decks.update(deck.id!, { commander: name, updated: Date.now() });

/** Adds one copy of a card to a deck; returns an undo. */
export async function addToDeck(deck: Deck, name: string) {
  const before = deck.cards;
  const has = before.find((c) => norm(c.name) === norm(name));
  await saveDeck(deck, has ? before.map((c) => (c === has ? { ...c, qty: c.qty + 1 } : c)) : [...before, { name, qty: 1 }]);
  return () => saveDeck(deck, before);
}

/** Your copies of a card switch to another printing (its artwork): every binder row of that name moves to it,
 *  keeping quantities and finishes. Returns an undo. */
export async function setPrinting(profile: number, name: string, card: Card, set: string, cn: string) {
  const k = norm(name);
  const rows = (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === k);
  await db.cards.put(card);
  await db.entries.bulkPut(rows.map((e) => ({ ...e, cardId: card.id, set, cn })));
  return async () => void (await db.entries.bulkPut(rows));
}

/** Moves one or all copies of a card to another binder (profile). Returns an undo. */
export async function moveCardToBinder(fromProfile: number, toProfile: number, name: string, foil?: boolean, all = false) {
  const k = norm(name);
  const own = (await db.entries.where('profile').equals(fromProfile).toArray()).filter((e) => norm(e.name) === k);
  const target = own.find((x) => foil === undefined || !!x.foil === !!foil) ?? own[0];
  if (!target) return () => Promise.resolve();

  const moveQty = all ? target.qty : 1;
  const beforeSource = { ...target };

  // Check destination binder
  const destOwn = (await db.entries.where('profile').equals(toProfile).toArray()).filter((e) => norm(e.name) === k);
  const destMatch = destOwn.find((x) => x.cardId === target.cardId && !!x.foil === !!target.foil && (x.list ?? '') === (target.list ?? ''));
  const beforeDest = destMatch ? { ...destMatch } : null;

  await db.transaction('rw', db.entries, async () => {
    if (target.qty <= moveQty) {
      await db.entries.delete(target.id!);
    } else {
      await db.entries.update(target.id!, { qty: target.qty - moveQty });
    }

    if (destMatch) {
      await db.entries.update(destMatch.id!, { qty: destMatch.qty + moveQty });
    } else {
      await db.entries.add({
        profile: toProfile,
        cardId: target.cardId,
        name: target.name,
        qty: moveQty,
        set: target.set,
        cn: target.cn,
        foil: target.foil,
        added: Date.now(),
        list: target.list,
      });
    }
  });

  return async () => {
    await db.transaction('rw', db.entries, async () => {
      // restore source
      await db.entries.put(beforeSource);
      // restore dest
      if (beforeDest) {
        await db.entries.put(beforeDest);
      } else if (destMatch) {
        await db.entries.delete(destMatch.id!);
      } else {
        const addedEntry = (await db.entries.where('profile').equals(toProfile).toArray())
          .find((x) => x.cardId === target.cardId && !!x.foil === !!target.foil && (x.list ?? '') === (target.list ?? ''));
        if (addedEntry) await db.entries.delete(addedEntry.id!);
      }
    });
  };
}

/** Assigns one or all copies of a card in a binder to a sub-list (or null/'none' for unlisted). Returns an undo. */
export async function assignCardToList(profile: number, name: string, listName: string | null, foil?: boolean) {
  const k = norm(name);
  const own = (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === k);
  const target = own.find((x) => foil === undefined || !!x.foil === !!foil) ?? own[0];
  if (!target) return () => Promise.resolve();

  const prevList = target.list ?? null;
  const targetList = listName ? listName.trim() : undefined;
  if ((target.list ?? undefined) === targetList) return () => Promise.resolve();

  // Check if an entry with target list already exists
  const existing = own.find((x) => x.cardId === target.cardId && !!x.foil === !!target.foil && (x.list ?? undefined) === targetList && x.id !== target.id);

  const beforeTarget = { ...target };
  const beforeExisting = existing ? { ...existing } : null;

  await db.transaction('rw', db.entries, async () => {
    if (existing) {
      await db.entries.update(existing.id!, { qty: existing.qty + target.qty });
      await db.entries.delete(target.id!);
    } else {
      await db.entries.update(target.id!, { list: targetList });
    }
  });

  return async () => {
    await db.transaction('rw', db.entries, async () => {
      await db.entries.put(beforeTarget);
      if (beforeExisting) {
        await db.entries.put(beforeExisting);
      }
    });
  };
}

/** Adds or removes a custom list name in the profile. */
export async function manageBinderLists(profile: number, action: 'add' | 'remove', listName: string) {
  const clean = listName.trim();
  if (!clean) return;
  const p = await db.profiles.get(profile);
  if (!p) return;
  const current = p.lists ?? [];
  let updated: string[];
  if (action === 'add') {
    if (current.includes(clean)) return;
    updated = [...current, clean];
  } else {
    updated = current.filter((l) => l !== clean);
    // When removing a list, reset cards on that list to unassigned list
    const entries = await db.entries.where('profile').equals(profile).toArray();
    const toReset = entries.filter((e) => e.list === clean);
    if (toReset.length) {
      await db.transaction('rw', db.entries, async () => {
        for (const e of toReset) {
          await db.entries.update(e.id!, { list: undefined });
        }
      });
    }
  }
  await db.profiles.update(profile, { lists: updated });
}
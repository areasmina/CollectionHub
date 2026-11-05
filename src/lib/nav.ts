import { db } from './db';

/** "Open this deck" from any screen: the app switches to Decks and the Decks page opens it. */
let pending: string | null = null; // deck name (unique within a binder)
const EVENT = 'ch:opendeck';

export function openDeck(name: string) {
  pending = name;
  dispatchEvent(new Event(EVENT));
}
/** The deck waiting to be opened, if any (taken once). */
export const takeDeck = (exists: (name: string) => boolean) => {
  if (!pending || !exists(pending)) return null;
  const p = pending;
  pending = null;
  return p;
};
export const onOpenDeck = (f: () => void) => (addEventListener(EVENT, f), () => removeEventListener(EVENT, f));

/** "Go import cards": the app switches to Collection, where the import box opens for an empty binder. */
const COLL = 'ch:opencollection';
export const openCollection = () => dispatchEvent(new Event(COLL));
export const onOpenCollection = (f: () => void) => (addEventListener(COLL, f), () => removeEventListener(COLL, f));

/** "All my decks": the app opens the saved-decks page (list + add a deck). */
const LIST = 'ch:opendecklist';
export const openDeckList = () => dispatchEvent(new Event(LIST));
export const onOpenDeckList = (f: () => void) => (addEventListener(LIST, f), () => removeEventListener(LIST, f));

/** A name not already used by another deck in this binder ("Name (copy)", "Name (copy 2)"…). */
export async function freeDeckName(profile: number, want: string, except?: number) {
  const taken = new Set((await db.decks.where('profile').equals(profile).toArray()).filter((d) => d.id !== except).map((d) => d.name.toLowerCase()));
  if (!taken.has(want.toLowerCase())) return want;
  for (let i = 2; ; i++) if (!taken.has(`${want} ${i}`.toLowerCase())) return `${want} ${i}`;
}

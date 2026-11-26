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

/** Jump straight to a Discover sub-tab ('commanders' | 'tags' | 'guided') from anywhere (e.g. Ctrl/Cmd+K). */
export type DiscoverSubTab = 'commanders' | 'tags' | 'guided';
const DISCOVER_SUB = 'ch:discoversub';
let pendingDiscoverSub: DiscoverSubTab | null = null;
export function openDiscoverSub(sub: DiscoverSubTab) {
  pendingDiscoverSub = sub;
  dispatchEvent(new CustomEvent(DISCOVER_SUB, { detail: sub }));
}
export function takeDiscoverSub(): DiscoverSubTab | null {
  const s = pendingDiscoverSub;
  pendingDiscoverSub = null;
  return s;
}
export const onDiscoverSub = (f: (sub: DiscoverSubTab) => void) => {
  const h = (e: Event) => f((e as CustomEvent<DiscoverSubTab>).detail);
  addEventListener(DISCOVER_SUB, h);
  return () => removeEventListener(DISCOVER_SUB, h);
};

/** Deep-link a specific tag in the Tag Navigator (e.g. from Ctrl/Cmd+K). */
const OPEN_TAG = 'ch:opentag';
let pendingTagQuery: string | null = null;
export function openTagInNavigator(tagLabelOrId: string) {
  pendingTagQuery = tagLabelOrId;
  dispatchEvent(new CustomEvent(OPEN_TAG, { detail: tagLabelOrId }));
}
export function takePendingTag(): string | null {
  const t = pendingTagQuery;
  pendingTagQuery = null;
  return t;
}
export const onPendingTag = (f: (tag: string) => void) => {
  const h = (e: Event) => f((e as CustomEvent<string>).detail);
  addEventListener(OPEN_TAG, h);
  return () => removeEventListener(OPEN_TAG, h);
};

/** Hand off seed cards from Tag Builder directly into Guided Builder. */
const OPEN_SEEDS = 'ch:openguidedseeds';
let pendingSeeds: string[] | null = null;
export function openGuidedWithSeeds(cardNames: string[]) {
  pendingSeeds = cardNames;
  dispatchEvent(new CustomEvent(OPEN_SEEDS, { detail: cardNames }));
}
export function takePendingSeeds(): string[] | null {
  const s = pendingSeeds;
  pendingSeeds = null;
  return s;
}
export const onPendingSeeds = (f: (names: string[]) => void) => {
  const h = (e: Event) => f((e as CustomEvent<string[]>).detail);
  addEventListener(OPEN_SEEDS, h);
  return () => removeEventListener(OPEN_SEEDS, h);
};

/** A name not already used by another deck in this binder ("Name (copy)", "Name (copy 2)"…). */
export async function freeDeckName(profile: number, want: string, except?: number) {
  const taken = new Set((await db.decks.where('profile').equals(profile).toArray()).filter((d) => d.id !== except).map((d) => d.name.toLowerCase()));
  if (!taken.has(want.toLowerCase())) return want;
  for (let i = 2; ; i++) if (!taken.has(`${want} ${i}`.toLowerCase())) return `${want} ${i}`;
}

/** A screen with unsaved work (the forging zone) can hold the app before it leaves: true = go on. */
let guard: (() => Promise<boolean>) | null = null;
export const setLeaveGuard = (g: (() => Promise<boolean>) | null) => void (guard = g);
export const canLeave = () => (guard ? guard() : Promise.resolve(true));

/** The pill menu's back arrow: the screen that has somewhere to go back to sets it (null = no arrow). */
let back: (() => void) | null = null;
const BACK = 'ch:back';
export const setBack = (f: (() => void) | null) => ((back = f), dispatchEvent(new Event(BACK)));
export const getBack = () => back;
export const onBackChange = (f: () => void) => (addEventListener(BACK, f), () => removeEventListener(BACK, f));

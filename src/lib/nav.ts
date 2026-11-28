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

/** Journey step 4 (Nov 28): a commander's page hands its commander to Guided (START), already picked. */
const OPEN_GUIDED_CMDR = 'ch:openguidedcmdr';
let pendingGuidedCommander: string | null = null;
export function openGuidedWithCommander(name: string) {
  pendingGuidedCommander = name;
  dispatchEvent(new CustomEvent(OPEN_GUIDED_CMDR, { detail: name }));
  openDiscoverSub('guided');
}
/** Read without clearing (a first render may run twice in development); `takeGuidedCommander` clears it. */
export const peekGuidedCommander = () => pendingGuidedCommander;
export function takeGuidedCommander(): string | null {
  const n = pendingGuidedCommander;
  pendingGuidedCommander = null;
  return n;
}
export const onGuidedCommander = (f: (name: string) => void) => {
  const h = (e: Event) => f((e as CustomEvent<string>).detail);
  addEventListener(OPEN_GUIDED_CMDR, h);
  return () => removeEventListener(OPEN_GUIDED_CMDR, h);
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
/** Something unsaved is open (a Forge with swaps not saved yet): an app update must not reload the page now. */
export const hasLeaveGuard = () => guard !== null;

/** The pill menu's back arrow: the screen that has somewhere to go back to sets it (null = no arrow). */
let back: (() => void) | null = null;
const BACK = 'ch:back';
export const setBack = (f: (() => void) | null) => ((back = f), dispatchEvent(new Event(BACK)));
export const getBack = () => back;
export const onBackChange = (f: () => void) => (addEventListener(BACK, f), () => removeEventListener(BACK, f));

/** Context-adaptive Dynamic Island state for Forge mode (replaces the hanging middle Forge bar). */
export interface ForgeIslandState {
  label: string;
  sub?: string;
  undo?: { text: string; run: () => void };
  onLeave: () => void;
  onSave?: () => void;
  saving?: boolean;
  reserved?: boolean;
}
let forgeIsland: ForgeIslandState | null = null;
const FORGE_ISLAND = 'ch:forgeisland';
export const setForgeIsland = (next: ForgeIslandState | null) => {
  forgeIsland = next;
  dispatchEvent(new Event(FORGE_ISLAND));
};
export const getForgeIsland = () => forgeIsland;
export const onForgeIslandChange = (f: () => void) => (addEventListener(FORGE_ISLAND, f), () => removeEventListener(FORGE_ISLAND, f));

export interface ForgeCubeState {
  face: number;
  buyCount?: number;
  onFace: (i: number) => void;
}
let forgeCube: ForgeCubeState | null = null;
const FORGE_CUBE = 'ch:forgecube';
export const setForgeCube = (next: ForgeCubeState | null) => {
  forgeCube = next;
  dispatchEvent(new Event(FORGE_CUBE));
};
export const getForgeCube = () => forgeCube;
export const onForgeCubeChange = (f: () => void) => (addEventListener(FORGE_CUBE, f), () => removeEventListener(FORGE_CUBE, f));

/** Context-adaptive Dynamic Island live activity (imports, sync transitions, rate-limit waits). */
export interface IslandActivity {
  kind: 'import' | 'sync';
  label: string;
  done?: number;
  total?: number;
  wait?: number;
  tone?: 'busy' | 'ok' | 'warn' | 'err';
}
let islandActivity: IslandActivity | null = null;
const ISLAND_ACTIVITY = 'ch:islandactivity';
export const setIslandActivity = (next: IslandActivity | null) => {
  islandActivity = next;
  dispatchEvent(new Event(ISLAND_ACTIVITY));
};
export const getIslandActivity = () => islandActivity;
export const onIslandActivityChange = (f: () => void) => (addEventListener(ISLAND_ACTIVITY, f), () => removeEventListener(ISLAND_ACTIVITY, f));

/** Focused/hovered deck aura & quick toggle inside the Dynamic Island on MY DECKS. */
export interface IslandDeckFocus {
  id: number;
  name: string;
  color: string;
  active: boolean;
  tags: string[];
  onToggleActive: () => void;
}
let islandDeckFocus: IslandDeckFocus | null = null;
const ISLAND_DECK_FOCUS = 'ch:islanddeckfocus';
export const setIslandDeckFocus = (next: IslandDeckFocus | null) => {
  islandDeckFocus = next;
  dispatchEvent(new Event(ISLAND_DECK_FOCUS));
};
export const getIslandDeckFocus = () => islandDeckFocus;
export const onIslandDeckFocusChange = (f: () => void) => (addEventListener(ISLAND_DECK_FOCUS, f), () => removeEventListener(ISLAND_DECK_FOCUS, f));

/** Dynamic Island morph state when inspecting a card's copies in Collection. */
export interface IslandCopiesState {
  name: string;
  count: number;
  scryfallUrl: string;
  onClose: () => void;
}
let islandCopies: IslandCopiesState | null = null;
const ISLAND_COPIES = 'ch:islandcopies';
export const setIslandCopies = (next: IslandCopiesState | null) => {
  islandCopies = next;
  dispatchEvent(new Event(ISLAND_COPIES));
};
export const getIslandCopies = () => islandCopies;
export const onIslandCopiesChange = (f: () => void) => (addEventListener(ISLAND_COPIES, f), () => removeEventListener(ISLAND_COPIES, f));

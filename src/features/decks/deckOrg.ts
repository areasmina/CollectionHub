import type { Deck, DeckCard } from '../../lib/db';
import { cleanFolderName } from '../../lib/folders';
import { norm } from '../../lib/names';

export interface DeckFolderStore {
  folders: string[];
  assign: Record<string, string>; // String(deckId) -> folderName
}

export type FolderFilter = 'all' | 'unfiled' | string;

const keyFor = (profile: number) => `ch:deck_folders_${profile}`;

export function loadDeckFolders(profile: number): DeckFolderStore {
  try {
    const raw = localStorage.getItem(keyFor(profile));
    if (!raw) return { folders: [], assign: {} };
    const parsed = JSON.parse(raw) as Partial<DeckFolderStore>;
    return {
      folders: Array.isArray(parsed.folders) ? parsed.folders.filter((x) => typeof x === 'string') : [],
      assign: parsed.assign && typeof parsed.assign === 'object' ? parsed.assign : {},
    };
  } catch {
    return { folders: [], assign: {} };
  }
}

export function saveDeckFolders(profile: number, store: DeckFolderStore) {
  try {
    localStorage.setItem(keyFor(profile), JSON.stringify(store));
  } catch {
    /* per-device convenience only */
  }
}

export function createDeckFolder(
  store: DeckFolderStore,
  rawName: string
): { ok: true; name: string; store: DeckFolderStore } | { ok: false; why: string } {
  const check = cleanFolderName(rawName);
  if (!check.ok) return check;
  const exists = store.folders.some((f) => f.toLowerCase() === check.name.toLowerCase());
  if (exists) return { ok: false, why: `Folder "${check.name}" already exists.` };
  return {
    ok: true,
    name: check.name,
    store: { ...store, folders: [...store.folders, check.name] },
  };
}

export function assignDeckFolder(
  store: DeckFolderStore,
  deckId: number,
  folderName: string | null
): DeckFolderStore {
  const nextAssign = { ...store.assign };
  const k = String(deckId);
  if (!folderName) {
    delete nextAssign[k];
  } else {
    nextAssign[k] = folderName;
  }
  return { ...store, assign: nextAssign };
}

export function deleteDeckFolder(store: DeckFolderStore, folderName: string): DeckFolderStore {
  const target = folderName.toLowerCase();
  const nextAssign: Record<string, string> = {};
  for (const [k, v] of Object.entries(store.assign)) {
    if (v.toLowerCase() !== target) nextAssign[k] = v;
  }
  return {
    folders: store.folders.filter((f) => f.toLowerCase() !== target),
    assign: nextAssign,
  };
}

export function folderOfDeck(store: DeckFolderStore, deckId?: number): string | undefined {
  if (deckId == null) return undefined;
  return store.assign[String(deckId)];
}

export function filterDecksByFolder<T extends Pick<Deck, 'id'>>(
  decks: readonly T[],
  store: DeckFolderStore,
  filter: FolderFilter
): T[] {
  if (filter === 'all') return [...decks];
  if (filter === 'unfiled') {
    return decks.filter((d) => !folderOfDeck(store, d.id));
  }
  const target = filter.toLowerCase();
  return decks.filter((d) => (folderOfDeck(store, d.id) ?? '').toLowerCase() === target);
}

export interface SnapshotDiff {
  toAdd: Array<{ name: string; qty: number }>;
  toRemove: Array<{ name: string; qty: number }>;
  totalAdded: number;
  totalRemoved: number;
}

/**
 * Compare a saved snapshot against the current decklist:
 * - `toAdd`: cards/copies present in `snapshotCards` that restoring will add back.
 * - `toRemove`: cards/copies present in `currentCards` that restoring will remove.
 */
export function diffDeckSnapshot(
  currentCards: readonly DeckCard[],
  snapshotCards: readonly DeckCard[]
): SnapshotDiff {
  const curMap = new Map<string, { name: string; qty: number }>();
  for (const c of currentCards) {
    const k = norm(c.name);
    const prev = curMap.get(k);
    curMap.set(k, { name: prev?.name ?? c.name, qty: (prev?.qty ?? 0) + c.qty });
  }

  const snapMap = new Map<string, { name: string; qty: number }>();
  for (const c of snapshotCards) {
    const k = norm(c.name);
    const prev = snapMap.get(k);
    snapMap.set(k, { name: prev?.name ?? c.name, qty: (prev?.qty ?? 0) + c.qty });
  }

  const toAdd: Array<{ name: string; qty: number }> = [];
  const toRemove: Array<{ name: string; qty: number }> = [];

  for (const [k, sEntry] of snapMap) {
    const cQty = curMap.get(k)?.qty ?? 0;
    if (sEntry.qty > cQty) {
      toAdd.push({ name: sEntry.name, qty: sEntry.qty - cQty });
    }
  }

  for (const [k, cEntry] of curMap) {
    const sQty = snapMap.get(k)?.qty ?? 0;
    if (cEntry.qty > sQty) {
      toRemove.push({ name: cEntry.name, qty: cEntry.qty - sQty });
    }
  }

  toAdd.sort((a, b) => a.name.localeCompare(b.name));
  toRemove.sort((a, b) => a.name.localeCompare(b.name));

  return {
    toAdd,
    toRemove,
    totalAdded: toAdd.reduce((n, x) => n + x.qty, 0),
    totalRemoved: toRemove.reduce((n, x) => n + x.qty, 0),
  };
}

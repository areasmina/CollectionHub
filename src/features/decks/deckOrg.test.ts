import { describe, expect, it } from 'vitest';
import {
  assignDeckFolder,
  createDeckFolder,
  deleteDeckFolder,
  diffDeckSnapshot,
  filterDecksByFolder,
  type DeckFolderStore,
} from './deckOrg';

describe('deckOrg', () => {
  it('creates, assigns, filters, and deletes deck folders cleanly', () => {
    let store: DeckFolderStore = { folders: [], assign: {} };
    const r1 = createDeckFolder(store, 'cEDH');
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    store = r1.store;

    const dup = createDeckFolder(store, 'cedh');
    expect(dup.ok).toBe(false);

    const slash = createDeckFolder(store, 'A/B');
    expect(slash.ok).toBe(false);

    store = assignDeckFolder(store, 1, 'cEDH');
    const decks = [{ id: 1 }, { id: 2 }];
    expect(filterDecksByFolder(decks, store, 'all')).toHaveLength(2);
    expect(filterDecksByFolder(decks, store, 'unfiled').map((d) => d.id)).toEqual([2]);
    expect(filterDecksByFolder(decks, store, 'cEDH').map((d) => d.id)).toEqual([1]);

    store = deleteDeckFolder(store, 'cEDH');
    expect(store.folders).toEqual([]);
    expect(filterDecksByFolder(decks, store, 'unfiled')).toHaveLength(2);
  });

  it('computes +added / -removed snapshot diffs accurately', () => {
    const current = [
      { name: 'Sol Ring', qty: 1 },
      { name: 'Plains', qty: 10 },
      { name: 'Wrath of God', qty: 1 },
    ];
    const snapshot = [
      { name: 'Sol Ring', qty: 1 },
      { name: 'Plains', qty: 12 },
      { name: 'Swords to Plowshares', qty: 1 },
    ];

    const diff = diffDeckSnapshot(current, snapshot);
    expect(diff.toAdd).toEqual([
      { name: 'Plains', qty: 2 },
      { name: 'Swords to Plowshares', qty: 1 },
    ]);
    expect(diff.toRemove).toEqual([{ name: 'Wrath of God', qty: 1 }]);
    expect(diff.totalAdded).toBe(3);
    expect(diff.totalRemoved).toBe(1);
  });
});

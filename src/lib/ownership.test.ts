import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calculateDeckOwnership } from './ownership';
import { getDeckSnapshots, saveDeckSnapshot, restoreDeckSnapshot, deleteDeckSnapshot, pruneDeckSnapshots } from './deckhistory';
import { getDraftCheckpoint, setDraftCheckpoint, clearDraftCheckpoint, hasDraftDifference } from './drafts';
import type { Deck } from './db';

const localStore = new Map<string, string>();
const sessionStore = new Map<string, string>();

vi.stubGlobal('localStorage', {
  getItem: (k: string) => localStore.get(k) ?? null,
  setItem: (k: string, v: string) => void localStore.set(k, v),
  removeItem: (k: string) => void localStore.delete(k),
  clear: () => void localStore.clear(),
});

vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => sessionStore.get(k) ?? null,
  setItem: (k: string, v: string) => void sessionStore.set(k, v),
  removeItem: (k: string) => void sessionStore.delete(k),
  clear: () => void sessionStore.clear(),
});

describe('Deck Ownership Breakdown', () => {
  it('correctly tracks assigned here vs elsewhere vs missing', () => {
    const deckCards = [
      { name: 'Sol Ring', qty: 1 },
      { name: 'Arcane Signet', qty: 1 },
      { name: 'Swamp', qty: 10 },
    ];

    const activeEntries = new Map([
      ['sol ring', 1],
      ['swamp', 6],
    ]);

    const allOwned = new Map([
      ['sol ring', 1],
      ['arcane signet', 2], // owned in another binder/collection
      ['swamp', 8], // 6 here + 2 elsewhere
    ]);

    const summary = calculateDeckOwnership(deckCards, activeEntries, allOwned);

    expect(summary.plannedCards).toBe(12);
    expect(summary.assignedHere).toBe(7); // 1 Sol Ring + 6 Swamps
    expect(summary.ownedElsewhere).toBe(3); // 1 Arcane Signet + 2 Swamps
    expect(summary.missingToBuy).toBe(2); // 2 Swamps short

    const sol = summary.cards.get('sol ring');
    expect(sol?.status).toBe('complete');

    const signet = summary.cards.get('arcane signet');
    expect(signet?.status).toBe('elsewhere');
    expect(signet?.missingToBuy).toBe(0);

    const swamp = summary.cards.get('swamp');
    expect(swamp?.status).toBe('partial');
    expect(swamp?.assignedHere).toBe(6);
    expect(swamp?.ownedElsewhere).toBe(2);
    expect(swamp?.missingToBuy).toBe(2);
  });
});

describe('Deck Snapshots & History', () => {
  const dummyDeck: Deck = {
    id: 999,
    profile: 1,
    name: 'Gisa and Geralf Zombies',
    cards: [
      { name: 'Diregraf Colossus', qty: 1 },
      { name: 'Gravecrawler', qty: 1 },
    ],
    commander: 'Gisa and Geralf',
    updated: Date.now(),
  };

  beforeEach(() => {
    localStorage.clear();
  });

  it('saves and reads snapshots', () => {
    const snap = saveDeckSnapshot(dummyDeck, 'Custom checkpoint');
    expect(snap).not.toBeNull();
    const snaps = getDeckSnapshots(999);
    expect(snaps.length).toBe(1);
    expect(snaps[0].label).toBe('Custom checkpoint');
    expect(snaps[0].cardCount).toBe(2);
  });

  it('prunes snapshots cleanly', () => {
    for (let i = 0; i < 5; i++) {
      dummyDeck.cards.push({ name: `Zombie Token ${i}`, qty: 1 });
      saveDeckSnapshot(dummyDeck, `Revision ${i}`);
    }
    expect(getDeckSnapshots(999).length).toBe(5);
    const pruned = pruneDeckSnapshots(999, 2);
    expect(pruned.length).toBe(2);
  });

  it('deletes specific snapshot', () => {
    const s1 = saveDeckSnapshot(dummyDeck, 'Rev 1')!;
    dummyDeck.cards.push({ name: 'Lord of the Undead', qty: 1 });
    const s2 = saveDeckSnapshot(dummyDeck, 'Rev 2')!;
    expect(getDeckSnapshots(999).length).toBe(2);

    deleteDeckSnapshot(999, s1.id);
    const remaining = getDeckSnapshots(999);
    expect(remaining.length).toBe(1);
    expect(remaining[0].id).toBe(s2.id);
  });
});

describe('Draft Checkpoints', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('saves, retrieves and clears session drafts', () => {
    setDraftCheckpoint('deck_notes_123', 'Remember to add Cyclonic Rift');
    expect(getDraftCheckpoint('deck_notes_123')).toBe('Remember to add Cyclonic Rift');
    expect(hasDraftDifference('deck_notes_123', 'Old baseline')).toBe(true);
    expect(hasDraftDifference('deck_notes_123', 'Remember to add Cyclonic Rift')).toBe(false);

    clearDraftCheckpoint('deck_notes_123');
    expect(getDraftCheckpoint('deck_notes_123')).toBeNull();
  });
});

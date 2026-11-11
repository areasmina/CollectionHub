import { describe, it, expect, beforeEach, vi } from 'vitest';
import { addCounts, calculateDeckOwnership, savedProfile } from './ownership';
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
      { name: 'Relentless Rats', qty: 10 } // many copies allowed, and not a free basic land,
    ];

    const activeEntries = new Map([
      ['sol ring', 1],
      ['relentless rats', 6],
    ]);

    const allOwned = new Map([
      ['sol ring', 1],
      ['arcane signet', 2], // owned in another binder/collection
      ['relentless rats', 8], // 6 here + 2 elsewhere
    ]);

    const summary = calculateDeckOwnership(deckCards, activeEntries, allOwned);

    expect(summary.plannedCards).toBe(12);
    expect(summary.assignedHere).toBe(7); // 1 Sol Ring + 6 Relentless Rats
    expect(summary.ownedElsewhere).toBe(3); // 1 Arcane Signet + 2 Relentless Rats
    expect(summary.missingToBuy).toBe(2); // 2 Relentless Rats short

    const sol = summary.cards.get('sol ring');
    expect(sol?.status).toBe('complete');

    const signet = summary.cards.get('arcane signet');
    expect(signet?.status).toBe('elsewhere');
    expect(signet?.missingToBuy).toBe(0);

    const rats = summary.cards.get('relentless rats');
    expect(rats?.status).toBe('partial');
    expect(rats?.assignedHere).toBe(6);
    expect(rats?.ownedElsewhere).toBe(2);
    expect(rats?.missingToBuy).toBe(2);
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

describe('Two binders together', () => {
  it('adds the copies from both binders instead of keeping only the other binder count', () => {
    const mine = new Map([['sol ring', 1], ['arcane signet', 1]]);
    const other = new Map([['sol ring', 1]]);
    const all = addCounts(mine, other);
    expect(all.get('sol ring')).toBe(2);
    expect(all.get('arcane signet')).toBe(1);
    // A deck that wants 2 Sol Rings: one here, one in the other binder, nothing to buy.
    const sum = calculateDeckOwnership([{ name: 'Sol Ring', qty: 2 }], mine, all);
    expect(sum.assignedHere).toBe(1);
    expect(sum.ownedElsewhere).toBe(1);
    expect(sum.missingToBuy).toBe(0);
  });
});

describe('Saved binder', () => {
  it('keeps the Unassigned Cards binder (0) across a reload and falls back to binder 1 on junk', () => {
    expect(savedProfile('0')).toBe(0);
    expect(savedProfile('2')).toBe(2);
    expect(savedProfile(null)).toBe(1);
    expect(savedProfile('')).toBe(1);
    expect(savedProfile('abc')).toBe(1);
    expect(savedProfile('-3')).toBe(1);
  });
});

describe('Basic lands', () => {
  it('never count as cards to buy', () => {
    const sum = calculateDeckOwnership([{ name: 'Forest', qty: 20 }, { name: 'Sol Ring', qty: 1 }], new Map([['sol ring', 1]]), new Map([['sol ring', 1]]));
    expect(sum.missingToBuy).toBe(0);
    expect(sum.assignedHere).toBe(21);
  });
});

import { db, type Deck, type DeckCard } from './db';
import { norm } from './names';

export interface DeckSnapshot {
  id: string; // unique timestamp/uuid
  at: number; // timestamp
  label?: string; // e.g. "Before restore", "Auto-save", user custom note
  cardCount: number;
  cards: DeckCard[];
  commander?: string;
  partner?: string;
  tags?: string[];
  note?: string;
}

const MAX_SNAPSHOTS_PER_DECK = 30;
const STORAGE_PREFIX = 'hub_deck_snapshots_';

/** Returns all snapshots for a given deck ID, sorted newest first. */
export function getDeckSnapshots(deckId: number): DeckSnapshot[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${deckId}`);
    if (!raw) return [];
    const list: DeckSnapshot[] = JSON.parse(raw);
    return Array.isArray(list) ? list.sort((a, b) => b.at - a.at) : [];
  } catch (e) {
    console.warn('Failed to read deck snapshots', e);
    return [];
  }
}

/** Saves a snapshot of a deck's current state. Automatically limits to MAX_SNAPSHOTS_PER_DECK. */
export function saveDeckSnapshot(deck: Deck, label?: string): DeckSnapshot | null {
  if (!deck.id) return null;
  try {
    const current = getDeckSnapshots(deck.id);
    const snap: DeckSnapshot = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      at: Date.now(),
      label: label || (current.length === 0 ? 'Initial checkpoint' : `Revision #${current.length + 1}`),
      cardCount: deck.cards.reduce((sum, c) => sum + c.qty, 0),
      cards: deck.cards.map((c) => ({ ...c })),
      commander: deck.commander,
      partner: deck.partner,
      tags: deck.tags ? [...deck.tags] : undefined,
      note: deck.note,
    };

    // If identical to latest snapshot cards and commander, don't duplicate needlessly unless explicit label
    if (!label && current.length > 0) {
      const top = current[0];
      if (
        top.commander === snap.commander &&
        top.cardCount === snap.cardCount &&
        top.cards.length === snap.cards.length &&
        top.cards.every((c, i) => c.name === snap.cards[i]?.name && c.qty === snap.cards[i]?.qty && c.foil === snap.cards[i]?.foil)
      ) {
        return null; // Skip redundant identical snapshot
      }
    }

    const updated = [snap, ...current].slice(0, MAX_SNAPSHOTS_PER_DECK);
    localStorage.setItem(`${STORAGE_PREFIX}${deck.id}`, JSON.stringify(updated));
    return snap;
  } catch (e) {
    console.warn('Failed to save deck snapshot', e);
    return null;
  }
}

/** Restores a snapshot into Dexie, first taking a safety "Before restore" checkpoint. */
export async function restoreDeckSnapshot(deck: Deck, snapshot: DeckSnapshot): Promise<boolean> {
  if (!deck.id) return false;
  // 1. Take safety snapshot of current state
  saveDeckSnapshot(deck, 'Before restore');

  // 2. Apply snapshot to deck in db
  await db.decks.update(deck.id, {
    cards: snapshot.cards.map((c) => ({ ...c })),
    commander: snapshot.commander,
    partner: snapshot.partner,
    tags: snapshot.tags ? [...snapshot.tags] : deck.tags,
    note: snapshot.note !== undefined ? snapshot.note : deck.note,
    updated: Date.now(),
  });

  return true;
}

/** Deletes a specific snapshot by ID. */
export function deleteDeckSnapshot(deckId: number, snapshotId: string): DeckSnapshot[] {
  try {
    const current = getDeckSnapshots(deckId);
    const updated = current.filter((s) => s.id !== snapshotId);
    localStorage.setItem(`${STORAGE_PREFIX}${deckId}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Failed to delete deck snapshot', e);
    return [];
  }
}

/** Prunes snapshots keeping only the newest N (e.g. 10 or 20). */
export function pruneDeckSnapshots(deckId: number, keep = 10): DeckSnapshot[] {
  try {
    const current = getDeckSnapshots(deckId);
    const updated = current.slice(0, keep);
    localStorage.setItem(`${STORAGE_PREFIX}${deckId}`, JSON.stringify(updated));
    return updated;
  } catch (e) {
    console.warn('Failed to prune deck snapshots', e);
    return [];
  }
}

import { norm } from './names';
import type { DeckCard } from './db';

export interface CardOwnershipBreakdown {
  name: string;
  needed: number;
  assignedHere: number;
  ownedElsewhere: number;
  totalOwned: number;
  missingToBuy: number;
  status: 'complete' | 'partial' | 'missing' | 'elsewhere';
}

export interface DeckOwnershipSummary {
  plannedCards: number;
  assignedHere: number;
  ownedElsewhere: number;
  missingToBuy: number;
  totalUnique: number;
  cards: Map<string, CardOwnershipBreakdown>;
}

/**
 * Calculates strict copy-level ownership across planned deck slots versus
 * cards physically assigned here vs. owned elsewhere in active binders/decks.
 */
export function calculateDeckOwnership(
  deckCards: DeckCard[],
  activeDeckEntries: Map<string, number>, // cards in this deck or profile (key = norm(name))
  allOwnedEntries: Map<string, number> // total owned across all profiles
): DeckOwnershipSummary {
  const cards = new Map<string, CardOwnershipBreakdown>();
  let plannedCards = 0;
  let assignedHere = 0;
  let ownedElsewhere = 0;
  let missingToBuy = 0;

  for (const c of deckCards) {
    const k = norm(c.name);
    const needed = c.qty;
    plannedCards += needed;

    const ownedInThisDeck = activeDeckEntries.get(k) ?? 0;
    const totalOwned = allOwnedEntries.get(k) ?? 0;

    // Copies physically assigned to this deck/binder
    const here = Math.min(needed, ownedInThisDeck);
    // Extra copies owned in other binders or collections
    const elsewhere = Math.max(0, Math.min(needed - here, totalOwned - here));
    // Copies that must be purchased or acquired
    const toBuy = Math.max(0, needed - here - elsewhere);

    assignedHere += here;
    ownedElsewhere += elsewhere;
    missingToBuy += toBuy;

    let status: CardOwnershipBreakdown['status'] = 'complete';
    if (here === needed) {
      status = 'complete';
    } else if (here > 0) {
      status = 'partial';
    } else if (elsewhere > 0) {
      status = 'elsewhere';
    } else {
      status = 'missing';
    }

    cards.set(k, {
      name: c.name,
      needed,
      assignedHere: here,
      ownedElsewhere: elsewhere,
      totalOwned,
      missingToBuy: toBuy,
      status,
    });
  }

  return {
    plannedCards,
    assignedHere,
    ownedElsewhere,
    missingToBuy,
    totalUnique: cards.size,
    cards,
  };
}

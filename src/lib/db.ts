import Dexie, { type Table } from 'dexie';

/** Scryfall card data we keep (cached). */
export interface Card {
  id: string;
  name: string;
  key: string; // norm(name)
  type: string;
  text: string;
  ci: string[];
  img?: string;
  usd?: string;
  usdFoil?: string; // foil (else etched) price of this printing
  priceAt?: number; // when the shown price was fetched (cheapest-printing price: its own time)
  eur?: string;
  mana?: string;
  cmc?: number;
  buy?: string; // TCGplayer link from Scryfall
  legal: boolean;
  pv?: number; // card-data version: 2 = has usdFoil
  at?: number; // fetched at (ms)
}
/** One printing in a binder. */
export interface Entry {
  id?: number;
  profile: number;
  cardId: string;
  name: string;
  qty: number;
  set?: string;
  cn?: string;
  foil?: boolean;
  added?: number; // first seen (ManaBox 'Added', else import time), ms
}
export interface DeckCard {
  name: string;
  qty: number;
  foil?: boolean; // the deck wants (and, when owned, your binder holds) the foil version
}
export interface Deck {
  id?: number;
  profile: number;
  name: string;
  commander?: string;
  /** Second commander: a Partner, Friends forever, Background or Doctor's companion (colour identity = both). */
  partner?: string;
  /**
   * Copy policy (optional): 'shared' (default, also when missing) = a virtual list that may use any copy you own, as
   * always; 'reserved' = this deck holds its physical copies, and other reserved decks can't count them as available.
   */
  alloc?: 'shared' | 'reserved';
  /** EDHREC bracket page the deck was forged from ('cedh', 'optimized'…), when it came from a commander page. */
  source?: string;
  cards: DeckCard[];
  updated: number;
  note?: string;
  tags?: string[];
  inactive?: boolean; // light off: a deck you're not playing now; its cards don't count as in use
  color?: string; // the deck's own colour (hex); its cards glow in it across the app
}
export interface Profile {
  id: number;
  name: string;
  swaps?: Record<string, Record<string, string>>; // deck path -> missing card -> owned replacement
  bought?: string[]; // shopping list: card keys checked off
  pins?: Record<string, { in: string[]; out: string[] }>; // commander -> always in / never use
  /** The brain's settings and what it learned about this player (src/brain): synced with the rest of the profile. */
  brain?: {
    aggression?: 'patient' | 'hungry' | 'lethal';
    wildcards?: number; // WILDCARD slots, 0–3 (default 1)
    wild?: Record<string, { off?: boolean; roll?: number }>; // per commander: WILDCARD off, reroll count
    taste?: import('../brain/taste').TasteEvent[];
  };
}
export interface CachedPage {
  path: string;
  data: unknown;
  at: number;
}

/** Cheapest paper printing's USD price per card name (key = norm(name)). */
export interface Cheap {
  key: string;
  usd?: string;
  buy?: string;
  id?: string; // Scryfall id of that cheapest paper printing
  at: number;
}

class DB extends Dexie {
  cards!: Table<Card, string>;
  cheap!: Table<Cheap, string>;
  entries!: Table<Entry, number>;
  decks!: Table<Deck, number>;
  profiles!: Table<Profile, number>;
  edhrec!: Table<CachedPage, string>;
  constructor() {
    super('collectionhub');
    this.version(1).stores({ cards: 'id,key', entries: '++id,profile', decks: '++id,profile', profiles: 'id', edhrec: 'path' });
    this.version(2).stores({ cheap: 'key' });
  }
}

export const db = new DB();
export const PROFILES = [1, 2] as const;
db.on('populate', () => db.profiles.bulkAdd([{ id: 1, name: 'Binder 1' }, { id: 2, name: 'Binder 2' }]));

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
  eur?: string;
  mana?: string;
  cmc?: number;
  buy?: string; // TCGplayer link from Scryfall
  legal: boolean;
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
}
export interface Deck {
  id?: number;
  profile: number;
  name: string;
  commander?: string;
  cards: DeckCard[];
  updated: number;
  note?: string;
  tags?: string[];
}
export interface Profile {
  id: number;
  name: string;
  swaps?: Record<string, Record<string, string>>; // deck path -> missing card -> owned replacement
  bought?: string[]; // shopping list: card keys checked off
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

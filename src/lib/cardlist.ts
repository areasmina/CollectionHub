import type { Card } from './db';
import { goodConnection } from './offlinepics';
import { norm } from './names';

/**
 * The app's own card list (Phase 5C): every paper card once (name, type, mana, rules text, colour identity, rarity,
 * Commander legality, a default printing), built weekly from Scryfall's bulk file by a GitHub job
 * (scripts/build-cardlist.mjs) and served by our own site at /cards/oracle.json. No prices, no pictures.
 *
 * The app keeps one copy on the device (fetched on Wi-Fi, at most once a week) and uses it only when Scryfall can't be
 * reached: an import or a sync on a plane still knows every card. Cards found this way are saved without a price and
 * marked old, so the next time Scryfall answers they are refreshed (price, exact printing). Nothing depends on it.
 */
export const LIST_URL = '/cards/oracle.json';
export const LIST_CACHE = 'ch-cardlist';
const STAMP = 'ch:cardlist:at';
const WEEK = 7 * 864e5;
const FIELDS = ['name', 'type', 'mana', 'cmc', 'ci', 'rarity', 'legal', 'text', 'id', 'set', 'cn', 'back'] as const;
type ListRow = [string, string, string, number, string, string, 0 | 1, string, string, string, string, 0 | 1];
const RARITY: Record<string, string> = { c: 'common', u: 'uncommon', r: 'rare', m: 'mythic', s: 'special', b: 'bonus' };

/** A printing's small picture, made from its id (Scryfall's own address pattern). */
export const smallPic = (id: string, face: 'front' | 'back' = 'front') => `https://cards.scryfall.io/small/${face}/${id[0]}/${id[1]}/${id}.jpg`;

export interface ListDeps {
  open: (name: string) => Promise<Pick<Cache, 'match' | 'put'>>;
  fetch: (url: string) => Promise<Response>;
  get: (k: string) => string | null;
  set: (k: string, v: string) => void;
  now: () => number;
}
export function browserDeps(): ListDeps | null {
  if (typeof caches === 'undefined' || typeof fetch === 'undefined') return null;
  return {
    open: (n) => caches.open(n),
    fetch: (u) => fetch(u, { cache: 'no-cache' }),
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* private mode: fetched again next time */
      }
    },
    now: () => Date.now(),
  };
}

/** Keeps a fresh copy of the list on this device: on a good connection, at most once a week. */
export async function saveCardList(d: ListDeps, opts: { force?: boolean; online?: boolean; conn?: Parameters<typeof goodConnection>[1] } = {}) {
  if (!opts.force && d.now() - Number(d.get(STAMP) || 0) < WEEK) return 'fresh';
  if (!opts.force && !goodConnection(opts.online ?? true, opts.conn)) return 'later';
  const r = await d.fetch(LIST_URL);
  if (!r.ok || !(r.headers.get('content-type') ?? '').includes('json')) return 'missing';
  await (await d.open(LIST_CACHE)).put(LIST_URL, r);
  d.set(STAMP, String(d.now()));
  loaded = null; // the next lookup reads the new copy
  return 'saved';
}
/** When this device last saved the list (ms), 0 = never. */
export const cardListAt = (d: ListDeps | null = browserDeps()) => Number(d?.get(STAMP) || 0);
export function saveCardListSoon() {
  const d = browserDeps();
  if (!d) return;
  const conn = (navigator as Navigator & { connection?: Parameters<typeof goodConnection>[1] }).connection;
  void saveCardList(d, { online: navigator.onLine, conn }).catch(() => {});
}

export type CardList = Map<string, ListRow>;
let loaded: Promise<CardList | null> | null = null;

/** Reads a list file into lookups by name (and by front face name, for two-faced cards). */
export function parseCardList(text: string): CardList {
  const file = JSON.parse(text) as { v: number; fields: string[]; cards: ListRow[] };
  if (file.v !== 1 || FIELDS.some((f, i) => file.fields[i] !== f)) throw new Error('Unknown card list format');
  const m: CardList = new Map();
  for (const c of file.cards) {
    m.set(norm(c[0]), c);
    const front = c[0].split(/\s\/\/?\s/)[0];
    if (front !== c[0] && !m.has(norm(front))) m.set(norm(front), c);
  }
  return m;
}

/** The list kept on this device (never fetched here), or null when there is none. */
export function cardList(d: ListDeps | null = browserDeps()): Promise<CardList | null> {
  if (!d) return Promise.resolve(null);
  return (loaded ??= (async () => {
    const hit = await (await d.open(LIST_CACHE)).match(LIST_URL);
    return hit ? parseCardList(await hit.text()) : null;
  })().catch(() => ((loaded = null), null)));
}

/**
 * A card from the list, for a row of an import or a sync. The row's own printing (id, set, number) is kept when it has
 * one; its price is unknown and the card is marked old (pv 0), so it is fetched again as soon as Scryfall answers.
 */
export function cardFromList(list: CardList, name: string, own: { id?: string; set?: string; cn?: string } = {}): Card | null {
  const c = list.get(norm(name)) ?? list.get(norm(name.split(/\s\/\/?\s/)[0]));
  if (!c) return null;
  const [cardName, type, mana, cmc, ci, rarity, legal, text, listId, set, cn, back] = c;
  const id = own.id?.toLowerCase() || listId;
  const own_ = !!own.id; // set and number alone don't name an id: the list's default printing is used, whole
  return {
    id,
    name: cardName,
    key: norm(cardName),
    type,
    text,
    ci: ci.split(''),
    set: own_ ? own.set?.toLowerCase() : set || undefined,
    cn: own_ ? own.cn : cn || undefined,
    img: smallPic(id),
    ...(back ? { back: smallPic(id, 'back') } : {}),
    mana,
    cmc,
    legal: legal === 1,
    rarity: RARITY[rarity],
    pv: 0,
    at: 0,
  };
}

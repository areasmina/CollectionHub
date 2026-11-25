import { db, type Card, type Entry } from './db';
import { norm } from './names';

/**
 * Your copies of one card, one by one (the "hand", plan of Nov 24). A binder row is one printing in one finish (and
 * list) with a count, so a single copy is one unit of a row. Changing one copy takes 1 from its row and puts it in the
 * row that matches its new printing / finish / list, making that row when it doesn't exist. Nothing else changes: no
 * new saved fields, the export, the import and the sync all keep working on rows as before, and the total number of
 * copies never changes.
 */

/** One physical copy: which row it lives in, and which of that row's copies it is (0-based). */
export interface Copy {
  rowId: number;
  nth: number;
  entry: Entry;
}

/** Every copy of a card in a binder, foil or not, any printing, in a steady order (printing, then finish, then list). */
export function copiesOf(entries: Entry[], name: string): Copy[] {
  const k = norm(name);
  const rows = entries
    .filter((e) => e.id !== undefined && e.qty > 0 && norm(e.name) === k)
    .sort((a, b) => (a.set ?? '').localeCompare(b.set ?? '') || (a.cn ?? '').localeCompare(b.cn ?? '', undefined, { numeric: true }) || Number(!!a.foil) - Number(!!b.foil) || (a.list ?? '').localeCompare(b.list ?? '') || a.id! - b.id!);
  return rows.flatMap((entry) => Array.from({ length: entry.qty }, (_, nth) => ({ rowId: entry.id!, nth, entry })));
}

/** What one copy can become. A new printing brings its Scryfall id, set code and collector number together. */
export interface CopyChange {
  foil?: boolean;
  printing?: { cardId: string; set?: string; cn?: string };
  /** Custom list inside the binder; null takes the copy out of its list. */
  list?: string | null;
}

/** Same row = same printing, finish and list: the importer's own rule for adding copies to a row. */
const rowKey = (e: Pick<Entry, 'profile' | 'cardId' | 'set' | 'cn' | 'foil' | 'list'>) => [e.profile, e.cardId, (e.set ?? '').toLowerCase(), e.cn ?? '', e.foil ? 'f' : '', e.list ?? ''].join('|');

/**
 * Moves one copy out of row `rowId` with `change` applied. Returns the rows to save and the ids to delete (a new row
 * has no id). Nothing happens when the row isn't there or the change leaves the copy as it was.
 */
export function moveOneCopy(entries: Entry[], rowId: number, change: CopyChange): { put: Entry[]; del: number[] } {
  const from = entries.find((e) => e.id === rowId);
  if (!from || from.qty < 1) return { put: [], del: [] };
  const moved: Entry = { ...from, id: undefined, qty: 1 };
  if (change.foil !== undefined) moved.foil = change.foil;
  if (change.printing) {
    moved.cardId = change.printing.cardId;
    moved.set = change.printing.set?.toLowerCase();
    moved.cn = change.printing.cn;
  }
  if (change.list !== undefined) moved.list = change.list ?? undefined;
  if (!moved.foil) delete moved.foil;
  if (!moved.list) delete moved.list;
  if (!moved.set) delete moved.set;
  if (!moved.cn) delete moved.cn;
  if (rowKey(moved) === rowKey(from)) return { put: [], del: [] };
  const into = entries.find((e) => e.id !== rowId && rowKey(e) === rowKey(moved));
  const put: Entry[] = [];
  const del: number[] = [];
  if (from.qty > 1) put.push({ ...from, qty: from.qty - 1 });
  else del.push(rowId);
  if (into) {
    // the row keeps the earliest date one of its copies entered the binder
    const added = [into.added, from.added].filter((x): x is number => typeof x === 'number');
    put.push({ ...into, qty: into.qty + 1, ...(added.length ? { added: Math.min(...added) } : {}) });
  } else put.push(moved);
  return { put, del };
}

const rowsOf = async (profile: number, name: string) => (await db.entries.where('profile').equals(profile).toArray()).filter((e) => norm(e.name) === norm(name));

/** Puts the card's rows back exactly as they were (ids too). */
const restore = (profile: number, name: string, before: Entry[]) => async () => {
  await db.transaction('rw', db.entries, async () => {
    const now = await rowsOf(profile, name);
    await db.entries.bulkDelete(now.map((e) => e.id!));
    await db.entries.bulkPut(before);
  });
};

/**
 * Changes one copy in the binder (finish, printing or list) in one all-or-nothing step. `card` is the Scryfall data of
 * a new printing, saved so its picture and price show. Returns an undo that puts the card's rows back as they were.
 */
export async function changeOneCopy(profile: number, rowId: number, change: CopyChange, card?: Card) {
  const row = await db.entries.get(rowId);
  if (!row || row.profile !== profile) return async () => {};
  const before = await rowsOf(profile, row.name);
  await db.transaction('rw', db.entries, db.cards, async () => {
    if (card) await db.cards.put(card);
    const { put, del } = moveOneCopy(before, rowId, change);
    if (del.length) await db.entries.bulkDelete(del);
    if (put.length) await db.entries.bulkPut(put.map((e) => (e.id === undefined ? (({ id: _, ...r }) => r)(e) : e)) as Entry[]);
  });
  return restore(profile, row.name, before);
}

/** One more identical copy (same printing, finish and list), or one fewer (the row goes when its last copy does). */
export async function stepCopies(profile: number, rowId: number, by: 1 | -1) {
  const row = await db.entries.get(rowId);
  if (!row || row.profile !== profile) return async () => {};
  const before = await rowsOf(profile, row.name);
  const qty = Math.min(999, row.qty + by);
  await db.transaction('rw', db.entries, async () => {
    if (qty < 1) await db.entries.delete(rowId);
    else await db.entries.update(rowId, { qty });
  });
  return restore(profile, row.name, before);
}

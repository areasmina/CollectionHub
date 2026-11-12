import { db, type Deck, type Entry } from './db';
import { mergeRows, parseImport, type ParseError, type Row } from './importers';
import { resolveRows } from './scryfall';
import { canPair, guessCommanders } from './commander';

export interface ImportResult {
  format: string;
  added: number;
  unmatched: Row[];
  errors: ParseError[];
  failed?: Row[]; // not looked up: Scryfall stopped answering (try again later)
}

const entryKey = (e: { cardId: string; set?: string; cn?: string; foil?: boolean; list?: string }) => [e.cardId, e.set ?? '', e.cn ?? '', e.foil ? 'f' : '', e.list ?? ''].join('|'); const _oldEntryKey = (e: any) => [e.cardId, e.set ?? '', e.cn ?? '', e.foil ? 'f' : ''].join('|');

export async function importCollection(profile: number, text: string, replace: boolean, onProgress: (done: number, total: number, waitMs?: number) => void): Promise<ImportResult> {
  const parsed = parseImport(text);
  const rows = mergeRows(parsed.rows);
  const { matched, unmatched, failed, down } = await resolveRows(rows, onProgress);
  // Replacing with half a list would wipe the binder: when Scryfall is down, replace saves nothing.
  if (down && replace) throw new Error(`Scryfall didn't answer (${down}). Your binder is unchanged`);
  await db.transaction('rw', db.entries, async () => {
    if (replace) await db.entries.where('profile').equals(profile).delete();
    const existing = new Map((await db.entries.where('profile').equals(profile).toArray()).map((e) => [entryKey(e), e]));
    const now = Date.now();
    for (const { row, card } of matched) {
      const added = (row.added && Date.parse(row.added)) || now;
      const e: Entry = { profile, cardId: card.id, name: card.name, qty: row.qty, set: row.set?.toLowerCase(), cn: row.cn, foil: row.foil, added };
      const prev = existing.get(entryKey(e));
      if (prev) (prev.qty += row.qty), (prev.added = Math.min(prev.added ?? added, added));
      else existing.set(entryKey(e), e);
    }
    await db.entries.bulkPut([...existing.values()]);
  });
  return { format: parsed.format, added: matched.reduce((n, m) => n + m.row.qty, 0), unmatched, errors: parsed.errors, failed };
}

/** Sections of a pasted list that aren't part of the 100. */
export const NOT_IN_DECK = /^(side|sideboard|maybe|maybeboard|considering|tokens?)$/i;

/** Deck from a text/CSV list; names are kept as written, Scryfall fixes spelling where it can. Sideboard, maybeboard
 *  and token sections are left out. */
export async function importDeck(profile: number, name: string, text: string, onProgress: (done: number, total: number, waitMs?: number) => void) {
  const parsed = parseImport(text);
  parsed.rows = parsed.rows.filter((r) => !NOT_IN_DECK.test(r.section ?? ''));
  const { matched, unmatched } = await resolveRows(mergeRows(parsed.rows), onProgress);
  // Up to two commanders: a "Commander" section first (two only when they can legally pair), else a guess.
  const marked = matched.filter((m) => /commander/i.test(m.row.section ?? '')).map((m) => ({ name: m.card.name, card: m.card }));
  const [commander, partner] =
    marked.length >= 2 && canPair(marked[0], marked[1])
      ? [marked[0].name, marked[1].name]
      : marked.length
        ? [marked[0].name]
        : guessCommanders(matched.map((m) => ({ name: m.card.name, card: m.card, edge: m.row.edge })));
  const deck: Deck = { profile, name, commander, ...(partner ? { partner } : {}), cards: matched.map((m) => ({ name: m.card.name, qty: m.row.qty })), updated: Date.now() };
  deck.id = await db.decks.add(deck);
  return { deck, unmatched, errors: parsed.errors };
}

export const resetProfile = (profile: number) => db.entries.where('profile').equals(profile).delete();

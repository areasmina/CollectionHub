import { db, type Deck, type Entry } from './db';
import { mergeRows, parseImport, type ParseError, type Row } from './importers';
import { resolveRows } from './scryfall';

export interface ImportResult {
  format: string;
  added: number;
  unmatched: Row[];
  errors: ParseError[];
}

const entryKey = (e: { cardId: string; set?: string; cn?: string; foil?: boolean }) => [e.cardId, e.set ?? '', e.cn ?? '', e.foil ? 'f' : ''].join('|');

export async function importCollection(profile: number, text: string, replace: boolean, onProgress: (done: number, total: number) => void): Promise<ImportResult> {
  const parsed = parseImport(text);
  const rows = mergeRows(parsed.rows);
  const { matched, unmatched } = await resolveRows(rows, onProgress);
  await db.transaction('rw', db.entries, async () => {
    if (replace) await db.entries.where('profile').equals(profile).delete();
    const existing = new Map((await db.entries.where('profile').equals(profile).toArray()).map((e) => [entryKey(e), e]));
    for (const { row, card } of matched) {
      const e: Entry = { profile, cardId: card.id, name: card.name, qty: row.qty, set: row.set?.toLowerCase(), cn: row.cn, foil: row.foil };
      const prev = existing.get(entryKey(e));
      if (prev) prev.qty += row.qty;
      else existing.set(entryKey(e), e);
    }
    await db.entries.bulkPut([...existing.values()]);
  });
  return { format: parsed.format, added: matched.reduce((n, m) => n + m.row.qty, 0), unmatched, errors: parsed.errors };
}

/** Deck from a text/CSV list; names are kept as written, Scryfall fixes spelling where it can. */
export async function importDeck(profile: number, name: string, text: string, onProgress: (done: number, total: number) => void) {
  const parsed = parseImport(text);
  const { matched, unmatched } = await resolveRows(mergeRows(parsed.rows), onProgress);
  const commander = matched.find((m) => /commander/i.test(m.row.section ?? ''))?.card.name;
  const deck: Deck = { profile, name, commander, cards: matched.map((m) => ({ name: m.card.name, qty: m.row.qty })), updated: Date.now() };
  deck.id = await db.decks.add(deck);
  return { deck, unmatched, errors: parsed.errors };
}

export const resetProfile = (profile: number) => db.entries.where('profile').equals(profile).delete();

import type { Deck, Entry, Profile } from './db';

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

const finishLabel = (e: Entry) => (e.finish === 'etched' ? 'etched' : e.foil ? 'foil' : 'normal');

/** Same columns the importer reads back. */
export const collectionCsv = (entries: Entry[]) => {
  const hasDetails = entries.some((e) => e.condition || e.lang);
  const head = hasDetails ? 'Name,Quantity,Set code,Collector number,Foil,Scryfall ID,Condition,Language' : 'Name,Quantity,Set code,Collector number,Foil,Scryfall ID';
  return [
    head,
    ...entries.map((e) => {
      const base = [q(e.name), e.qty, q(e.set ?? ''), q(e.cn ?? ''), finishLabel(e), q(e.cardId)];
      if (hasDetails) base.push(q(e.condition ?? ''), q(e.lang ?? ''));
      return base.join(',');
    }),
  ].join('\n');
};

/** A cell a spreadsheet must never read as a formula (=, +, -, @ at the start). Only for cells the importer does not read
 *  back (binder and list names, which the person typed); card names stay exact so a file re-imports unchanged. */
const safe = (s: string) => q(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);

/**
 * Every binder in one CSV, one row per printing per binder. "Binder Name" is ManaBox's own column name, so ManaBox can
 * sort the rows back into binders; this app's importer reads the same Name / Quantity / Set code / Collector number /
 * Foil / Scryfall ID columns as a one-binder export and ignores the rest (it puts every row in the binder you import into).
 */
export const allBindersCsv = (binders: { name: string; entries: Entry[] }[]) =>
  [
    'Binder Name,Name,Quantity,Set code,Collector number,Foil,Scryfall ID,List',
    ...binders.flatMap((b) => b.entries.map((e) => [safe(b.name), q(e.name), e.qty, q(e.set ?? ''), q(e.cn ?? ''), finishLabel(e), q(e.cardId), safe(e.list ?? '')].join(','))),
  ].join('\n');

/** The binder as a list to send someone: a short heading (lines starting with # are skipped on import), then the same
 *  "1 Sol Ring (CMM) 464 *F*" lines as EXPORT TEXT, which this app, Moxfield and Archidekt read back. */
export const binderShareText = (name: string, entries: Entry[]) => {
  const copies = entries.reduce((n, e) => n + e.qty, 0);
  return [`# ${name.replace(/\s+/g, ' ').trim()}: ${copies} card${copies === 1 ? '' : 's'}, ${entries.length} unique`, '', collectionText(entries)].join('\n');
};

/** Every binder as one plain text list: a "# Binder (N cards)" heading per binder (skipped on import), then the same
 *  lines as EXPORT TEXT. Imports back here, into Moxfield or Archidekt, all into the one binder you import into. */
export const allBindersText = (binders: { name: string; entries: Entry[] }[]) =>
  binders
    .map((b) => {
      const copies = b.entries.reduce((n, e) => n + e.qty, 0);
      return `# ${b.name.replace(/\s+/g, ' ').trim()} (${copies} card${copies === 1 ? '' : 's'})\n${collectionText(b.entries)}`;
    })
    .join('\n\n');

/**
 * The CollectionHub file: the same shape as DOWNLOAD BACKUP in the sync drawer ({ app: 'collectionhub', fmt: 1, at,
 * profiles, entries, decks }), cut down to the binders asked for. It keeps everything the app knows about a binder:
 * cards with their exact printing, finish, list and date added, the binder's decks, and its settings.
 */
export const binderFile = (profiles: Profile[], entries: Entry[], decks: Deck[], at = Date.now()) =>
  JSON.stringify({ app: 'collectionhub', fmt: 1, at, profiles, entries, decks });

export const EXPORT_FORMATS = ['csv', 'txt', 'collectionhub'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const collectionText = (entries: Entry[]) =>
  entries.map((e) => `${e.qty} ${e.name}${e.set ? ` (${e.set.toUpperCase()})${e.cn ? ' ' + e.cn : ''}` : ''}${e.foil ? ' *F*' : ''}`).join('\n');

const leads = (d: Deck) => [d.commander, d.partner].filter((x): x is string => !!x);
export const deckText = (d: Deck) =>
  [...(leads(d).length ? ['Commander', ...leads(d).map((n) => `1 ${n}`), '', 'Deck'] : []), ...d.cards.filter((c) => !leads(d).includes(c.name)).map((c) => `${c.qty} ${c.name}${c.foil ? ' *F*' : ''}`)].join('\n');

/** MTG Arena's import: "Commander" then "Deck" sections, plain "1 Name" lines (no foil marks, no set codes: Arena
 *  picks its own printings). Basics stay; quantities stay. */
export const deckArena = (d: Deck) =>
  [...(leads(d).length ? ['Commander', ...leads(d).map((n) => `1 ${n}`), ''] : []), 'Deck', ...d.cards.filter((c) => !leads(d).includes(c.name)).map((c) => `${c.qty} ${c.name}`)].join('\n');

export const deckCsv = (d: Deck) => ['Name,Quantity,Commander,Foil', ...d.cards.map((c) => `${q(c.name)},${c.qty},${leads(d).includes(c.name)},${c.foil ? 'foil' : 'normal'}`)].join('\n');

export function download(filename: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

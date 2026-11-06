import type { Deck, Entry } from './db';

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Same columns the importer reads back. */
export const collectionCsv = (entries: Entry[]) =>
  ['Name,Quantity,Set code,Collector number,Foil,Scryfall ID', ...entries.map((e) => [q(e.name), e.qty, e.set ?? '', e.cn ?? '', e.foil ? 'foil' : 'normal', e.cardId].join(','))].join('\n');

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

import type { Deck, Entry } from './db';

const q = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Same columns the importer reads back. */
export const collectionCsv = (entries: Entry[]) =>
  ['Name,Quantity,Set code,Collector number,Foil,Scryfall ID', ...entries.map((e) => [q(e.name), e.qty, e.set ?? '', e.cn ?? '', e.foil ? 'foil' : 'normal', e.cardId].join(','))].join('\n');

export const collectionText = (entries: Entry[]) =>
  entries.map((e) => `${e.qty} ${e.name}${e.set ? ` (${e.set.toUpperCase()})${e.cn ? ' ' + e.cn : ''}` : ''}${e.foil ? ' *F*' : ''}`).join('\n');

export const deckText = (d: Deck) =>
  [...(d.commander ? ['Commander', `1 ${d.commander}`, '', 'Deck'] : []), ...d.cards.filter((c) => c.name !== d.commander).map((c) => `${c.qty} ${c.name}${c.foil ? ' *F*' : ''}`)].join('\n');

export const deckCsv = (d: Deck) => ['Name,Quantity,Commander,Foil', ...d.cards.map((c) => `${q(c.name)},${c.qty},${c.name === d.commander},${c.foil ? 'foil' : 'normal'}`)].join('\n');

export function download(filename: string, text: string, type = 'text/plain') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

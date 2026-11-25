import { describe, expect, it } from 'vitest';
import type { Card, Entry } from './db';
import { collectionCsv } from './export';
import {
  activeNeed,
  allFolders,
  cleanFolderName,
  folderStats,
  folderTree,
  isWithin,
  parentOf,
  planAddFolder,
  planDeleteFolder,
  planMoveFolder,
  planRenameFolder,
  rowsWithin,
  showPath,
  type FolderPlan,
  type PlanResult,
} from './folders';
import { mergeSync } from './syncmerge';

let n = 0;
const row = (name: string, qty: number, list?: string, more: Partial<Entry> = {}): Entry => ({ id: ++n, profile: 1, cardId: name.toLowerCase().replace(/\W+/g, '-'), name, qty, list, ...more });
const ok = (r: PlanResult): FolderPlan => {
  if (!r.ok) throw new Error(r.why);
  return r;
};
/** The binder after a plan: rows saved, merged rows gone. */
const after = (entries: Entry[], p: FolderPlan) => {
  const put = new Map(p.put.map((e) => [e.id, e]));
  return entries.filter((e) => !p.del.includes(e.id!)).map((e) => put.get(e.id) ?? e);
};
const total = (es: Entry[]) => es.reduce((s, e) => s + e.qty, 0);

describe('folder names', () => {
  it('tidies spaces and refuses empty names and "/"', () => {
    expect(cleanFolderName('  Trade   binder ')).toEqual({ ok: true, name: 'Trade binder' });
    expect(cleanFolderName('   ').ok).toBe(false);
    expect(cleanFolderName('R/G').ok).toBe(false);
    expect(cleanFolderName('x'.repeat(41)).ok).toBe(false);
  });

  it('reads a path with or without spaces around "/" the same way', () => {
    expect(isWithin('Trade / Blue', 'Trade')).toBe(true);
    expect(isWithin('Trade/Blue', 'Trade / Blue')).toBe(true);
    expect(isWithin('Trader', 'Trade')).toBe(false);
    expect(isWithin(undefined, 'Trade')).toBe(false);
    expect(parentOf('Trade/Blue')).toBe('Trade');
    expect(parentOf('Trade')).toBeNull();
    expect(showPath('Trade/Blue')).toBe('Trade / Blue');
  });
});

describe('folder tree', () => {
  it('keeps the order folders were made and shows a parent only named by a subfolder', () => {
    const t = folderTree(['Trade', 'Commanders', 'Trade/Blue', 'Sell/Bulk']);
    expect(t.map((x) => x.path)).toEqual(['Trade', 'Commanders', 'Sell']);
    expect(t[0].children.map((x) => x.name)).toEqual(['Blue']);
    expect(allFolders(['Trade/Blue', 'Trade'])).toEqual(['Trade', 'Trade/Blue']);
  });

  it('today’s flat lists are top-level folders as they are', () => {
    expect(folderTree(['Trade', 'Wishlist']).map((x) => [x.path, x.depth, x.children.length])).toEqual([
      ['Trade', 1, 0],
      ['Wishlist', 1, 0],
    ]);
  });
});

describe('adding a folder', () => {
  it('adds at the top or inside a folder, two levels at most, no duplicate names', () => {
    expect(ok(planAddFolder([], null, 'Trade')).lists).toEqual(['Trade']);
    expect(ok(planAddFolder(['Trade'], 'Trade', 'Blue')).lists).toEqual(['Trade', 'Trade/Blue']);
    expect(planAddFolder(['Trade', 'Trade/Blue'], 'Trade/Blue', 'Deep').ok).toBe(false);
    expect(planAddFolder(['Trade'], null, 'trade').ok).toBe(false);
    expect(planAddFolder(['Trade'], 'Trade', 'R/G').ok).toBe(false);
    expect(planAddFolder([], 'Missing', 'Blue').ok).toBe(false);
  });
});

describe('renaming and moving a folder', () => {
  it('a rename carries its subfolders and cards, and never changes a count', () => {
    const es = [row('Sol Ring', 1, 'Trade'), row('Counterspell', 2, 'Trade/Blue'), row('Forest', 10)];
    const p = ok(planRenameFolder(['Trade', 'Trade/Blue'], es, 'Trade', 'Swap'));
    expect(p.lists).toEqual(['Swap', 'Swap/Blue']);
    const out = after(es, p);
    expect(out.map((e) => e.list)).toEqual(['Swap', 'Swap/Blue', undefined]);
    expect(total(out)).toBe(total(es));
  });

  it('refuses a name already used next to it, but allows changing its own capitals', () => {
    expect(planRenameFolder(['Trade', 'Sell'], [], 'Trade', 'sell').ok).toBe(false);
    expect(ok(planRenameFolder(['Trade'], [], 'Trade', 'TRADE')).lists).toEqual(['TRADE']);
  });

  it('moves a folder inside another, but not inside itself or past two levels', () => {
    const es = [row('Opt', 4, 'Blue')];
    const p = ok(planMoveFolder(['Trade', 'Blue'], es, 'Blue', 'Trade'));
    expect(p.lists).toEqual(['Trade', 'Trade/Blue']);
    expect(after(es, p)[0].list).toBe('Trade/Blue');
    expect(planMoveFolder(['Trade', 'Trade/Blue'], [], 'Trade', 'Trade/Blue').ok).toBe(false);
    expect(planMoveFolder(['Trade', 'Trade/Blue', 'Sell'], [], 'Trade', 'Sell').ok).toBe(false);
    expect(ok(planMoveFolder(['Trade', 'Trade/Blue'], [], 'Trade/Blue', null)).lists).toEqual(['Trade', 'Blue']);
  });
});

describe('deleting a folder', () => {
  it('never deletes a card: they move up to the folder above, top level to Unlisted', () => {
    const es = [row('Sol Ring', 1, 'Trade'), row('Counterspell', 2, 'Trade/Blue'), row('Opt', 3, 'Trade/Blue')];
    const sub = ok(planDeleteFolder(['Trade', 'Trade/Blue'], es, 'Trade/Blue'));
    expect(sub.lists).toEqual(['Trade']);
    expect(after(es, sub).map((e) => e.list)).toEqual(['Trade', 'Trade', 'Trade']);
    const top = ok(planDeleteFolder(['Trade', 'Trade/Blue'], es, 'Trade'));
    expect(top.lists).toEqual([]);
    expect(after(es, top).every((e) => e.list === undefined)).toBe(true);
    expect(total(after(es, top))).toBe(6);
  });

  it('merges a copy into the same printing and finish already in the folder above', () => {
    const above = row('Sol Ring', 2, 'Trade', { added: 500 });
    const below = row('Sol Ring', 1, 'Trade/Blue', { added: 100 });
    const foil = row('Sol Ring', 1, 'Trade/Blue', { foil: true });
    const es = [above, below, foil];
    const p = ok(planDeleteFolder(['Trade', 'Trade/Blue'], es, 'Trade/Blue'));
    expect(p.del).toEqual([below.id]);
    const out = after(es, p);
    expect(out.find((e) => e.id === above.id)).toMatchObject({ qty: 3, added: 100, list: 'Trade' });
    expect(out.find((e) => e.id === foil.id)?.list).toBe('Trade'); // a foil stays its own row
    expect(total(out)).toBe(4);
  });

  it('a parent only named by the deleted subfolder stays as a folder', () => {
    expect(ok(planDeleteFolder(['Sell/Bulk'], [], 'Sell/Bulk')).lists).toEqual(['Sell']);
  });
});

describe('folder stats', () => {
  const cards = new Map<string, Card>([
    ['sol-ring', { id: 'sol-ring', name: 'Sol Ring', key: 'sol ring', type: 'Artifact', text: '', ci: [], legal: true, usd: '2.00', usdFoil: '5.00' }],
    ['counterspell', { id: 'counterspell', name: 'Counterspell', key: 'counterspell', type: 'Instant', text: '', ci: ['U'], legal: true, usd: '1.00' }],
  ]);

  it('counts copies, unique cards and worth, subfolders included', () => {
    const es = [row('Sol Ring', 1, 'Trade'), row('Sol Ring', 1, 'Trade/Blue', { foil: true }), row('Counterspell', 3, 'Trade/Blue'), row('Forest', 9)];
    const s = folderStats(rowsWithin(es, 'Trade'), es, new Map(), cards);
    expect(s).toEqual({ copies: 5, unique: 2, usd: 10, spare: 5 });
  });

  it('spare = min(copies in the folder, owned in the binder minus what active decks need)', () => {
    // Guillermo's case: 2 Sol Rings (1 in Staples, 1 in Trade), 1 active deck uses one: 1 spare, and Trade shows 1
    const es = [row('Sol Ring', 1, 'Staples'), row('Sol Ring', 1, 'Trade')];
    const need = activeNeed([{ cards: [{ name: 'Sol Ring', qty: 1 }] }]);
    expect(folderStats(rowsWithin(es, 'Trade'), es, need, cards).spare).toBe(1);
    // the deck needs both: nothing spare anywhere
    const both = activeNeed([{ cards: [{ name: 'Sol Ring', qty: 2 }] }]);
    expect(folderStats(rowsWithin(es, 'Trade'), es, both, cards).spare).toBe(0);
    // 5 owned, 1 needed: 4 spare in the binder, but a folder holding 1 shows 1
    const many = [row('Sol Ring', 4, 'Staples'), row('Sol Ring', 1, 'Trade')];
    expect(folderStats(rowsWithin(many, 'Trade'), many, need, cards).spare).toBe(1);
  });

  it('decks with their light off and basic lands never take copies', () => {
    const need = activeNeed([
      { cards: [{ name: 'Sol Ring', qty: 1 }], inactive: true },
      { cards: [{ name: 'Forest', qty: 30 }] },
    ]);
    expect(need.size).toBe(0);
  });
});

describe('folders and the rest of the app', () => {
  it('sync merge keeps a card added on one device to a folder the other device renamed', () => {
    const base = { profiles: [{ id: 1, name: 'Main', lists: ['Trade'] }], entries: [row('Sol Ring', 1, 'Trade')], decks: [] };
    // this device renamed Trade to Swap
    const p = ok(planRenameFolder(['Trade'], base.entries, 'Trade', 'Swap'));
    const mine = { ...base, profiles: [{ id: 1, name: 'Main', lists: p.lists }], entries: after(base.entries, p) };
    // the other device added an Opt to Trade
    const theirs = { ...base, entries: [...base.entries, row('Opt', 2, 'Trade')] };
    const { data } = mergeSync(base, mine, theirs);
    expect(total(data.entries)).toBe(3); // nothing lost
    expect(data.entries.find((e) => e.name === 'Sol Ring')?.list).toBe('Swap');
    expect(data.entries.find((e) => e.name === 'Opt')?.list).toBe('Trade');
  });

  it('the CSV export is unchanged by folders (a Folder column is a later step)', () => {
    const csv = collectionCsv([row('Sol Ring', 1, 'Trade/Blue', { set: 'cmm', cn: '1' })]);
    expect(csv.split('\n')[0]).toBe('Name,Quantity,Set code,Collector number,Foil,Scryfall ID');
  });
});

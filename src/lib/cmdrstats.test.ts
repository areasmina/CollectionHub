import { describe, expect, it, vi } from 'vitest';

// A tiny in-memory stand-in for the IndexedDB page table.
const rows = new Map<string, any>();
vi.mock('./db', () => ({ db: { edhrec: { get: async (k: string) => rows.get(k), put: async (r: any) => void rows.set(r.path, r) } } }));

import { binderSig, loadStats, plan, saveStats, statOf, type SavedStat } from './cmdrstats';

const page = (names: string[]) => ({ header: '', tags: [], numDecks: 10, lists: [{ header: 'Creatures', cards: names.map((name) => ({ name })) }] });

describe('commander stats', () => {
  it('counts owned cards of the average deck (basics count as owned)', () => {
    const mine = new Map([['sol ring', 1]]);
    expect(statOf(page(['Sol Ring', 'Forest', 'Cultivate', 'Rhystic Study']), mine)).toEqual({ pct: 50, missing: 2, decks: 10 });
  });

  it('counts copies, with the commander: 20 Forests are 20 cards, and a card wanted twice needs two copies', () => {
    const p = { header: '', tags: [], numDecks: 10, lists: [{ header: 'Lands', cards: [{ name: 'Forest', qty: 20 }, { name: 'Snow-Covered Island', qty: 4 }, { name: 'Sol Ring' }, { name: 'Cultivate' }] }] };
    const mine = new Map([['sol ring', 1], ['snow-covered island', 1], ['tatyova, benthic druid', 1]]);
    // 27 copies with the commander; owned: commander 1 + Forest 20 + snow island 1 of 4 + Sol Ring 1 = 23
    expect(statOf(p, mine, 'Tatyova, Benthic Druid')).toEqual({ pct: 85, missing: 4, decks: 10 });
  });

  it('binder signature ignores order, changes with the cards and with how many you own', () => {
    const a = binderSig(1, new Map([['a', 1], ['b', 2]]));
    expect(binderSig(1, new Map([['b', 2], ['a', 1]]))).toBe(a);
    expect(binderSig(1, new Map([['b', 5], ['a', 1]]))).not.toBe(a);
    expect(binderSig(1, new Map([['a', 1], ['c', 2]]))).not.toBe(a);
    expect(binderSig(2, new Map([['a', 1], ['b', 2]]))).not.toBe(a);
  });

  it('a reload with the same binder needs no work; new commanders and old pages do', () => {
    const now = 1e12;
    const saved = new Map<string, SavedStat>([
      ['a', { stat: { pct: 50, missing: 1 }, at: now - 1000 }],
      ['b', { stat: null, at: now - 10 * 864e5 }],
    ]);
    expect(plan(['a'], saved, true, now, 7 * 864e5)).toEqual({ recount: [], refresh: [] });
    expect(plan(['a', 'b', 'c'], saved, true, now, 7 * 864e5)).toEqual({ recount: ['c'], refresh: ['b', 'c'] });
    // Binder changed: every commander is recounted from its saved page.
    expect(plan(['a', 'b'], saved, false, now, 7 * 864e5).recount).toEqual(['a', 'b']);
  });

  it('saves per binder and reads back after a reload', async () => {
    const map = new Map<string, SavedStat>([['a', { stat: { pct: 70, missing: 3, decks: 5 }, at: 123 }], ['b', { stat: null, at: 456 }]]);
    await saveStats(1, 'sig1', map);
    expect(await loadStats(1)).toEqual({ sig: 'sig1', map });
    expect(await loadStats(2)).toEqual({ sig: '', map: new Map() });
  });
});

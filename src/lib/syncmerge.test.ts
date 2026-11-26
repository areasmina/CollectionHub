import { describe, expect, it } from 'vitest';
import type { Deck, Entry, Profile } from './db';
import { OTHER, merge3, mergeSync, type SyncData } from './syncmerge';

let n = 0;
const card = (cardId: string, qty: number, more: Partial<Entry> = {}): Entry => ({ id: ++n, profile: 1, cardId, name: cardId, qty, ...more });
const deck = (id: number, name: string, cards: [string, number][], more: Partial<Deck> = {}): Deck => ({
  id,
  profile: 1,
  name,
  cards: cards.map(([name, qty]) => ({ name, qty })),
  updated: 1,
  ...more,
});
const binder = (more: Partial<Profile> = {}): Profile => ({ id: 1, name: 'Main', ...more });
const data = (entries: Entry[], decks: Deck[] = [], profiles: Profile[] = [binder()]): SyncData => ({ profiles, entries, decks });
const qtys = (d: SyncData) => Object.fromEntries(d.entries.map((e) => [e.cardId + (e.foil ? '*' : ''), e.qty]));

describe('mergeSync: cards', () => {
  const base = data([card('sol-ring', 2), card('bolt', 1), card('forest', 10)]);

  it('takes a change made on one side only, from either side', () => {
    const mine = data([card('sol-ring', 3), card('bolt', 1), card('forest', 10)]);
    const theirs = data([card('sol-ring', 2), card('bolt', 1), card('forest', 7)]);
    expect(qtys(mergeSync(base, mine, theirs).data)).toEqual({ 'sol-ring': 3, bolt: 1, forest: 7 });
  });

  it('adds both changes when the same card changed on both sides', () => {
    // one device sold a copy, the other bought one: still 2
    const mine = data([card('sol-ring', 1), card('bolt', 1), card('forest', 10)]);
    const theirs = data([card('sol-ring', 3), card('bolt', 1), card('forest', 10)]);
    expect(qtys(mergeSync(base, mine, theirs).data)['sol-ring']).toBe(2);
  });

  it('keeps cards added on either side, and a card added on both gets both', () => {
    const mine = data([...base.entries, card('island', 4), card('swamp', 1)]);
    const theirs = data([...base.entries, card('mountain', 2), card('swamp', 2)]);
    const q = qtys(mergeSync(base, mine, theirs).data);
    expect([q.island, q.mountain, q.swamp]).toEqual([4, 2, 3]);
  });

  it('removes a card removed on one side and untouched on the other', () => {
    const mine = data([card('sol-ring', 2), card('forest', 10)]);
    const theirs = data([card('sol-ring', 2), card('bolt', 1)]);
    expect(qtys(mergeSync(base, mine, theirs).data)).toEqual({ 'sol-ring': 2 });
  });

  it('keeps a card removed on one side but changed on the other (nothing is lost)', () => {
    const mine = data([card('bolt', 1), card('forest', 10)]); // sol ring removed here
    const theirs = data([card('sol-ring', 4), card('bolt', 1), card('forest', 10)]); // and recounted there
    expect(qtys(mergeSync(base, mine, theirs).data)['sol-ring']).toBe(4);
    const mine2 = data([card('sol-ring', 5), card('bolt', 1), card('forest', 10)]);
    const theirs2 = data([card('bolt', 1), card('forest', 10)]);
    expect(qtys(mergeSync(base, mine2, theirs2).data)['sol-ring']).toBe(5);
  });

  it('never drops a card both sides still hold, even when both lowered it', () => {
    const mine = data([card('sol-ring', 1), card('bolt', 1), card('forest', 2)]);
    const theirs = data([card('sol-ring', 1), card('bolt', 1), card('forest', 3)]);
    const q = qtys(mergeSync(base, mine, theirs).data);
    expect(q['sol-ring']).toBe(1); // 2 → 1 on both: 0 by the sums, but both still list it
    expect(q.forest).toBe(2);
  });

  it('treats foil and non-foil, and different binders, as different cards', () => {
    const b = data([card('bolt', 1)]);
    const mine = data([card('bolt', 1), card('bolt', 1, { foil: true })]);
    const theirs = data([card('bolt', 1), card('bolt', 2, { profile: 2 })]);
    const out = mergeSync(b, mine, theirs).data.entries.map((e) => `${e.profile}:${e.foil ? 'f' : ''}${e.qty}`).sort();
    expect(out).toEqual(['1:1', '1:f1', '2:2']);
  });

  it("keeps this device's entry numbers and never reuses one for a card from the cloud", () => {
    const mine = data([{ ...card('sol-ring', 2), id: 7 }]);
    const theirs = data([{ ...card('sol-ring', 2), id: 99 }, { ...card('bolt', 1), id: 7 }]);
    const out = mergeSync(data([]), mine, theirs).data.entries;
    expect(out.find((e) => e.cardId === 'sol-ring')?.id).toBe(7);
    expect(out.find((e) => e.cardId === 'bolt')?.id).toBeUndefined();
  });
});

describe('mergeSync: decks', () => {
  const base = data([], [deck(1, 'Atraxa', [['Sol Ring', 1]]), deck(2, 'Krenko', [['Goblin', 1]])]);

  it('takes a deck edited on one side, and keeps decks made on either side', () => {
    const mine = data([], [deck(1, 'Atraxa', [['Sol Ring', 1], ['Bolt', 1]]), deck(2, 'Krenko', [['Goblin', 1]]), deck(3, 'Mine', [])]);
    const theirs = data([], [deck(1, 'Atraxa', [['Sol Ring', 1]]), deck(2, 'Krenko!', [['Goblin', 1]]), deck(3, 'Theirs', [])]);
    const out = mergeSync(base, mine, theirs).data.decks;
    expect(out.map((d) => d.name).sort()).toEqual(['Atraxa', 'Krenko!', 'Mine', 'Theirs']);
    expect(out.find((d) => d.name === 'Atraxa')?.cards).toHaveLength(2);
    // two new decks that got the same number on each device: different numbers after the merge
    expect(new Set(out.map((d) => d.id ?? `new-${d.name}`)).size).toBe(4);
    expect(out.find((d) => d.name === 'Theirs')?.id).toBeUndefined();
  });

  it('keeps both versions of a deck edited on both sides, the cloud one named (other device)', () => {
    const mine = data([], [deck(1, 'Atraxa', [['Sol Ring', 1], ['Bolt', 1]]), base.decks[1]]);
    const theirs = data([], [deck(1, 'Atraxa', [['Sol Ring', 1], ['Counterspell', 1]]), base.decks[1]]);
    const { data: out, report } = mergeSync(base, mine, theirs);
    expect(out.decks.map((d) => d.name).sort()).toEqual(['Atraxa', 'Atraxa' + OTHER, 'Krenko']);
    expect(report.doubled).toBe(1);
  });

  it('removes a deck deleted on one side and untouched on the other; keeps it when the other side edited it', () => {
    const mine = data([], [base.decks[0]]); // Krenko deleted here
    const theirs = data([], [base.decks[0], base.decks[1]]);
    expect(mergeSync(base, mine, theirs).data.decks.map((d) => d.name)).toEqual(['Atraxa']);
    const theirs2 = data([], [base.decks[0], deck(2, 'Krenko', [['Goblin', 4]])]);
    expect(mergeSync(base, mine, theirs2).data.decks.map((d) => d.name).sort()).toEqual(['Atraxa', 'Krenko']);
  });

  it('ignores save times: the same deck saved at another moment is not a change', () => {
    const mine = data([], [{ ...base.decks[0], updated: 50 }, base.decks[1]]);
    const theirs = data([], [{ ...base.decks[0], updated: 90 }, base.decks[1]]);
    expect(mergeSync(base, mine, theirs).data.decks).toHaveLength(2);
  });
});

describe('mergeSync: no shared copy (MERGE BOTH)', () => {
  it('keeps everything from both sides: the larger count of a shared card, identical decks once', () => {
    const mine = data([card('sol-ring', 2), card('bolt', 1)], [deck(1, 'Atraxa', [['Sol Ring', 1]])]);
    const theirs = data([card('sol-ring', 3), card('forest', 9)], [deck(1, 'Atraxa', [['Sol Ring', 1]]), deck(2, 'Krenko', [])]);
    const out = mergeSync(null, mine, theirs).data;
    expect(qtys(out)).toEqual({ 'sol-ring': 3, bolt: 1, forest: 9 });
    expect(out.decks.map((d) => d.name).sort()).toEqual(['Atraxa', 'Krenko']);
  });
});

describe('merge3: binder settings', () => {
  it('takes the side that changed a setting, merges per key, combines lists', () => {
    const base = { bought: ['a'], swaps: { d1: { x: 'y' } }, brain: { aggression: 'patient' } };
    const mine = { bought: ['a', 'b'], swaps: { d1: { x: 'y' }, d2: { p: 'q' } }, brain: { aggression: 'lethal' } };
    const theirs = { bought: ['a', 'c'], swaps: { d1: { x: 'z' } }, brain: { aggression: 'patient' } };
    expect(merge3(base, mine, theirs)).toEqual({ bought: ['a', 'b', 'c'], swaps: { d1: { x: 'z' }, d2: { p: 'q' } }, brain: { aggression: 'lethal' } });
  });
  it('profiles: a binder made on either side is kept', () => {
    const out = mergeSync(data([], [], [binder()]), data([], [], [binder(), { id: 2, name: 'Trade' }]), data([], [], [binder({ lists: ['Trade'] })])).data.profiles;
    expect(out).toEqual([{ id: 1, name: 'Main', lists: ['Trade'] }, { id: 2, name: 'Trade' }]);
  });
});

describe('mergeSync: deck history', () => {
  it('merges snapshots across devices, dedupes by id, sorts newest first, and caps at 30', () => {
    const snap = (id: string, at: number) => ({ id, at, label: id, cardCount: 1, cards: [{ name: 'Sol Ring', qty: 1 }] });
    const mine: SyncData = {
      ...data([]),
      history: { '1|atraxa': [snap('s1', 100), snap('s3', 300)] },
    };
    const theirs: SyncData = {
      ...data([]),
      history: {
        '1|atraxa': [snap('s1', 100), snap('s2', 200)],
        '1|krenko': Array.from({ length: 35 }, (_, i) => snap(`k${i}`, i + 1)),
      },
    };
    const out = mergeSync(null, mine, theirs).data.history!;
    expect(out['1|atraxa'].map((s) => s.id)).toEqual(['s3', 's2', 's1']);
    expect(out['1|krenko']).toHaveLength(30);
    expect(out['1|krenko'][0].id).toBe('k34');
  });
});

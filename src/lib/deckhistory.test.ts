import { describe, expect, it } from 'vitest';
import type { Deck } from './db';
import { shortfalls } from './copies';
import { BURST_MS, KEEP_AUTO, KEEP_NAMED, ORPHAN_DAYS, legacyBelongs, overflow, planTidy, wantsAuto, type DeckSnapshot } from './deckhistory';
import { norm } from './names';

const DAY = 86_400_000;
const now = Date.parse('2026-11-25T12:00:00Z');
const cards = (...names: string[]) => names.map((name) => ({ name, qty: 1 }));
const version = (uid: string, at: number, more: Partial<DeckSnapshot> = {}): DeckSnapshot => ({
  id: `deckver:${uid}:${at}`,
  at,
  kind: 'auto',
  uid,
  profile: 1,
  deckName: 'Zombies',
  commander: 'Gisa and Geralf',
  cardCount: 2,
  cards: cards('Gravecrawler', 'Diregraf Colossus'),
  ...more,
});

describe('deck history: one automatic version per editing burst (step 0, Nov 25)', () => {
  const deck = { cards: cards('Gravecrawler', 'Lord of the Undead'), commander: 'Gisa and Geralf', updated: now - 60_000 };

  it('takes the first version of a deck right away', () => {
    expect(wantsAuto(deck, undefined, now)).toBe(true);
  });

  it('skips the edits of a burst: a Forge session of many taps keeps one version, not one per tap', () => {
    expect(wantsAuto(deck, version('u', now - 5 * 60_000), now)).toBe(false); // last change a minute ago
  });

  it('starts a new version when the deck sat untouched longer than a burst', () => {
    expect(wantsAuto({ ...deck, updated: now - BURST_MS }, version('u', now - DAY), now)).toBe(true);
  });

  it('never saves a copy of the newest version', () => {
    const same = version('u', now - DAY, { cards: deck.cards });
    expect(wantsAuto({ ...deck, updated: now - DAY }, same, now)).toBe(false);
  });
});

describe('deck history: what is kept', () => {
  it('keeps the newest automatic and named versions apart, so automatic ones never push a named one out', () => {
    const named = Array.from({ length: KEEP_NAMED + 2 }, (_, i) => version('u', 1000 + i, { kind: 'named', id: `n${i}` }));
    const auto = Array.from({ length: KEEP_AUTO + 30 }, (_, i) => version('u', 5000 + i, { kind: i % 2 ? 'auto' : 'restore', id: `a${i}` }));
    const drop = overflow([...auto, ...named]);
    expect(drop.filter((k) => k.startsWith('n'))).toEqual(['n1', 'n0']); // the two oldest named ones
    expect(drop.filter((k) => k.startsWith('a'))).toHaveLength(30); // the oldest automatic and "before restore" ones
    expect(drop).not.toContain(`a${KEEP_AUTO + 29}`); // the newest stays
  });
});

describe('deck history: never on the wrong deck', () => {
  const decks: Pick<Deck, 'uid' | 'profile' | 'name' | 'commander'>[] = [
    { uid: 'cloud-zombies', profile: 1, name: 'Zombies', commander: 'Gisa and Geralf' },
    { uid: 'tatyova', profile: 1, name: 'Tatyova Lands', commander: 'Tatyova, Benthic Druid' },
  ];

  it('leaves versions alone when their deck is still here, renamed or with a new commander', () => {
    const v = [version('tatyova', now - DAY, { deckName: 'Old name', commander: 'Someone else' })];
    expect(planTidy(decks, v, {}, now)).toEqual({ refile: [], drop: [], since: {} });
  });

  it('refiles versions after a sync gave the same deck another uid (same binder, name and commander)', () => {
    const v = [version('this-device-zombies', now - DAY)];
    expect(planTidy(decks, v, {}, now).refile).toEqual([{ from: 'this-device-zombies', to: 'cloud-zombies' }]);
  });

  it('does not guess between two matching decks, or move versions of another binder', () => {
    const twins = [...decks, { uid: 'zombies-2', profile: 1, name: 'Zombies', commander: 'Gisa and Geralf' }];
    expect(planTidy(twins, [version('gone', now)], {}, now).refile).toEqual([]);
    expect(planTidy(decks, [version('gone', now, { profile: 2 })], {}, now).refile).toEqual([]);
  });

  it('clears versions of a deck that is gone only after 30 days', () => {
    const v = [version('deleted-elsewhere', now - DAY, { deckName: 'Gone deck' })];
    expect(planTidy(decks, v, {}, now)).toEqual({ refile: [], drop: [], since: { 'deleted-elsewhere': now } });
    expect(planTidy(decks, v, { 'deleted-elsewhere': now - (ORPHAN_DAYS - 1) * DAY }, now).drop).toEqual([]);
    expect(planTidy(decks, v, { 'deleted-elsewhere': now - ORPHAN_DAYS * DAY }, now)).toEqual({ refile: [], drop: ['deleted-elsewhere'], since: {} });
  });

  it('moves the old on-device versions of deck number N to that deck only when they still look like it', () => {
    const snaps = [{ at: 1, cards: cards('A', 'B', 'C', 'D') }, { at: 2, cards: cards('A', 'B', 'X', 'Y') }];
    expect(legacyBelongs({ cards: cards('A', 'B', 'Q') }, snaps)).toBe(true); // the newest shares half its cards
    expect(legacyBelongs({ cards: cards('Q', 'R', 'S') }, snaps)).toBe(false); // after a Pull, number N is another deck
    expect(legacyBelongs(undefined, snaps)).toBe(false);
  });
});

describe('deck history: a restore never changes ownership', () => {
  it('the over-ownership alert is worked out from the restored list like any other edit', () => {
    const owned = new Map([[norm('Sol Ring'), 1]]);
    const other = { name: 'Other', cards: cards('Sol Ring') };
    const before = { name: 'Zombies', cards: cards('Gravecrawler') };
    const restored = { ...before, cards: version('u', 1, { cards: cards('Sol Ring', 'Gravecrawler') }).cards };
    expect(shortfalls([other, before], owned)).toEqual([]);
    expect(shortfalls([other, restored], owned).map((s) => [s.name, s.short])).toEqual([['Sol Ring', 1]]);
  });
});

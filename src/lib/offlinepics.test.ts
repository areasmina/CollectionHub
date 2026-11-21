import { describe, expect, it } from 'vitest';
import { AHEAD, clearPics, deckPics, goodConnection, MAX_AHEAD, picCounts, saveAhead, SEEN, smallOf, type PicDeps } from './offlinepics';

const U = (n: number, size = 'small') => `https://cards.scryfall.io/${size}/front/0/0/${n}.jpg`;

function world(opts: { failAt?: number; offlineAt?: number } = {}) {
  const store = new Map<string, Map<string, Response>>();
  const ls = new Map<string, string>();
  let fetched = 0;
  let t = 1_000_000_000;
  const d: PicDeps = {
    open: async (name) => {
      if (!store.has(name)) store.set(name, new Map());
      const m = store.get(name)!;
      return {
        keys: async () => [...m.keys()].map((url) => ({ url }) as Request),
        match: async (url: RequestInfo | URL) => m.get(String(url)),
        put: async (url: RequestInfo | URL, r: Response) => void m.set(String(url), r),
        delete: async (url: RequestInfo | URL) => m.delete(String(url)),
      } as unknown as Cache;
    },
    fetch: async () => {
      fetched++;
      if (opts.offlineAt && fetched >= opts.offlineAt) throw new TypeError('Failed to fetch');
      return new Response('x', { status: opts.failAt === fetched ? 404 : 200 });
    },
    now: () => t,
    get: (k) => ls.get(k) ?? null,
    set: (k, v) => void ls.set(k, v),
  };
  return { d, store, ls, fetched: () => fetched, later: (ms: number) => (t += ms) };
}

describe('offline card pictures', () => {
  it('turns any Scryfall card picture into its small one, and leaves other pictures alone', () => {
    expect(smallOf(U(1, 'normal'))).toBe(U(1));
    expect(smallOf(U(1, 'art_crop'))).toBe(U(1));
    expect(smallOf(U(1))).toBe(U(1));
    expect(smallOf('/card-spin.webp')).toBe('');
    expect(smallOf(undefined)).toBe('');
  });

  it('never downloads ahead on mobile data, data saver, a slow line or offline', () => {
    expect(goodConnection(true, undefined)).toBe(true);
    expect(goodConnection(true, { type: 'wifi', effectiveType: '4g' })).toBe(true);
    expect(goodConnection(false, { type: 'wifi' })).toBe(false);
    expect(goodConnection(true, { type: 'cellular', effectiveType: '4g' })).toBe(false);
    expect(goodConnection(true, { saveData: true })).toBe(false);
    expect(goodConnection(true, { effectiveType: '2g' })).toBe(false);
  });

  it('saves each deck card once, then not again the same day', async () => {
    const w = world();
    const r = await saveAhead([U(1, 'normal'), U(2), U(2), U(3)], w.d, { batch: 2 });
    expect(r).toMatchObject({ saved: 3, removed: 0 });
    expect([...w.store.get(AHEAD)!.keys()].sort()).toEqual([U(1), U(2), U(3)]);
    expect((await saveAhead([U(1), U(4)], w.d)).skipped).toBe(true);
    expect(w.fetched()).toBe(3);
    // next day: only the new card is fetched, the sold one is forgotten
    w.later(864e5 + 1);
    const r2 = await saveAhead([U(1), U(2), U(3), U(4)].filter((u) => u !== U(2)), w.d);
    expect(r2).toMatchObject({ saved: 1, removed: 1 });
    expect([...w.store.get(AHEAD)!.keys()].sort()).toEqual([U(1), U(3), U(4)]);
    expect(w.fetched()).toBe(4);
  });

  it('a picture Scryfall refuses is skipped; going offline stops quietly and tries again next time', async () => {
    const w = world({ failAt: 2 });
    expect(await saveAhead([U(1), U(2), U(3)], w.d, { batch: 1 })).toMatchObject({ saved: 2 });
    const off = world({ offlineAt: 2 });
    const r = await saveAhead([U(1), U(2), U(3)], off.d, { batch: 1 });
    expect(r).toMatchObject({ saved: 1, stopped: true });
    expect(off.ls.get('ch:pics:at')).toBeUndefined(); // not marked done: the next open carries on
  });

  it('keeps at most MAX_AHEAD pictures ahead', async () => {
    const w = world();
    const r = await saveAhead(Array.from({ length: MAX_AHEAD + 5 }, (_, i) => U(i)), w.d, { batch: 500 });
    expect(r.saved).toBe(MAX_AHEAD);
  });

  it('moves a picture already kept from looking at it, instead of downloading or storing it twice', async () => {
    const w = world();
    await (await w.d.open(SEEN)).put(U(1), new Response('seen'));
    expect(await saveAhead([U(1), U(2)], w.d)).toMatchObject({ saved: 2 });
    expect(w.fetched()).toBe(1); // only U(2)
    expect([...w.store.get(AHEAD)!.keys()].sort()).toEqual([U(1), U(2)]);
    expect(w.store.get(SEEN)!.has(U(1))).toBe(false);
    expect(await (await w.store.get(AHEAD)!.get(U(1))!).text()).toBe('seen');
    // one kept as seen while the save ran (the screen loaded it meanwhile) is not left in both
    w.later(864e5 + 1);
    await (await w.d.open(SEEN)).put(U(2), new Response('seen again'));
    await saveAhead([U(1), U(2)], w.d);
    expect(w.store.get(SEEN)!.size).toBe(0);
  });

  it('lists each deck card once, the printing you own first, decks you play before decks put away', () => {
    const key = (n: string) => n.toLowerCase();
    const decks = [
      { inactive: true, commander: 'Old Boss', cards: [{ name: 'Shelved Card' }, { name: 'Sol Ring' }] },
      { commander: 'Tatyova', partner: 'Kodama', cards: [{ name: 'Sol Ring' }, { name: 'Unknown Card' }, { name: 'tatyova' }] },
    ];
    const owned = new Map([['sol ring', 'own-sol']]);
    const known = new Map([['tatyova', 'k-tat'], ['kodama', 'k-kod'], ['sol ring', 'other-sol'], ['old boss', 'k-old'], ['shelved card', 'k-shelf']]);
    expect(deckPics(decks, owned, known, key)).toEqual(['k-tat', 'k-kod', 'own-sol', 'k-old', 'k-shelf']);
  });

  it('counts and clears only the picture caches', async () => {
    const w = world();
    await saveAhead([U(1), U(2)], w.d);
    expect((await picCounts(w.d.open))[AHEAD]).toBe(2);
    const gone: string[] = [];
    await clearPics(async (n) => (gone.push(n), w.store.delete(n)), w.d.set);
    expect(gone).toEqual(['ch-pics', 'ch-pics-art', 'ch-pics-big', 'ch-symbols', AHEAD]);
    expect(w.ls.get('ch:pics:at')).toBe('0');
  });
});

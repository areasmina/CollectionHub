/** Card pictures on this device (Phase 5B, made lighter Nov 21: about 100 MB at most, Guillermo's choice).
 *
 *  Two layers, both kept by the browser's Cache Storage:
 *  - every picture you look at is kept by the service worker (vite.config.ts → runtimeCaching), capped and oldest-first;
 *  - the small picture of every card in your DECKS is saved ahead of time, on Wi-Fi only, into its own cache, so your
 *    decks show offline at the table. That cache is never trimmed by the cap; it is matched to your decks each time.
 *    A picture already kept from looking at it is moved there, not downloaded or stored a second time.
 *    (Until Nov 21 this saved every OWNED card, up to 5,000 / ~80 MB. The cache keeps its old name, so on each phone the
 *    next run simply forgets the pictures of owned cards that are in no deck.)
 *
 *  Nothing here touches your binders or decks: it only stores pictures, and CLEAR removes only pictures. */

export const SEEN = 'ch-pics';
export const AHEAD = 'ch-pics-owned';
export const CACHES = [SEEN, 'ch-pics-art', 'ch-pics-big', 'ch-symbols', AHEAD];
const LAST = 'ch:pics:at';
const DAY = 864e5;
/** Small pictures are ~16 KB (measured Nov 20): 1,000 deck cards ≈ 16 MB (about ten decks). Past that, active decks
 *  come first and the rest wait. */
export const MAX_AHEAD = 1000;

export interface PicDeck {
  commander?: string;
  partner?: string;
  inactive?: boolean;
  cards: { name: string }[];
}
/** The pictures to save ahead: every card of your decks once, decks you play (light on) first. Each name gets the
 *  picture of the printing you own when you own one (`owned`), else any known printing (`known`), else none. */
export function deckPics(decks: PicDeck[], owned: Map<string, string>, known: Map<string, string>, key: (name: string) => string) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of [...decks.filter((d) => !d.inactive), ...decks.filter((d) => d.inactive)])
    for (const name of [d.commander, d.partner, ...d.cards.map((c) => c.name)]) {
      if (!name) continue;
      const k = key(name);
      if (seen.has(k)) continue;
      seen.add(k);
      const img = owned.get(k) || known.get(k);
      if (img) out.push(img);
    }
  return out;
}

/** The small Scryfall picture of a card ('' when it has none). Cards store the small URL already. */
export const smallOf = (img?: string) => (img && img.startsWith('https://cards.scryfall.io/') ? img.replace(/\/(normal|large|png|art_crop|border_crop)\//, '/small/') : '');

interface Conn {
  saveData?: boolean;
  type?: string;
  effectiveType?: string;
}
/** May we download pictures ahead now? Never on mobile data, data saver or a slow line; unknown connection = yes. */
export function goodConnection(online: boolean, c?: Conn | null) {
  if (!online) return false;
  if (!c) return true; // Safari, Firefox: they don't say
  if (c.saveData) return false;
  if (c.type === 'cellular') return false;
  return !['slow-2g', '2g', '3g'].includes(c.effectiveType ?? '');
}

export interface PicDeps {
  open: (name: string) => Promise<Pick<Cache, 'keys' | 'match' | 'put' | 'delete'>>;
  fetch: (url: string) => Promise<Response>;
  now: () => number;
  get: (k: string) => string | null;
  set: (k: string, v: string) => void;
}

/** Saves the small pictures of `imgs` (your deck cards) that aren't saved yet, a few at a time, and forgets the ones of
 *  cards no longer in a deck. One already kept from looking at it is moved over instead of downloaded again. Runs at
 *  most once a day (unless `force`). Stops at the first failure (gone offline). */
export async function saveAhead(imgs: string[], d: PicDeps, opts: { force?: boolean; batch?: number; onProgress?: (done: number, total: number) => void } = {}) {
  if (!opts.force && d.now() - Number(d.get(LAST) || 0) < DAY) return { saved: 0, removed: 0, skipped: true as const };
  const want = [...new Set(imgs.map(smallOf).filter(Boolean))].slice(0, MAX_AHEAD);
  const wanted = new Set(want);
  const cache = await d.open(AHEAD);
  const seenCache = await d.open(SEEN);
  const have = new Set((await cache.keys()).map((r) => r.url));
  let removed = 0;
  for (const url of have)
    if (!wanted.has(url)) {
      await cache.delete(url);
      removed++;
    }
  const need = want.filter((u) => !have.has(u));
  const batch = opts.batch ?? 6;
  let saved = 0;
  for (let i = 0; i < need.length; i += batch) {
    const got = await Promise.all(
      need.slice(i, i + batch).map(async (url) => {
        try {
          const kept = await seenCache.match(url);
          if (kept) {
            await cache.put(url, kept);
            await seenCache.delete(url);
            return true;
          }
          const r = await d.fetch(url);
          if (!r.ok) return false;
          await cache.put(url, r);
          return true;
        } catch {
          return null; // no answer at all: offline now
        }
      }),
    );
    saved += got.filter(Boolean).length;
    opts.onProgress?.(saved, need.length);
    if (got.includes(null)) return { saved, removed, skipped: false as const, stopped: true };
  }
  // A picture the screen loaded while this ran may have just been kept as seen too: one copy is enough.
  const keptAhead = new Set((await cache.keys()).map((r) => r.url));
  for (const r of await seenCache.keys()) if (keptAhead.has(r.url)) await seenCache.delete(r.url);
  d.set(LAST, String(d.now()));
  return { saved, removed, skipped: false as const };
}

/** How many pictures this device keeps, per cache. */
export async function picCounts(open: PicDeps['open']) {
  const out: Record<string, number> = {};
  for (const name of CACHES) out[name] = (await (await open(name)).keys()).length;
  return out;
}

/** Removes every saved card picture (nothing else). The next look downloads them again. */
export async function clearPics(del: (name: string) => Promise<boolean>, set: PicDeps['set']) {
  for (const name of CACHES) await del(name);
  set(LAST, '0');
}

/** The browser's own pieces, for the app. Null when this browser has no Cache Storage (then nothing is saved ahead). */
export function browserDeps(): PicDeps | null {
  if (typeof caches === 'undefined') return null;
  return {
    open: (n) => caches.open(n),
    fetch: (url) => fetch(url, { mode: 'cors', credentials: 'omit' }),
    now: () => Date.now(),
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        /* private mode: it just runs again next time */
      }
    },
  };
}

/** Saves your deck cards' pictures in the background when the connection is good. Safe to call often. */
let running = false;
export async function saveAheadSoon(imgs: () => Promise<string[]>) {
  const d = browserDeps();
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (!d || running || !nav || !goodConnection(nav.onLine, (nav as Navigator & { connection?: Conn }).connection)) return;
  running = true;
  try {
    if (d.now() - Number(d.get(LAST) || 0) < DAY) return undefined; // already done today: no need to read the decks
    return await saveAhead(await imgs(), d);
  } catch {
    return undefined; // storage full or refused: pictures still load from Scryfall as before
  } finally {
    running = false;
  }
}

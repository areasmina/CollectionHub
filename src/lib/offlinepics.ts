/** Card pictures on this device (Phase 5B).
 *
 *  Two layers, both kept by the browser's Cache Storage:
 *  - every picture you look at is kept by the service worker (vite.config.ts → runtimeCaching), capped and oldest-first;
 *  - the small picture of every card you OWN is saved ahead of time, on Wi-Fi only, into its own cache ('ch-pics-owned'),
 *    so your whole binder shows offline. That cache is never trimmed by the cap; it is matched to your binders each time.
 *
 *  Nothing here touches your binders or decks: it only stores pictures, and CLEAR removes only pictures. */

export const OWNED = 'ch-pics-owned';
export const CACHES = ['ch-pics', 'ch-pics-art', 'ch-pics-big', 'ch-symbols', OWNED];
const LAST = 'ch:pics:at';
const DAY = 864e5;
/** Small pictures are ~16 KB (measured Nov 20): 5,000 owned printings ≈ 80 MB. Past that, only the first 5,000 are saved ahead. */
export const MAX_OWNED = 5000;

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

/** Saves the small pictures of `imgs` (your owned cards) that aren't saved yet, a few at a time, and forgets the ones
 *  of cards you no longer own. Runs at most once a day (unless `force`). Stops at the first failure (gone offline). */
export async function saveOwned(imgs: string[], d: PicDeps, opts: { force?: boolean; batch?: number; onProgress?: (done: number, total: number) => void } = {}) {
  if (!opts.force && d.now() - Number(d.get(LAST) || 0) < DAY) return { saved: 0, removed: 0, skipped: true as const };
  const want = [...new Set(imgs.map(smallOf).filter(Boolean))].slice(0, MAX_OWNED);
  const wanted = new Set(want);
  const cache = await d.open(OWNED);
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

/** Saves your owned cards' pictures in the background when the connection is good. Safe to call often. */
let running = false;
export async function saveOwnedSoon(imgs: string[]) {
  const d = browserDeps();
  const nav = typeof navigator !== 'undefined' ? navigator : undefined;
  if (!d || running || !nav || !goodConnection(nav.onLine, (nav as Navigator & { connection?: Conn }).connection)) return;
  running = true;
  try {
    return await saveOwned(imgs, d);
  } catch {
    return undefined; // storage full or refused: pictures still load from Scryfall as before
  } finally {
    running = false;
  }
}

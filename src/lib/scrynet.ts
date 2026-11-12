/** Polite, patient talking to Scryfall: one paced queue for the whole app, and a failed request waits and tries again
 *  instead of giving up. A big collection import is hundreds of requests in a row, so one refused request must never
 *  end it.
 *
 *  Scryfall's limits: the heavy endpoints (/cards/collection, /cards/search, /cards/named…) take 2 requests a second,
 *  everything else 10. Going over answers 429 and, when it keeps happening, a temporary ban. */
export interface NetDeps {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<unknown>;
  now: () => number;
}
export interface ReqOpts {
  /** How many times to ask before giving up (default 2: quick answer for a screen; an import asks for more). */
  tries?: number;
  /** Told when the queue has to wait before trying again (ms). */
  onWait?: (ms: number) => void;
}

const HEAVY = /\/cards\/(collection|search|named|random|autocomplete)/;
export const HEAVY_GAP = 520; // just under 2 a second
export const LIGHT_GAP = 110; // just under 10 a second
const MAX_GAP = 2000;
/** Waits before the 2nd, 3rd… try: refused for going too fast (429), or no answer at all. */
const WAIT_429 = [5000, 10000, 20000, 40000, 60000];
const WAIT_DOWN = [1500, 4000, 8000, 16000, 30000];
const at = (list: number[], i: number) => list[Math.min(i, list.length - 1)];

export function scryfallClient(deps: NetDeps) {
  let nextSlot = 0; // when the next request may start
  let pausedUntil = 0; // nobody asks before this (Scryfall refused, or didn't answer)
  let slow = 1; // grows when Scryfall says we go too fast, eases back after answers

  /** Reserves the next start time, so callers running side by side never burst. */
  async function takeSlot(url: string) {
    const now = deps.now();
    const start = Math.max(now, nextSlot);
    nextSlot = start + Math.min(MAX_GAP, (HEAVY.test(url) ? HEAVY_GAP : LIGHT_GAP) * slow);
    if (start > now) await deps.sleep(start - now);
    // A refusal that arrived meanwhile pauses the callers already in line as well.
    while (deps.now() < pausedUntil) await deps.sleep(pausedUntil - deps.now());
  }

  async function req(url: string, init: RequestInit = {}, opts: ReqOpts = {}): Promise<any> {
    const tries = opts.tries ?? 2;
    let status: number | undefined;
    let last = 'Could not reach Scryfall (offline, or rate-limited: wait a minute)';
    for (let n = 0; n < tries; n++) {
      await takeSlot(url);
      const signal = typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal ? AbortSignal.timeout(20000) : undefined;
      // Browsers don't let pages set User-Agent; Scryfall accepts the browser's own one with an Accept header.
      const r = await deps.fetch(url, { ...init, signal, headers: { ...init.headers, Accept: 'application/json' } }).catch(() => null);
      if (r && r.status !== 429 && r.status < 500) {
        slow = Math.max(1, slow * 0.97);
        if (r.status === 404) return { data: [] }; // search with no results
        if (r.status === 400 || r.status === 422) return { data: [], badBatch: true };
        if (!r.ok) throw new Error(`Scryfall answered ${r.status}`);
        return r.json();
      }
      status = r?.status;
      if (r) last = r.status === 429 ? 'Scryfall is rate-limiting this connection: wait a minute' : `Scryfall answered ${r.status}`;
      if (n === tries - 1) break;
      // Refused or silent: everyone in the queue waits (a refusal that reaches the browser without its headers looks
      // just like being offline, so both slow the pace down).
      const asked = Number(r?.headers.get('Retry-After'));
      const wait = r?.status === 429 ? Math.min(120000, asked > 0 ? asked * 1000 : at(WAIT_429, n)) : at(WAIT_DOWN, n);
      if (!r || r.status === 429) slow = Math.min(4, slow * 1.5);
      pausedUntil = Math.max(pausedUntil, deps.now() + wait);
      nextSlot = Math.max(nextSlot, deps.now() + wait);
      opts.onWait?.(wait);
    }
    throw Object.assign(new Error(last), { status }); // status: what Scryfall last answered; undefined when nothing came back
  }
  return { req };
}

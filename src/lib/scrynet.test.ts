import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HEAVY_GAP, scryfallClient } from './scrynet';

/** Vitest's fake clock and a scripted Scryfall: no real waiting. `run` lets the clock race ahead until the work is done. */
function world(answer: (n: number, url: string) => Response | null) {
  const starts: number[] = [];
  const client = scryfallClient({
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    fetch: async (url) => {
      starts.push(Date.now());
      const r = answer(starts.length, url);
      if (!r) throw new TypeError('Failed to fetch');
      return r;
    },
  });
  const run = async <T>(work: Promise<T>): Promise<T> => {
    const settled = work.then((v) => ({ v }), (e) => ({ e }));
    await vi.runAllTimersAsync();
    const out: any = await settled;
    if ('e' in out) throw out.e;
    return out.v;
  };
  return { client, starts, run, time: () => Date.now() };
}
beforeEach(() => void vi.useFakeTimers({ now: 0 }));
afterEach(() => void vi.useRealTimers());
const ok = () => new Response(JSON.stringify({ data: [1] }), { status: 200 });
const COLLECTION = 'https://api.scryfall.com/cards/collection';

describe('talking to Scryfall', () => {
  it('keeps the heavy endpoints under 2 requests a second, even when asked side by side', async () => {
    const w = world(ok);
    await w.run(Promise.all(Array.from({ length: 10 }, () => w.client.req(COLLECTION, { method: 'POST' }))));
    for (let i = 1; i < w.starts.length; i++) expect(w.starts[i] - w.starts[i - 1]).toBeGreaterThanOrEqual(HEAVY_GAP);
  });

  it('lets light endpoints go faster', async () => {
    const w = world(ok);
    await w.run(Promise.all(Array.from({ length: 10 }, () => w.client.req('https://api.scryfall.com/sets'))));
    expect(w.time()).toBeLessThan(1500);
  });

  it('a 429 waits as long as Scryfall asks (Retry-After) and then gets the answer', async () => {
    const waits: number[] = [];
    const w = world((n) => (n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '30' } }) : ok()));
    const res = await w.run(w.client.req(COLLECTION, { method: 'POST' }, { tries: 7, onWait: (ms) => waits.push(ms) }));
    expect(res.data).toEqual([1]);
    expect(waits).toEqual([30000]);
    expect(w.starts[1] - w.starts[0]).toBeGreaterThanOrEqual(30000);
  });

  it('a long refusal (429 five times, then silence) is outlasted when the caller allows enough tries', async () => {
    const w = world((n) => (n <= 5 ? new Response('', { status: 429 }) : n === 6 ? null : ok()));
    const res = await w.run(w.client.req(COLLECTION, { method: 'POST' }, { tries: 8 }));
    expect(res.data).toEqual([1]);
    expect(w.starts).toHaveLength(7);
  });

  it('after a refusal the pace slows down, then eases back', async () => {
    const w = world((n) => (n === 1 ? new Response('', { status: 429 }) : ok()));
    await w.run(w.client.req(COLLECTION, {}, { tries: 3 }));
    await w.run(w.client.req(COLLECTION));
    await w.run(w.client.req(COLLECTION));
    expect(w.starts[3] - w.starts[2]).toBeGreaterThan(HEAVY_GAP * 1.3);
  });

  it('while one caller waits out a refusal, the others wait too (no hammering)', async () => {
    const w = world((n) => (n === 1 ? new Response('', { status: 429, headers: { 'Retry-After': '20' } }) : ok()));
    await w.run(Promise.all([w.client.req(COLLECTION, {}, { tries: 3 }), w.client.req(COLLECTION), w.client.req(COLLECTION)]));
    // nothing starts during the 20 seconds Scryfall asked for
    expect(w.starts.filter((s) => s > 0 && s < 20000)).toHaveLength(0);
    expect(w.starts).toHaveLength(4);
  });

  it('gives up with a clear message once the tries run out', async () => {
    const w = world(() => null);
    await expect(w.run(w.client.req(COLLECTION, {}, { tries: 3 }))).rejects.toThrow(/Could not reach Scryfall/);
    expect(w.starts).toHaveLength(3);
  });

  it('keeps the old meanings: 404 is an empty search, 400/422 a bad batch', async () => {
    const a = world(() => new Response('', { status: 404 }));
    expect(await a.run(a.client.req(COLLECTION))).toEqual({ data: [] });
    const b = world(() => new Response('', { status: 422 }));
    expect((await b.run(b.client.req(COLLECTION))).badBatch).toBe(true);
  });
});

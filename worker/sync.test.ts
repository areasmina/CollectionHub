import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS worker module
import worker, { SyncBox } from './sync.js';
const MAX_BYTES = SyncBox.MAX_BYTES;

/** In-memory stand-in for a Durable Object's storage. */
function fakeStorage() {
  const m = new Map<string, unknown>();
  const s = {
    m,
    async get(k: string | string[]) {
      return Array.isArray(k) ? new Map(k.filter((x) => m.has(x)).map((x) => [x, m.get(x)])) : m.get(k);
    },
    async put(k: string | Record<string, unknown>, v?: unknown) {
      if (typeof k === 'string') m.set(k, v);
      else for (const [a, b] of Object.entries(k)) m.set(a, b);
    },
    async delete(k: string | string[]) {
      for (const x of Array.isArray(k) ? k : [k]) m.delete(x);
    },
    async deleteAll() {
      m.clear();
    },
    async transaction(f: (tx: typeof s) => Promise<void>) {
      await f(s);
    },
  };
  return s;
}
function env() {
  const boxes = new Map<string, SyncBox>();
  return {
    BOX: {
      idFromName: (n: string) => n,
      get: (n: string) => {
        if (!boxes.has(n)) boxes.set(n, new SyncBox({ storage: fakeStorage() }));
        return boxes.get(n)!;
      },
    },
  };
}
const ID = 'a'.repeat(64);
const call = (e: ReturnType<typeof env>, method: string, path = '', init: RequestInit & { base?: number } = {}) =>
  worker.fetch(new Request(`https://x/v1/${ID}${path}`, { method, ...init, headers: { ...(init.base !== undefined ? { 'X-Base-Version': String(init.base) } : {}) } }), e);

describe('sync worker', () => {
  it('saves, reads back and counts versions', async () => {
    const e = env();
    expect(await (await call(e, 'GET', '/version')).json()).toEqual({ v: 0 });
    expect((await call(e, 'GET')).status).toBe(404);
    expect(await (await call(e, 'PUT', '', { body: new Uint8Array([1, 2, 3]), base: 0 })).json()).toEqual({ v: 1 });
    const r = await call(e, 'GET');
    expect(r.headers.get('X-Version')).toBe('1');
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([1, 2, 3]);
    expect(await (await call(e, 'GET', '/version')).json()).toEqual({ v: 1 });
  });
  it('refuses a save based on an old version (another device saved first)', async () => {
    const e = env();
    await call(e, 'PUT', '', { body: new Uint8Array([1]), base: 0 });
    await call(e, 'PUT', '', { body: new Uint8Array([2]), base: 1 });
    const r = await call(e, 'PUT', '', { body: new Uint8Array([3]), base: 1 });
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ v: 2 });
    expect((await call(e, 'PUT', '', { body: new Uint8Array([3]) })).status).toBe(400); // no base version at all
  });
  it('keeps the previous copy as a backup', async () => {
    const e = env();
    await call(e, 'PUT', '', { body: new Uint8Array([1]), base: 0 });
    await call(e, 'PUT', '', { body: new Uint8Array([2]), base: 1 });
    await call(e, 'PUT', '', { body: new Uint8Array([3]), base: 2 });
    const p = await call(e, 'GET', '/prev');
    expect(p.headers.get('X-Version')).toBe('2');
    expect([...new Uint8Array(await p.arrayBuffer())]).toEqual([2]);
  });
  it('stores big snapshots in chunks', async () => {
    const e = env();
    const big = new Uint8Array(2.5 * 1024 * 1024).map((_, i) => i % 251);
    await call(e, 'PUT', '', { body: big, base: 0 });
    const back = new Uint8Array(await (await call(e, 'GET')).arrayBuffer());
    expect(back.length).toBe(big.length);
    expect(back[2 * 1024 * 1024 + 7]).toBe(big[2 * 1024 * 1024 + 7]);
  });
  it('rejects too big, bad ids and retired codes', async () => {
    const e = env();
    expect((await call(e, 'PUT', '', { body: new Uint8Array(MAX_BYTES + 1), base: 0 })).status).toBe(413);
    expect((await worker.fetch(new Request('https://x/v1/not-a-hash'), e)).status).toBe(404);
    await call(e, 'PUT', '', { body: new Uint8Array([1]), base: 0 });
    expect((await call(e, 'DELETE')).status).toBe(200);
    expect((await call(e, 'GET')).status).toBe(410);
    expect((await call(e, 'PUT', '', { body: new Uint8Array([1]), base: 0 })).status).toBe(410);
  });
  it('limits saves per sync code and says when to try again', async () => {
    const e = env();
    for (let v = 0; v < SyncBox.SAVES_PER_WINDOW; v++) expect((await call(e, 'PUT', '', { body: new Uint8Array([1]), base: v })).status).toBe(200);
    const r = await call(e, 'PUT', '', { body: new Uint8Array([1]), base: SyncBox.SAVES_PER_WINDOW });
    expect(r.status).toBe(429);
    expect(Number(r.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect((await call(e, 'GET')).status).toBe(200); // reading still works
  });
  it('limits requests per address when the rate-limit bindings are there', async () => {
    const seen: string[] = [];
    const limiter = (max: number) => {
      let n = 0;
      return { limit: async ({ key }: { key: string }) => (seen.push(key), { success: ++n <= max }) };
    };
    const e = { ...env(), READS: limiter(2), WRITES: limiter(1) };
    const from = (method: string, init: RequestInit = {}) =>
      worker.fetch(new Request(`https://x/v1/${ID}${method === 'GET' ? '/version' : ''}`, { method, ...init, headers: { 'CF-Connecting-IP': '203.0.113.7', 'X-Base-Version': '0' } }), e);
    expect((await from('GET')).status).toBe(200);
    expect((await from('GET')).status).toBe(200);
    expect((await from('GET')).status).toBe(429);
    expect((await from('PUT', { body: new Uint8Array([1]) })).status).toBe(200);
    const r = await from('PUT', { body: new Uint8Array([1]) });
    expect(r.status).toBe(429);
    expect(r.headers.get('Retry-After')).toBe('60');
    expect(new Set(seen)).toEqual(new Set(['203.0.113.7']));
  });
});

// CollectionHub sync server. It never sees a sync code or readable data: the app sends a storage id (a hash of the code)
// and a snapshot it already encrypted with a key made from the code.
//
//   GET    /v1/<id>          -> the snapshot (bytes), header X-Version; 404 when there is none, 410 when the code was retired
//   GET    /v1/<id>/version  -> {v} (0 = nothing saved yet), the cheap "did another device save?" check
//   GET    /v1/<id>/prev     -> the copy before the last save (a server-side backup), header X-Version
//   PUT    /v1/<id>          -> save; header X-Base-Version = the version this save replaces (0 = first save).
//                               {v} on success, 409 {v} when another device saved first, 413 when too big
//   DELETE /v1/<id>          -> retire the code (used by "Change code"): data removed, later saves refused with 410
//
// Limits (429 + Retry-After when passed), so nobody can use the service as free storage or hammer it:
//   per address: READS / WRITES rate-limit bindings (wrangler.toml), counted by Cloudflare at the edge;
//   per sync code: SAVES_PER_WINDOW saves in WINDOW_MS, counted inside the code's own Durable Object.

const MAX_BYTES = 10 * 1024 * 1024; // one snapshot (encrypted, gzipped); a 10,000-card binder is well under 1 MB
const CHUNK = 1024 * 1024; // Durable Object values are limited to 2 MB each
const WINDOW_MS = 10 * 60 * 1000;
const SAVES_PER_WINDOW = 120; // the app saves a few seconds after an edit: a long editing session stays far below this
const ID_RE = /^[0-9a-f]{64}$/;
const CORS = {
  'Access-Control-Allow-Origin': '*', // the data is encrypted; any origin may hold a copy of the app
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Base-Version',
  'Access-Control-Expose-Headers': 'X-Version, Retry-After',
  'Access-Control-Max-Age': '86400',
};
const NC = { ...CORS, 'Cache-Control': 'no-store' };
const json = (body, status = 200, extra = {}) => Response.json(body, { status, headers: { ...NC, ...extra } });
const slow = (seconds) => json({ error: 'slow down', retry: seconds }, 429, { 'Retry-After': String(seconds) });

/** Splits bytes into chunk records: {c0: Uint8Array, c1: …}. */
function chunk(prefix, bytes) {
  const out = {};
  for (let i = 0, n = 0; i < bytes.length || n === 0; i += CHUNK, n++) out[prefix + n] = bytes.slice(i, i + CHUNK);
  return out;
}
const join = (parts) => {
  const all = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) all.set(p, o), (o += p.length);
  return all;
};

// (Workers allow only handlers and Durable Object classes as named exports, so the limit is shared as SyncBox.MAX_BYTES.)
export class SyncBox {
  static MAX_BYTES = MAX_BYTES;
  static SAVES_PER_WINDOW = SAVES_PER_WINDOW;
  constructor(ctx) {
    this.storage = ctx.storage;
  }
  async read(meta, prefix) {
    const keys = Array.from({ length: meta.n }, (_, i) => prefix + i);
    const got = await this.storage.get(keys);
    return join(keys.map((k) => new Uint8Array(got.get(k))));
  }
  // Each request runs to the end before the next starts (no outside calls in between), so check-then-save is safe.
  async fetch(req) {
    const url = new URL(req.url);
    const part = url.pathname.split('/')[3] || '';
    const meta = await this.storage.get('meta'); // {v, n, size, at}
    if (await this.storage.get('gone')) return json({ error: 'gone' }, 410);
    if (req.method === 'GET') {
      if (part === 'version') return json({ v: meta?.v ?? 0 });
      const m = part === 'prev' ? await this.storage.get('pmeta') : meta;
      if (!m) return json({ error: 'not found' }, 404);
      const body = await this.read(m, part === 'prev' ? 'p' : 'c');
      return new Response(body, { headers: { ...NC, 'Content-Type': 'application/octet-stream', 'X-Version': String(m.v) } });
    }
    if (req.method === 'PUT') {
      const base = Number(req.headers.get('X-Base-Version') ?? NaN);
      if (!Number.isInteger(base) || base < 0) return json({ error: 'X-Base-Version missing' }, 400);
      const v = meta?.v ?? 0;
      if (base !== v) return json({ error: 'changed', v }, 409);
      const bytes = new Uint8Array(await req.arrayBuffer());
      if (!bytes.length) return json({ error: 'empty' }, 400);
      // Saves per sync code: a fixed window, kept beside the data (cleared with it when the code is retired).
      const now = Date.now();
      const seen = await this.storage.get('rate');
      const rate = seen && now - seen.t < WINDOW_MS ? seen : { t: now, n: 0 };
      if (rate.n >= SAVES_PER_WINDOW) return slow(Math.max(1, Math.ceil((rate.t + WINDOW_MS - now) / 1000)));
      await this.storage.put('rate', { t: rate.t, n: rate.n + 1 });
      if (bytes.length > MAX_BYTES) return json({ error: 'too big', max: MAX_BYTES }, 413);
      const next = { v: v + 1, n: Math.max(1, Math.ceil(bytes.length / CHUNK)), size: bytes.length, at: Date.now() };
      await this.storage.transaction(async (tx) => {
        // The current copy becomes the backup, then the new one is written.
        const pm = await tx.get('pmeta');
        if (pm) await tx.delete(Array.from({ length: pm.n }, (_, i) => 'p' + i));
        if (meta) {
          const cur = await this.read(meta, 'c');
          await tx.put({ ...chunk('p', cur), pmeta: meta });
          await tx.delete(Array.from({ length: meta.n }, (_, i) => 'c' + i));
        }
        await tx.put({ ...chunk('c', bytes), meta: next });
      });
      return json({ v: next.v });
    }
    if (req.method === 'DELETE') {
      await this.storage.deleteAll();
      await this.storage.put('gone', Date.now());
      return json({ ok: true });
    }
    return json({ error: 'method not allowed' }, 405);
  }
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/') return new Response('CollectionHub sync is running.', { headers: CORS });
    const [, ver, id, part = ''] = url.pathname.split('/');
    if (ver !== 'v1' || !ID_RE.test(id || '') || !['', 'version', 'prev'].includes(part)) return json({ error: 'not found' }, 404);
    if (part && req.method !== 'GET') return json({ error: 'method not allowed' }, 405);
    const len = Number(req.headers.get('Content-Length') || 0);
    if (len > MAX_BYTES) return json({ error: 'too big', max: MAX_BYTES }, 413);
    // Per address, counted at the edge. The bindings are optional: without them (tests, a deploy that lacks them)
    // the per-code limit above still applies.
    const limiter = req.method === 'GET' ? env.READS : env.WRITES;
    if (limiter) {
      const who = req.headers.get('CF-Connecting-IP') || 'unknown';
      const { success } = await limiter.limit({ key: who });
      if (!success) return slow(60);
    }
    return env.BOX.get(env.BOX.idFromName(id)).fetch(req);
  },
};

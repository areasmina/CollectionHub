import { db, type Deck, type Entry, type Profile } from './db';
import { resolveRows } from './scryfall';
import { cleanCode, keysFor, newCode, seal, unseal, type Keys } from './synccode';
import { clearDirty, lastVersion, quietly, setLastVersion, setSyncCode, setSyncState, syncCode } from './syncstate';

/** Device sync with a sync code (no account): this device's binders and decks go up as one encrypted snapshot to the
 *  CollectionHub sync Worker (worker/sync.js). The Worker only sees a hash of the code and bytes it can't read. */
export const SYNC_URL = ((import.meta.env.VITE_SYNC_URL as string | undefined) || 'https://collectionhub-sync.areasmina.workers.dev').replace(/\/$/, '');

/** Another device saved since this device's last sync (the save was refused, nothing was lost). */
export class ChangedElsewhere extends Error {}
/** The code was replaced with a new one on another device ("Change code"), or turned off there. */
export class CodeGone extends Error {
  constructor() {
    super('This sync code was changed on another device. Turn off sync here and link this device with the new code.');
  }
}

export interface Snapshot {
  app: 'collectionhub';
  fmt: 1;
  at: number;
  profiles: Profile[];
  entries: Entry[];
  decks: Deck[];
}

let cached: { code: string; keys: Keys } | null = null;
async function keys(code = syncCode()) {
  if (!code) throw new Error('Sync is off on this device.');
  if (cached?.code !== code) cached = { code, keys: await keysFor(code) };
  return cached.keys;
}

async function call(id: string, path = '', init: RequestInit = {}) {
  let r: Response;
  try {
    r = await fetch(`${SYNC_URL}/v1/${id}${path}`, { cache: 'no-store', ...init });
  } catch {
    throw new Error("Couldn't reach the sync service.");
  }
  if (r.status === 410) throw new CodeGone();
  return r;
}
const failed = async (r: Response) => new Error(r.status === 413 ? 'Your binders and decks are too big to sync (over 10 MB).' : `Sync service answered ${r.status}.`);

/** The cloud copy's version: 0 when nothing was saved under this code yet. */
export async function cloudVersion(code?: string) {
  const r = await call((await keys(code)).id, '/version');
  if (!r.ok) throw await failed(r);
  return ((await r.json()) as { v: number }).v;
}

async function download(code?: string): Promise<{ v: number; snap: Snapshot } | null> {
  const k = await keys(code);
  const r = await call(k.id);
  if (r.status === 404) return null;
  if (!r.ok) throw await failed(r);
  const snap = await unseal<Snapshot>(new Uint8Array(await r.arrayBuffer()), k);
  if (snap?.app !== 'collectionhub' || !Array.isArray(snap.entries)) throw new Error("The cloud copy isn't a CollectionHub snapshot.");
  return { v: Number(r.headers.get('X-Version')), snap };
}

async function snapshot(): Promise<Snapshot> {
  const [profiles, entries, decks] = await Promise.all([db.profiles.toArray(), db.entries.toArray(), db.decks.toArray()]);
  return { app: 'collectionhub', fmt: 1, at: Date.now(), profiles, entries, decks };
}

/** Why a sync would destroy data, or null when it's safe. Counts are card entries + decks. */
export function syncRisk(dir: 'push' | 'pull', local: number, cloud: number): string | null {
  if (dir === 'push' && local === 0 && cloud > 0) return 'This device has no cards or decks, so Push would erase the cloud copy. Pull first (nothing was changed).';
  if (dir === 'pull' && cloud === 0 && local > 0) return 'The cloud copy is empty, so Pull would erase this device. Push from this device first (nothing was changed).';
  return null;
}
const size = (s: Pick<Snapshot, 'entries' | 'decks'>) => s.entries.length + s.decks.length;

/** Saves this device's copy. `base` = the cloud version it replaces (default: the one this device last matched);
 *  `force` replaces whatever is there now ("Keep this device"). */
export async function push(opts: { base?: number; force?: boolean; code?: string } = {}) {
  const started = Date.now();
  const k = await keys(opts.code);
  const snap = await snapshot();
  let base = opts.base ?? lastVersion();
  if (opts.force || (!size(snap) && base === 0)) {
    base = await cloudVersion(opts.code);
    const cloud = base ? await download(opts.code) : null;
    const risk = syncRisk('push', size(snap), cloud ? size(cloud.snap) : 0);
    if (risk) throw new Error(risk);
  }
  const r = await call(k.id, '', { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Base-Version': String(base) }, body: (await seal(snap, k)) as BodyInit });
  if (r.status === 409) throw new ChangedElsewhere('Changed on another device since the last sync.');
  if (!r.ok) throw await failed(r);
  const { v } = (await r.json()) as { v: number };
  setLastVersion(v);
  clearDirty(started);
  return { cards: snap.entries.length, decks: snap.decks.length, v };
}

/** This device's binders and decks as they were before the last Pull. */
const BACKUP = 'backup:before-pull';
export const lastBackup = async () => (await db.edhrec.get(BACKUP))?.at ?? null;
export async function undoPull() {
  const b = (await db.edhrec.get(BACKUP))?.data as { profiles: Profile[]; entries: Entry[]; decks: Deck[] } | undefined;
  if (!b) throw new Error('No backup on this device.');
  await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
    await Promise.all([db.profiles.clear(), db.entries.clear(), db.decks.clear()]);
    await db.profiles.bulkAdd(b.profiles);
    await db.entries.bulkAdd(b.entries);
    await db.decks.bulkAdd(b.decks);
  });
  setLastVersion(null); // this device and the cloud now differ: automatic sync asks which to keep
  return { cards: b.entries.length, decks: b.decks.length };
}

/** Replaces this device's binders and decks with the cloud copy (the old ones are kept for Undo). */
export async function pull(code?: string) {
  const started = Date.now();
  const got = await download(code);
  const local = { profiles: await db.profiles.toArray(), entries: await db.entries.toArray(), decks: await db.decks.toArray() };
  const risk = syncRisk('pull', size(local), got ? size(got.snap) : 0);
  if (risk) throw new Error(risk);
  if (!got) return { cards: 0, decks: 0 };
  const { snap, v } = got;
  await db.edhrec.put({ path: BACKUP, data: local, at: Date.now() });
  await quietly(() =>
    db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
      await Promise.all([db.profiles.clear(), db.entries.clear(), db.decks.clear()]);
      await db.profiles.bulkAdd(snap.profiles);
      await db.entries.bulkAdd(snap.entries);
      await db.decks.bulkAdd(snap.decks);
    }),
  );
  setLastVersion(v);
  clearDirty(started);
  // Card details (type, colours, image) come from Scryfall's cache on this device.
  await resolveRows(snap.entries.map((e) => ({ name: e.name, qty: 1, id: e.cardId })), () => {});
  return { cards: snap.entries.length, decks: snap.decks.length };
}

/** Card and deck fingerprints, the same for this device and the cloud when they hold the same binders and decks. */
const deckKey = (d: Deck) => `${d.profile}|${d.name}|${d.commander ?? ''}|${d.cards.map((c) => `${c.name}:${c.qty}:${c.foil ? 1 : 0}`).join(',')}`;
export const fingerprint = (s: Pick<Snapshot, 'entries' | 'decks'>) =>
  [...s.entries.map((e) => `${e.profile}|${e.cardId}|${e.qty}|${e.foil ? 1 : 0}`)].sort().join('\n') + '\n--\n' + s.decks.map(deckKey).sort().join('\n');
export async function sameAsCloud() {
  const [cloud, entries, decks] = await Promise.all([download(), db.entries.toArray(), db.decks.toArray()]);
  const mine = { entries, decks };
  const theirs = cloud?.snap ?? { entries: [], decks: [] };
  return { same: fingerprint(theirs) === fingerprint(mine), cloudCount: size(theirs), localCount: size(mine) };
}

// ---- turning sync on and off ----

/** First device: a new code, this device's copy goes up. */
export async function turnOn() {
  const code = newCode();
  await push({ base: 0, code });
  setSyncCode(code);
  return code;
}
/** Another device: checks the code exists, then automatic sync takes over (pulls onto an empty device, else asks). */
export async function link(raw: string) {
  const code = cleanCode(raw);
  if (!code) throw new Error("That doesn't look like a sync code (20 letters and numbers).");
  if (!(await cloudVersion(code))) throw new Error("We couldn't find that sync code. Check it on the device that shows it.");
  setLastVersion(null);
  setSyncCode(code);
  return code;
}
/** A new code for the same data (if the old one was shared by mistake). The old code stops working everywhere. */
export async function changeCode() {
  const old = syncCode();
  const fresh = newCode();
  await push({ base: 0, code: fresh });
  setSyncCode(fresh);
  await call((await keysFor(old)).id, '', { method: 'DELETE' }).catch(() => {});
  return fresh;
}
/** This device stops syncing; its binders and decks stay here, the cloud copy stays for the other devices. */
export function turnOff() {
  setSyncCode(null);
  setLastVersion(null);
}

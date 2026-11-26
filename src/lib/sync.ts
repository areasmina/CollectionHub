import { db, type Deck, type Entry, type Profile } from './db';
import { exportAllDeckSnapshots, importAllDeckSnapshots, type DeckSnapshot } from './deckhistory';
import { exportAllDeckFolders, importAllDeckFolders, type SyncedDeckFolders } from '../features/decks/deckOrg';
import { resolveRows } from './scryfall';
import { cleanCode, keysFor, newCode, seal, unseal, type Keys } from './synccode';
import { mergeSync, type MergeReport, type SyncData } from './syncmerge';
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
  history?: Record<string, DeckSnapshot[]>;
  deckFolders?: Record<number, SyncedDeckFolders>;
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
const failed = async (r: Response) =>
  new Error(
    r.status === 413
      ? 'Your binders and decks are too big to sync (over 10 MB).'
      : r.status === 429
        ? 'Sync is busy: too many saves in a short time. It will try again by itself in a minute.'
        : `Sync service answered ${r.status}.`,
  );

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
  const history = exportAllDeckSnapshots(decks);
  const deckFolders = exportAllDeckFolders(profiles, decks);
  return {
    app: 'collectionhub',
    fmt: 1,
    at: Date.now(),
    profiles,
    entries,
    decks,
    ...(Object.keys(history).length ? { history } : {}),
    ...(Object.keys(deckFolders).length ? { deckFolders } : {}),
  };
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
  await matched(v, snap);
  clearDirty(started);
  return { cards: snap.entries.length, decks: snap.decks.length, v };
}

// ---- the last copy this device and the cloud shared (the base a merge compares against) ----

const BASE = 'sync:base';
/** Remembers the copy this device and the cloud both hold at version `v`. */
export async function matched(v: number, d: SyncData) {
  const { profiles, entries, decks, history, deckFolders } = d;
  await db.edhrec.put({ path: BASE, data: { v, profiles, entries, decks, ...(history ? { history } : {}), ...(deckFolders ? { deckFolders } : {}) }, at: Date.now() });
}
/** The shared copy, only when it belongs to version `v` (the one this device last matched). */
export async function baseFor(v: number): Promise<SyncData | null> {
  const b = (await db.edhrec.get(BASE))?.data as (SyncData & { v: number }) | undefined;
  return b && v && b.v === v ? b : null;
}

// ---- backups: this device's binders and decks before each Pull, merge or restore (the last 5 stay) ----

const BACKUP = 'backup:'; // + time; the older single 'backup:before-pull' is listed with them
const KEEP_BACKUPS = 5;
export interface Backup {
  path: string;
  at: number;
  why: string;
  cards: number;
  decks: number;
}
const local = async (): Promise<SyncData> => {
  const [profiles, entries, decks] = await Promise.all([db.profiles.toArray(), db.entries.toArray(), db.decks.toArray()]);
  const history = exportAllDeckSnapshots(decks);
  const deckFolders = exportAllDeckFolders(profiles, decks);
  return {
    profiles,
    entries,
    decks,
    ...(Object.keys(history).length ? { history } : {}),
    ...(Object.keys(deckFolders).length ? { deckFolders } : {}),
  };
};
async function keepBackup(why: string, d?: SyncData) {
  const data = d ?? (await local());
  if (!data.entries.length && !data.decks.length) return; // an empty device has nothing to keep
  const at = Date.now();
  await db.edhrec.put({ path: `${BACKUP}${String(at).padStart(15, '0')}`, data: { ...data, why }, at });
  const old = (await listBackups()).slice(KEEP_BACKUPS);
  if (old.length) await db.edhrec.bulkDelete(old.map((b) => b.path));
}
/** Newest first. */
export async function listBackups(): Promise<Backup[]> {
  const rows = await db.edhrec.where('path').startsWith(BACKUP).toArray();
  return rows
    .map((r) => {
      const d = r.data as SyncData & { why?: string };
      return { path: r.path, at: r.at, why: d.why ?? 'pull', cards: d.entries?.length ?? 0, decks: d.decks?.length ?? 0 };
    })
    .sort((a, b) => b.at - a.at);
}
export const lastBackup = async () => (await listBackups())[0]?.at ?? null;
async function replaceLocal(d: SyncData) {
  await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
    await Promise.all([db.profiles.clear(), db.entries.clear(), db.decks.clear()]);
    await db.profiles.bulkAdd(d.profiles);
    await db.entries.bulkAdd(d.entries);
    await db.decks.bulkAdd(d.decks);
  });
  const savedDecks = await db.decks.toArray();
  importAllDeckSnapshots(savedDecks, d.history);
  importAllDeckFolders(savedDecks, d.deckFolders);
}
/** Puts a backup back on this device (what is here now becomes a backup first, so a restore can be undone too). */
export async function restoreBackup(path?: string) {
  const pick = path ?? (await listBackups())[0]?.path;
  const row = pick ? await db.edhrec.get(pick) : undefined;
  const b = row?.data as SyncData | undefined;
  if (!b) throw new Error('No backup on this device.');
  await keepBackup('restore');
  await replaceLocal(b);
  setLastVersion(null); // this device and the cloud now differ: automatic sync asks which to keep
  return { cards: b.entries.length, decks: b.decks.length };
}
/** The newest backup (the copy from before the last Pull or merge). */
export const undoPull = () => restoreBackup();

/** Everything on this device as a file to keep: binders, decks and binder settings (no sync code inside). */
export async function backupFile() {
  const d = await local();
  const body = JSON.stringify({ app: 'collectionhub', fmt: 1, at: Date.now(), ...d } satisfies Snapshot);
  return { name: `collectionhub-backup-${new Date().toISOString().slice(0, 10)}.json`, blob: new Blob([body], { type: 'application/json' }) };
}

/** Replaces this device's binders and decks with the cloud copy (the old ones are kept for Undo). */
export async function pull(code?: string) {
  const started = Date.now();
  const got = await download(code);
  const here = await local();
  const risk = syncRisk('pull', size(here), got ? size(got.snap) : 0);
  if (risk) throw new Error(risk);
  if (!got) return { cards: 0, decks: 0 };
  const { snap, v } = got;
  await keepBackup('pull', here);
  await quietly(() => replaceLocal(snap));
  setLastVersion(v);
  await matched(v, snap);
  clearDirty(started);
  // Card details (type, colours, image) come from Scryfall's cache on this device.
  await resolveRows(snap.entries.map((e) => ({ name: e.name, qty: 1, id: e.cardId })), () => {});
  return { cards: snap.entries.length, decks: snap.decks.length };
}

/** Card and deck fingerprints, the same for this device and the cloud when they hold the same binders and decks. */
const deckKey = (d: Deck) => `${d.profile}|${d.name}|${d.commander ?? ''}|${d.cards.map((c) => `${c.name}:${c.qty}:${c.foil ? 1 : 0}`).join(',')}`;
export const fingerprint = (s: Pick<Snapshot, 'entries' | 'decks'>) =>
  [...s.entries.map((e) => `${e.profile}|${e.cardId}|${e.qty}|${e.foil ? 1 : 0}|${e.list ?? ""}`)].sort().join('\n') + '\n--\n' + s.decks.map(deckKey).sort().join('\n');
export async function sameAsCloud() {
  const [cloud, entries, decks] = await Promise.all([download(), db.entries.toArray(), db.decks.toArray()]);
  const mine = { entries, decks };
  const theirs = cloud?.snap ?? { entries: [], decks: [] };
  // the two hold the same: that copy is the base later merges compare against
  const same = fingerprint(theirs) === fingerprint(mine);
  if (same && cloud) await matched(cloud.v, cloud.snap);
  return { same, cloudCount: size(theirs), localCount: size(mine) };
}

/**
 * Merges this device's binders and decks with the cloud's, card by card (lib/syncmerge), then saves the result on both.
 * `keepBoth`: there is no shared copy to compare against (first link): everything from both sides is kept.
 * This device's copy is kept as a backup first.
 */
export async function mergeWithCloud(opts: { keepBoth?: boolean } = {}): Promise<MergeReport & { cards: number; decks: number }> {
  const got = await download();
  if (!got) throw new Error('The cloud copy is empty: nothing to merge.');
  const base = opts.keepBoth ? null : await baseFor(lastVersion());
  if (!base && !opts.keepBoth) throw new Error('This device has no earlier shared copy to merge against. Pick MERGE BOTH, or a side.');
  const here = await local();
  const { data, report } = mergeSync(base, here, got.snap);
  await keepBackup('merge', here);
  // Not quietly: the merged copy counts as this device's change, so it is still sent if the save below fails.
  await replaceLocal(data);
  // The cloud copy is now the shared one: what this device adds on top of it is its own change, still to send.
  setLastVersion(got.v);
  await matched(got.v, got.snap);
  await resolveRows(data.entries.map((e) => ({ name: e.name, qty: 1, id: e.cardId })), () => {});
  const sent = await push({ base: got.v });
  return { ...report, cards: sent.cards, decks: sent.decks };
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

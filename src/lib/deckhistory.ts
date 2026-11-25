import { db, newDeckUid, type Deck, type DeckCard } from './db';
import { norm } from './names';

/**
 * Deck history (versions of a deck's list), this device only, never synced.
 *
 * Each version is one row in the existing cache table (`edhrec`), key `deckver:<deck uid>:<time>:<n>`, the same way the
 * worth log and the sync backups are kept: no database schema change. Versions are filed under the deck's `uid` (a
 * random id the deck keeps through renames, commander swaps and syncs), so a sync Pull that renumbers decks can never
 * show one deck's history on another. Binder + name + commander is only a fallback, to refile versions whose id no
 * longer matches a deck (two devices gave the same old deck different ids before they synced).
 *
 * Restoring writes only the deck's list, commander and partner. Binder copies, counts and foils are never touched, so
 * ownership and the over-ownership alert (lib/copies) are worked out from the restored list like any other edit.
 */

export type VersionKind = 'auto' | 'named' | 'restore';

export interface DeckSnapshot {
  id: string; // the row key (deckver:…)
  at: number;
  label?: string;
  kind: VersionKind;
  uid: string; // the deck it belongs to
  profile?: number; // fallback match: binder + name + commander when the version was taken
  deckName?: string;
  cardCount: number;
  cards: DeckCard[];
  commander?: string;
  partner?: string;
  tags?: string[];
  note?: string;
}

export const PREFIX = 'deckver:';
const META = 'deckver-meta';
const LEGACY = 'hub_deck_snapshots_'; // the old localStorage store (+ deck number); left in place, read once
/** Automatic versions: one per editing burst. An edit more than this long after the deck's last change starts a new one. */
export const BURST_MS = 10 * 60_000;
export const KEEP_AUTO = 20; // automatic + "before restore" versions per deck
export const KEEP_NAMED = 50; // named versions per deck, never pushed out by automatic ones
export const ORPHAN_DAYS = 30; // versions of a deck that is gone (deleted on another device) are cleared after this

interface Meta {
  moved?: string[]; // the old localStorage keys already copied in (the keys themselves stay put)
  orphans?: Record<string, number>; // uid -> first seen without a deck
}

export { newDeckUid };

let seq = 0;
const keyFor = (uid: string, at: number) => `${PREFIX}${uid}:${String(at).padStart(15, '0')}:${(seq++ % 1000).toString().padStart(3, '0')}`;
const uidOfKey = (k: string) => k.slice(PREFIX.length, k.indexOf(':', PREFIX.length));

const listBody = (cards: DeckCard[]) => cards.map((c) => `${c.name}|${c.qty}|${c.foil ? 1 : 0}`).join('\n');
const sameList = (a: Pick<Deck, 'cards' | 'commander' | 'partner'>, b: Pick<Deck, 'cards' | 'commander' | 'partner'>) =>
  (a.commander ?? '') === (b.commander ?? '') && (a.partner ?? '') === (b.partner ?? '') && listBody(a.cards) === listBody(b.cards);

/** Whether an automatic version should be taken before this edit: the first edit of a burst only, and never a copy of
 *  the newest version. `deck` is the deck as it is now, before the edit. */
export function wantsAuto(deck: Pick<Deck, 'cards' | 'commander' | 'partner' | 'updated'>, newest: DeckSnapshot | undefined, now = Date.now()) {
  if (!newest) return true;
  if (sameList(deck, newest)) return false;
  return now - (deck.updated ?? 0) >= BURST_MS;
}

/** Keys to drop so a deck keeps KEEP_AUTO automatic and KEEP_NAMED named versions (newest kept). */
export function overflow(versions: Pick<DeckSnapshot, 'id' | 'at' | 'kind'>[]): string[] {
  const newestFirst = [...versions].sort((a, b) => b.at - a.at);
  const named = newestFirst.filter((v) => v.kind === 'named');
  const auto = newestFirst.filter((v) => v.kind !== 'named');
  return [...named.slice(KEEP_NAMED), ...auto.slice(KEEP_AUTO)].map((v) => v.id);
}

const sameDeck = (d: Pick<Deck, 'profile' | 'name' | 'commander'>, v: Pick<DeckSnapshot, 'profile' | 'deckName' | 'commander'>) =>
  v.profile === d.profile && v.deckName === d.name && (v.commander ?? '') === (d.commander ?? '');

/**
 * What to do with versions whose deck id matches no deck: `refile` moves them to the one deck with the same binder,
 * name and commander; `drop` clears those orphaned for ORPHAN_DAYS; the rest wait (`since` = first seen orphaned).
 */
export function planTidy(decks: Pick<Deck, 'uid' | 'profile' | 'name' | 'commander'>[], versions: DeckSnapshot[], orphans: Record<string, number>, now = Date.now()) {
  const live = new Set(decks.map((d) => d.uid).filter(Boolean) as string[]);
  const byUid = new Map<string, DeckSnapshot[]>();
  for (const v of versions) if (!live.has(v.uid)) byUid.set(v.uid, [...(byUid.get(v.uid) ?? []), v]);
  const refile: { from: string; to: string }[] = [];
  const drop: string[] = [];
  const since: Record<string, number> = {};
  for (const [uid, vs] of byUid) {
    const newest = vs.reduce((a, b) => (b.at > a.at ? b : a));
    const match = decks.filter((d) => d.uid && sameDeck(d, newest));
    if (match.length === 1) refile.push({ from: uid, to: match[0].uid! });
    else if (now - (orphans[uid] ?? now) >= ORPHAN_DAYS * 86_400_000) drop.push(uid);
    else since[uid] = orphans[uid] ?? now;
  }
  return { refile, drop, since };
}

/** The old localStorage versions of deck number `id` belong to `deck` only when the newest one shares at least half its
 *  cards with it (after a sync Pull, number `id` may be another deck now). */
export function legacyBelongs(deck: Pick<Deck, 'cards'> | undefined, snaps: { cards: DeckCard[]; at: number }[]) {
  if (!deck || !snaps.length) return false;
  const newest = snaps.reduce((a, b) => (b.at > a.at ? b : a));
  const mine = new Set(deck.cards.map((c) => norm(c.name)));
  const theirs = new Set(newest.cards.map((c) => norm(c.name)));
  const small = Math.min(mine.size, theirs.size);
  if (!small) return false;
  let shared = 0;
  for (const k of theirs) if (mine.has(k)) shared++;
  return shared / small >= 0.5;
}

// ---- database ----

const readMeta = async () => ((await db.edhrec.get(META))?.data as Meta | undefined) ?? {};
const writeMeta = (m: Meta) => db.edhrec.put({ path: META, data: m, at: Date.now() });

/** The deck's uid, giving an older deck one the first time it needs it (read fresh, so two quick edits agree). Call it
 *  outside other transactions. */
export async function ensureDeckUid(deck: Deck): Promise<string | undefined> {
  if (deck.uid || deck.id === undefined) return deck.uid;
  const uid = await db.transaction('rw', db.decks, async () => {
    const fresh = await db.decks.get(deck.id!);
    if (!fresh) return undefined;
    if (fresh.uid) return fresh.uid;
    const u = newDeckUid();
    await db.decks.update(fresh.id!, { uid: u });
    return u;
  });
  if (uid) deck.uid = uid;
  return uid;
}

const rowsOf = async (uid: string) => (await db.edhrec.where('path').startsWith(`${PREFIX}${uid}:`).toArray()).map((r) => r.data as DeckSnapshot);

/** A deck's versions, newest first (read only: safe inside a live query). */
export async function getDeckSnapshots(deck: Pick<Deck, 'uid'>): Promise<DeckSnapshot[]> {
  if (!deck.uid) return [];
  return (await rowsOf(deck.uid)).sort((a, b) => b.at - a.at);
}

export const countDeckSnapshots = async (deck: Pick<Deck, 'uid'>) => (deck.uid ? db.edhrec.where('path').startsWith(`${PREFIX}${deck.uid}:`).count() : 0);

/**
 * Saves a version of the deck as it is now. With no label it is automatic: taken only on the first edit of a burst and
 * never a copy of the newest version. A label makes it a named version (always saved). Returns null when nothing was
 * saved; never throws, so an edit is never stopped by its version. Call it outside other transactions.
 */
export async function saveDeckSnapshot(deck: Deck, label?: string, kind: VersionKind = label ? 'named' : 'auto'): Promise<DeckSnapshot | null> {
  if (deck.id === undefined) return null;
  try {
    const now = (await db.decks.get(deck.id)) ?? deck; // the deck as stored, not a copy a screen may hold
    const uid = await ensureDeckUid(now);
    if (!uid) return null;
    deck.uid = uid;
    const all = await getDeckSnapshots({ uid });
    if (kind === 'auto' && !wantsAuto(now, all[0])) return null;
    const at = Math.max(Date.now(), (all[0]?.at ?? 0) + 1);
    const snap: DeckSnapshot = {
      id: keyFor(uid, at),
      at,
      label: label || (kind === 'auto' ? 'Auto-save' : undefined),
      kind,
      uid,
      profile: now.profile,
      deckName: now.name,
      cardCount: now.cards.reduce((n, c) => n + c.qty, 0),
      cards: now.cards.map((c) => ({ ...c })),
      commander: now.commander,
      partner: now.partner,
      tags: now.tags ? [...now.tags] : undefined,
      note: now.note,
    };
    await db.edhrec.put({ path: snap.id, data: snap, at });
    const drop = overflow([snap, ...all]);
    if (drop.length) await db.edhrec.bulkDelete(drop);
    return snap;
  } catch (e) {
    console.warn('Could not save a version of this deck', e);
    return null;
  }
}

/**
 * Puts a version's list back: cards, commander and partner only (name, tags, note and colour stay as they are). The
 * deck as it is now is saved first as "Before restore". Binder copies are never touched.
 */
export async function restoreDeckSnapshot(deck: Deck, snapshot: DeckSnapshot): Promise<boolean> {
  if (deck.id === undefined) return false;
  await saveDeckSnapshot(deck, 'Before restore', 'restore');
  await db.decks.update(deck.id, {
    cards: snapshot.cards.map((c) => ({ ...c })),
    commander: snapshot.commander,
    partner: snapshot.partner,
    updated: Date.now(),
  });
  return true;
}

/** Deletes one version. */
export const deleteDeckSnapshot = (snapshotId: string) => db.edhrec.delete(snapshotId);

/** Deletes every version of a deck. */
export async function deleteDeckSnapshots(uid: string | undefined) {
  if (!uid) return;
  const keys = (await db.edhrec.where('path').startsWith(`${PREFIX}${uid}:`).primaryKeys()) as string[];
  if (keys.length) await db.edhrec.bulkDelete(keys);
}

/** Deletes a deck and its versions together. */
export async function deleteDeck(deck: Deck) {
  if (deck.id === undefined) return;
  const uid = (await db.decks.get(deck.id))?.uid ?? deck.uid;
  await db.decks.delete(deck.id);
  await deleteDeckSnapshots(uid);
}

/** Copies the old localStorage versions in, once per key. A deck number's versions go to that deck only when they still look
 *  like it (legacyBelongs); otherwise they are kept as orphans, cleared after ORPHAN_DAYS. The old keys stay put. */
async function moveLegacy(meta: Meta) {
  const done = new Set(Array.isArray(meta.moved) ? meta.moved : []);
  let keys: string[] = [];
  try {
    keys = Object.keys(localStorage).filter((k) => k.startsWith(LEGACY) && !done.has(k));
  } catch {
    keys = [];
  }
  for (const k of keys) {
    let list: Partial<DeckSnapshot>[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(k) ?? '[]');
      list = Array.isArray(raw) ? raw.filter((s) => s && Array.isArray(s.cards) && typeof s.at === 'number') : [];
    } catch {
      list = [];
    }
    done.add(k);
    if (!list.length) continue;
    const id = Number(k.slice(LEGACY.length));
    const deck = Number.isFinite(id) ? await db.decks.get(id) : undefined;
    const mine = legacyBelongs(deck, list as { cards: DeckCard[]; at: number }[]);
    const uid = mine && deck ? await ensureDeckUid(deck) : undefined;
    const to = uid ?? `legacy-${k.slice(LEGACY.length)}-${newDeckUid()}`;
    const rows = list.map((s) => {
      const at = s.at!;
      const kind: VersionKind = s.label === 'Before restore' ? 'restore' : s.label && !/^(Revision #|Initial checkpoint)/.test(s.label) ? 'named' : 'auto';
      const v: DeckSnapshot = {
        id: keyFor(to, at),
        at,
        label: s.label,
        kind,
        uid: to,
        profile: mine ? deck!.profile : undefined,
        deckName: mine ? deck!.name : undefined,
        cardCount: s.cardCount ?? s.cards!.reduce((n, c) => n + c.qty, 0),
        cards: s.cards!,
        commander: s.commander,
        partner: s.partner,
        tags: s.tags,
        note: s.note,
      };
      return { path: v.id, data: v, at };
    });
    await db.edhrec.bulkPut(rows);
    const drop = overflow(rows.map((r) => r.data));
    if (drop.length) await db.edhrec.bulkDelete(drop);
  }
  meta.moved = [...done];
}

/**
 * Housekeeping, run when the app starts and after a sync Pull, merge or backup restore: copies the old localStorage
 * versions in once, gives a fresh id to a deck that shares one with another (a backup or merge can bring a copy),
 * refiles versions whose id matches no deck and clears those orphaned for ORPHAN_DAYS.
 */
export async function tidyDeckVersions(now = Date.now()) {
  try {
    const meta = await readMeta();
    await moveLegacy(meta);
    const decks = await db.decks.toArray();
    const seen = new Set<string>();
    for (const d of [...decks].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))) {
      if (!d.uid) continue;
      if (seen.has(d.uid)) {
        d.uid = newDeckUid();
        await db.decks.update(d.id!, { uid: d.uid });
      }
      seen.add(d.uid);
    }
    const rows = await db.edhrec.where('path').startsWith(PREFIX).toArray();
    const versions = rows.map((r) => ({ ...(r.data as DeckSnapshot), uid: uidOfKey(r.path), id: r.path }));
    const { refile, drop, since } = planTidy(decks, versions, meta.orphans ?? {}, now);
    for (const { from, to } of refile) {
      const moving = versions.filter((v) => v.uid === from);
      await db.edhrec.bulkPut(
        moving.map((v) => {
          const path = keyFor(to, v.at);
          return { path, data: { ...v, uid: to, id: path }, at: v.at };
        }),
      );
      await db.edhrec.bulkDelete(moving.map((v) => v.id));
      const after = await getDeckSnapshots({ uid: to });
      const extra = overflow(after);
      if (extra.length) await db.edhrec.bulkDelete(extra);
    }
    for (const uid of drop) await deleteDeckSnapshots(uid);
    meta.orphans = since;
    await writeMeta(meta);
  } catch (e) {
    console.warn('Deck history housekeeping failed', e);
  }
}

import type { Deck, Entry, Profile } from './db';

/**
 * Card-by-card sync merge (Phase 5D). When this device and the cloud both changed since they last matched, the two
 * copies are merged against that last matched copy (the base) instead of one whole side replacing the other:
 *  - a change made on one side only is taken;
 *  - a card whose count changed on both sides gets both changes (base 2, one side 1, other side 3 → 2);
 *  - removed on one side but changed on the other: the change wins (nothing is lost);
 *  - a deck edited on both sides: both versions stay, the cloud's named "(other device)";
 *  - binder settings: per setting, the side that changed it; lists are combined.
 * Without a base (first link, MERGE BOTH) everything from both sides is kept: the same card on both sides keeps the
 * larger count, and identical decks are kept once.
 */
export interface SyncData {
  profiles: Profile[];
  entries: Entry[];
  decks: Deck[];
}
export interface MergeReport {
  /** Card or deck changes taken from the other copy. */
  taken: number;
  /** Decks edited on both sides, kept twice. */
  doubled: number;
}

export const OTHER = ' (other device)';
const entryKey = (e: Entry) => `${e.profile}|${e.cardId}|${e.foil ? 1 : 0}|${e.list ?? ''}`;

/** A stable text form for comparing two values (object keys sorted, ids and save times left out). */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v) ?? 'undefined';
}
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
// The deck's uid is left out like its number and save time: two devices can give the same older deck different uids
// before they first sync, and that alone must never make a deck look edited (or kept twice as "(other device)").
const deckBody = (d: Deck | undefined) => (d ? stable({ ...d, id: undefined, updated: undefined, uid: undefined }) : '');
/** The deck as kept, holding on to a uid the other side already has when this one has none yet. */
const withUid = (kept: Deck, other: Deck | undefined): Deck => ({ ...kept, ...(kept.uid || !other?.uid ? {} : { uid: other.uid }) });
const plain = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** One value merged three ways: the side that changed it wins; both changed → lists combine, objects merge per key,
 *  anything else keeps this device's. */
export function merge3(base: unknown, mine: unknown, theirs: unknown): unknown {
  if (same(mine, base)) return theirs;
  if (same(theirs, base) || same(mine, theirs)) return mine;
  if (Array.isArray(mine) && Array.isArray(theirs)) {
    const seen = new Set(mine.map(stable));
    return [...mine, ...theirs.filter((x) => !seen.has(stable(x)))];
  }
  if (plain(mine) && plain(theirs)) {
    const b = plain(base) ? base : {};
    const out: Record<string, unknown> = {};
    for (const k of new Set([...Object.keys(mine), ...Object.keys(theirs)])) {
      const v = merge3(b[k], mine[k], theirs[k]);
      if (v !== undefined) out[k] = v;
    }
    return out;
  }
  return mine === undefined ? theirs : mine;
}

/** Entries summed by key (a binder can hold the same printing twice when it was imported twice). */
function byKey(list: Entry[]) {
  const m = new Map<string, Entry>();
  for (const e of list) {
    const k = entryKey(e);
    const had = m.get(k);
    m.set(k, had ? { ...had, qty: had.qty + e.qty } : { ...e });
  }
  return m;
}

function mergeEntries(base: Entry[] | null, mine: Entry[], theirs: Entry[], r: MergeReport): Entry[] {
  const B = byKey(base ?? []);
  const M = byKey(mine);
  const T = byKey(theirs);
  const out: Entry[] = [];
  for (const k of new Set([...M.keys(), ...T.keys()])) {
    const b = B.get(k);
    const m = M.get(k);
    const t = T.get(k);
    const pick = (e: Entry, qty: number) => {
      const added = Math.min(...[m?.added, t?.added].filter((x): x is number => typeof x === 'number'));
      const keep: Entry = { ...e, qty };
      if (Number.isFinite(added)) keep.added = added;
      if (!m || m.id === undefined) delete keep.id;
      else keep.id = m.id;
      out.push(keep);
    };
    if (m && t) {
      if (!base) pick(m, Math.max(m.qty, t.qty));
      else {
        const q = m.qty + t.qty - (b?.qty ?? 0);
        if (t.qty !== (b?.qty ?? 0)) r.taken++;
        // both lowered it past zero (e.g. each sold the copies): keep what the lower side still has
        pick(same({ ...m, id: 0, qty: 0 }, { ...b, id: 0, qty: 0 }) ? { ...t, id: m.id } : m, q > 0 ? q : Math.min(m.qty, t.qty));
      }
    } else if (m) {
      // only here: added here, or removed in the cloud. A removal there loses to a change made here.
      if (!b || m.qty !== b.qty || !base) pick(m, m.qty);
      else r.taken++;
    } else if (t) {
      if (!b || t.qty !== b.qty || !base) (pick(t, t.qty), r.taken++);
    }
  }
  return out;
}

function mergeDecks(base: Deck[] | null, mine: Deck[], theirs: Deck[], r: MergeReport): Deck[] {
  const out: Deck[] = [];
  const used = new Set(mine.map((d) => d.id).filter((x) => x !== undefined));
  const theirsAsNew = (t: Deck, name = t.name) => {
    const d: Deck = { ...t, name };
    if (name !== t.name) delete d.uid; // a second copy ("(other device)") is a deck of its own, with its own history
    if (t.id === undefined || used.has(t.id)) delete d.id;
    else used.add(t.id);
    out.push(d);
  };
  if (!base) {
    // no common copy: keep every deck, the same deck on both sides once
    const have = new Set(mine.map(deckBody));
    out.push(...mine.map((d) => withUid(d, theirs.find((t) => deckBody(t) === deckBody(d)))));
    for (const t of theirs) if (!have.has(deckBody(t))) (theirsAsNew(t), r.taken++);
    return out;
  }
  const B = new Map(base.map((d) => [d.id, d]));
  const M = new Map(mine.map((d) => [d.id, d]));
  const T = new Map(theirs.map((d) => [d.id, d]));
  for (const m of mine) {
    const b = B.get(m.id);
    const t = T.get(m.id);
    if (!t) {
      // removed in the cloud: gone here too, unless it changed here (or it is new here)
      if (!b || deckBody(m) !== deckBody(b)) out.push({ ...m });
      else r.taken++;
      continue;
    }
    if (!b) {
      // new on both sides under the same number: two different decks
      out.push({ ...m });
      if (deckBody(t) !== deckBody(m)) (theirsAsNew(t), r.taken++);
      continue;
    }
    const mc = deckBody(m) !== deckBody(b);
    const tc = deckBody(t) !== deckBody(b);
    if (!tc || deckBody(m) === deckBody(t)) out.push(withUid(m, t));
    else if (!mc) (out.push(withUid(t, m)), r.taken++);
    else {
      out.push({ ...m });
      theirsAsNew(t, t.name.endsWith(OTHER) ? t.name : t.name + OTHER);
      r.doubled++;
    }
  }
  for (const t of theirs) {
    if (M.has(t.id)) continue;
    const b = B.get(t.id);
    // new in the cloud, or removed here but changed in the cloud: kept
    if (!b || deckBody(t) !== deckBody(b)) (theirsAsNew(t), r.taken++);
  }
  return out;
}

function mergeProfiles(base: Profile[] | null, mine: Profile[], theirs: Profile[]): Profile[] {
  const B = new Map((base ?? []).map((p) => [p.id, p]));
  const T = new Map(theirs.map((p) => [p.id, p]));
  const out = mine.map((m) => {
    const t = T.get(m.id);
    return t ? ({ ...(merge3(B.get(m.id) ?? (base ? undefined : {}), m, t) as Profile), id: m.id } as Profile) : { ...m };
  });
  for (const t of theirs) if (!mine.some((m) => m.id === t.id)) out.push({ ...t });
  return out;
}

/** Merges this device's copy and the cloud's against the last copy they shared (null = none: keep both). */
export function mergeSync(base: SyncData | null, mine: SyncData, theirs: SyncData): { data: SyncData; report: MergeReport } {
  const report: MergeReport = { taken: 0, doubled: 0 };
  const data = {
    profiles: mergeProfiles(base?.profiles ?? null, mine.profiles, theirs.profiles),
    entries: mergeEntries(base?.entries ?? null, mine.entries, theirs.entries, report),
    decks: mergeDecks(base?.decks ?? null, mine.decks, theirs.decks, report),
  };
  return { data, report };
}

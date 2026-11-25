import { worthOf } from './analytics';
import { BASICS } from './compare';
import { db, type Card, type DeckCard, type Entry } from './db';
import { norm } from './names';

/**
 * Folders inside a binder (step 1 of the binder folders plan, Nov 24). A folder is a path kept in the fields binder
 * lists already use: `Entry.list` on each card row and `Profile.lists` for the folder names, so `Trade` and
 * `Trade/Blue`. No Dexie version and no sync format change: sync already treats `list` as part of a card row's key,
 * and an older app version simply shows `Trade/Blue` as one more flat list. Cards are never deleted here: deleting a
 * folder moves its cards up to the folder above it (top level: Unlisted, as deleting a list always did).
 *
 * Everything that decides a change is a pure function (`plan…`), tested in folders.test.ts; `applyFolderPlan` only
 * writes a plan in one transaction and hands back an undo.
 */

/** Stored between the parts of a path. Display joins them with " / ". */
export const SEP = '/';
/** Folder, subfolder: the depth the screens offer (the helpers work at any depth). */
export const MAX_DEPTH = 2;
export const MAX_NAME = 40;

export type NameCheck = { ok: true; name: string } | { ok: false; why: string };

/** A typed folder name: spaces tidied, never empty, never a "/" (so "R/G" can't become G inside R). */
export function cleanFolderName(raw: string): NameCheck {
  const name = raw.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, why: 'A folder needs a name.' };
  if (name.includes(SEP)) return { ok: false, why: 'Folder names can’t contain "/".' };
  if (name.length > MAX_NAME) return { ok: false, why: `Keep folder names to ${MAX_NAME} letters.` };
  return { ok: true, name };
}

/** The parts of a path, each trimmed, empty parts dropped ("Trade / Blue" and "Trade/Blue" are the same folder). */
export const pathParts = (path: string) =>
  path
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean);
export const normPath = (path: string) => pathParts(path).join(SEP);
export const depthOf = (path: string) => pathParts(path).length;
export const leafOf = (path: string) => pathParts(path).at(-1) ?? '';
/** null for a top-level folder. */
export function parentOf(path: string): string | null {
  const p = pathParts(path);
  return p.length > 1 ? p.slice(0, -1).join(SEP) : null;
}
export const childPath = (parent: string | null, name: string) => (parent ? `${normPath(parent)}${SEP}${name}` : name);
export const showPath = (path: string) => pathParts(path).join(' / ');
/** The folder itself or anything under it. */
export function isWithin(path: string | undefined, folder: string) {
  if (!path) return false;
  const p = normPath(path);
  const f = normPath(folder);
  return p === f || p.startsWith(f + SEP);
}
const sameName = (a: string, b: string) => normPath(a).toLowerCase() === normPath(b).toLowerCase();

export interface FolderNode {
  path: string;
  name: string;
  depth: number;
  children: FolderNode[];
}

/** The binder's folders as a tree, in the order they were made; a parent only named by a subfolder still shows. */
export function folderTree(lists: string[]): FolderNode[] {
  const roots: FolderNode[] = [];
  const byPath = new Map<string, FolderNode>();
  const node = (path: string): FolderNode => {
    const key = path.toLowerCase();
    const had = byPath.get(key);
    if (had) return had;
    const parent = parentOf(path);
    const n: FolderNode = { path, name: leafOf(path), depth: depthOf(path), children: [] };
    byPath.set(key, n);
    (parent ? node(parent).children : roots).push(n);
    return n;
  };
  for (const l of lists) if (pathParts(l).length) node(normPath(l));
  return roots;
}

/** Every folder path, parents before children (implied parents included). */
export function allFolders(lists: string[]): string[] {
  const out: string[] = [];
  const walk = (ns: FolderNode[]) => ns.forEach((n) => (out.push(n.path), walk(n.children)));
  walk(folderTree(lists));
  return out;
}
const exists = (lists: string[], path: string, except?: string) => allFolders(lists).some((p) => sameName(p, path) && !(except && sameName(p, except)));
/** How many levels a folder holds, itself included (Trade with Trade/Blue: 2). */
const height = (lists: string[], path: string) => Math.max(1, ...allFolders(lists).filter((p) => isWithin(p, path)).map((p) => depthOf(p) - depthOf(path) + 1));

// ---- planning a change (pure) ----

export interface FolderPlan {
  /** The binder's folder names after the change. */
  lists: string[];
  /** Card rows to save as given (their list changed, or copies were merged into them). */
  put: Entry[];
  /** Card rows whose copies were merged into another row of the same printing, finish and folder. */
  del: number[];
}
export type PlanResult = ({ ok: true } & FolderPlan) | { ok: false; why: string };

/** The key a binder holds one row per (the importer's key: printing, finish, folder). */
const rowKey = (e: Entry) => [e.cardId, e.set ?? '', e.cn ?? '', e.foil ? 'f' : '', e.list ?? ''].join('|');

/**
 * Moves card rows to new folders (`to` maps a row id to its new folder, undefined = Unlisted). A moved row that lands
 * beside a row of the same printing and finish is merged into it: counts add up, the earlier "first seen" date stays.
 */
function moveRows(entries: Entry[], to: Map<number, string | undefined>): Pick<FolderPlan, 'put' | 'del'> {
  const after = entries.map((e) => (e.id != null && to.has(e.id) ? { ...e, list: to.get(e.id) } : e));
  const groups = new Map<string, Entry[]>();
  for (const e of after) groups.set(rowKey(e), [...(groups.get(rowKey(e)) ?? []), e]);
  const put: Entry[] = [];
  const del: number[] = [];
  for (const g of groups.values()) {
    const moved = g.filter((e) => e.id != null && to.has(e.id));
    if (!moved.length) continue;
    if (g.length === 1) {
      put.push(g[0]);
      continue;
    }
    // keep a row that was already there (else the oldest id); the others' copies join it
    const keep = g.find((e) => !(e.id != null && to.has(e.id))) ?? [...g].sort((a, b) => (a.id ?? 0) - (b.id ?? 0))[0];
    const addeds = g.map((e) => e.added).filter((x): x is number => x != null);
    put.push({ ...keep, qty: g.reduce((n, e) => n + e.qty, 0), ...(addeds.length ? { added: Math.min(...addeds) } : {}) });
    for (const e of g) if (e !== keep && e.id != null) del.push(e.id);
  }
  return { put, del };
}

/** A new folder at the top (parent null) or inside `parent`. */
export function planAddFolder(lists: string[], parent: string | null, raw: string): PlanResult {
  const n = cleanFolderName(raw);
  if (!n.ok) return n;
  if (parent && !exists(lists, parent)) return { ok: false, why: 'That folder is gone.' };
  const path = childPath(parent, n.name);
  if (depthOf(path) > MAX_DEPTH) return { ok: false, why: `Folders go ${MAX_DEPTH} levels deep.` };
  if (exists(lists, path)) return { ok: false, why: `There is already a folder called ${n.name} here.` };
  return { ok: true, lists: [...lists, path], put: [], del: [] };
}

/** Rewrites every path under `from` to sit under `to` instead (the folder and its subfolders, names and cards). */
function planRepath(lists: string[], entries: Entry[], from: string, to: string): PlanResult {
  const swap = (p: string) => to + normPath(p).slice(normPath(from).length);
  const seen = new Set<string>();
  const next: string[] = [];
  for (const l of lists) {
    const p = isWithin(l, from) ? swap(l) : l;
    if (!seen.has(p.toLowerCase())) seen.add(p.toLowerCase()), next.push(p);
  }
  const moves = new Map<number, string | undefined>();
  for (const e of entries) if (e.id != null && isWithin(e.list, from)) moves.set(e.id, swap(e.list!));
  return { ok: true, lists: next, ...moveRows(entries, moves) };
}

/** A new name for a folder; its subfolders and cards come along. */
export function planRenameFolder(lists: string[], entries: Entry[], from: string, raw: string): PlanResult {
  const n = cleanFolderName(raw);
  if (!n.ok) return n;
  if (!exists(lists, from)) return { ok: false, why: 'That folder is gone.' };
  const to = childPath(parentOf(from), n.name);
  if (normPath(to) === normPath(from)) return { ok: true, lists, put: [], del: [] };
  if (exists(lists, to, from)) return { ok: false, why: `There is already a folder called ${n.name} here.` };
  return planRepath(lists, entries, from, to);
}

/** Puts a folder (with its subfolders and cards) inside another folder, or at the top when `parent` is null. */
export function planMoveFolder(lists: string[], entries: Entry[], from: string, parent: string | null): PlanResult {
  if (!exists(lists, from)) return { ok: false, why: 'That folder is gone.' };
  if (parent && !exists(lists, parent)) return { ok: false, why: 'That folder is gone.' };
  if (parent && isWithin(parent, from)) return { ok: false, why: 'A folder can’t go inside itself.' };
  const to = childPath(parent, leafOf(from));
  if (normPath(to) === normPath(from)) return { ok: true, lists, put: [], del: [] };
  if (depthOf(to) - 1 + height(lists, from) > MAX_DEPTH) return { ok: false, why: `Folders go ${MAX_DEPTH} levels deep.` };
  if (exists(lists, to)) return { ok: false, why: `There is already a folder called ${leafOf(from)} there.` };
  return planRepath(lists, entries, from, to);
}

/** Deletes a folder and its subfolders. No card is deleted: they all move up to the folder above (top level: Unlisted). */
export function planDeleteFolder(lists: string[], entries: Entry[], path: string): PlanResult {
  const up = parentOf(path) ?? undefined;
  const next = lists.filter((l) => !isWithin(l, path));
  // a parent that only existed through this folder's name stays as a folder of its own
  if (up && !next.some((l) => isWithin(l, up))) next.push(up);
  const moves = new Map<number, string | undefined>();
  for (const e of entries) if (e.id != null && isWithin(e.list, path)) moves.set(e.id, up);
  return { ok: true, lists: next, ...moveRows(entries, moves) };
}

// ---- writing a plan ----

/** Saves a plan for one binder in one transaction; the returned function puts everything back as it was. */
export async function applyFolderPlan(profile: number, plan: FolderPlan): Promise<() => Promise<void>> {
  const ids = [...plan.put.map((e) => e.id).filter((x): x is number => x != null), ...plan.del];
  let before: Entry[] = [];
  let beforeLists: string[] | undefined;
  await db.transaction('rw', db.profiles, db.entries, async () => {
    before = (await db.entries.bulkGet(ids)).filter((e): e is Entry => !!e);
    beforeLists = (await db.profiles.get(profile))?.lists;
    if (plan.put.length) await db.entries.bulkPut(plan.put);
    if (plan.del.length) await db.entries.bulkDelete(plan.del);
    await db.profiles.update(profile, { lists: plan.lists });
  });
  return async () => {
    await db.transaction('rw', db.profiles, db.entries, async () => {
      if (before.length) await db.entries.bulkPut(before);
      await db.profiles.update(profile, { lists: beforeLists });
    });
  };
}

// ---- folder stats ----

/** Copies each card name needs across the binder's active decks (decks with their light off don't count; basic lands
 *  never count), the same demand lib/copies.ts uses for shortfalls. */
export function activeNeed(decks: { cards: DeckCard[]; inactive?: boolean }[]): Map<string, number> {
  const need = new Map<string, number>();
  for (const d of decks)
    if (!d.inactive)
      for (const c of d.cards) {
        const k = norm(c.name);
        if (!BASICS.has(k)) need.set(k, (need.get(k) ?? 0) + c.qty);
      }
  return need;
}

export interface FolderStats {
  copies: number;
  unique: number;
  /** USD at each copy's printing and finish (the app shows it as ≈CA$). */
  usd: number;
  /** Copies no active deck needs, never more than the folder holds. */
  spare: number;
}

/** Rows in a folder and everything under it. */
export const rowsWithin = (entries: Entry[], folder: string) => entries.filter((e) => isWithin(e.list, folder));

/**
 * Stats for the rows of one folder (subfolders included: pass `rowsWithin`). `binder` = every row of the binder, `need`
 * = `activeNeed(binder's decks)`. Spare per card name = min(copies in this folder, max(0, copies in the binder − copies
 * active decks need)): a folder never shows more spare copies than it holds. Each folder is capped on its own, so two
 * sibling folders can both show the same spare copy; a folder and its parent agree.
 */
export function folderStats(rows: Entry[], binder: Entry[], need: Map<string, number>, cards: Map<string, Card>): FolderStats {
  const own = new Map<string, number>();
  for (const e of binder) own.set(norm(e.name), (own.get(norm(e.name)) ?? 0) + e.qty);
  const here = new Map<string, number>();
  for (const e of rows) here.set(norm(e.name), (here.get(norm(e.name)) ?? 0) + e.qty);
  let copies = 0;
  let spare = 0;
  for (const [k, n] of here) {
    copies += n;
    spare += Math.min(n, Math.max(0, (own.get(k) ?? 0) - (need.get(k) ?? 0)));
  }
  return { copies, unique: here.size, usd: worthOf(rows, cards), spare };
}

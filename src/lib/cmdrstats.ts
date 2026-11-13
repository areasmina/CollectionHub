import { db } from './db';
import { ownShare } from './deckshare';
import { norm } from './names';
import type { EdhPage } from './edhrec';

/** Per commander, from EDHREC's average deck: share owned, cards missing, EDHREC decks. null = EDHREC has no page. */
export type Stat = { pct: number; missing: number; decks?: number } | null;
/** A commander's stat and when its EDHREC page was fetched (ms). */
export type SavedStat = { stat: Stat; at: number };

/** The same count as the commander page: copies owned out of the deck's copies, the commander included (EDHREC's lists
 *  leave it out; the page adds it back). */
export function statOf(page: EdhPage, mine: Map<string, number>, commander?: string): Stat {
  const byName = new Map<string, { name: string; qty: number }>();
  if (commander) byName.set(norm(commander), { name: commander, qty: 1 });
  for (const c of page.lists.flatMap((l) => l.cards)) if (!byName.has(norm(c.name))) byName.set(norm(c.name), { name: c.name, qty: c.qty ?? 1 });
  const sh = ownShare([...byName.values()], mine);
  return { pct: sh.pct, missing: sh.missing, decks: page.numDecks };
}

/** Which cards a binder owns and how many, as one short string (order-independent). Copies count toward % owned, so a
 *  quantity change is a new signature ("q2" also retires stats saved under the older name-based count). */
export function binderSig(profile: number, mine: Map<string, number>) {
  let sum = 0;
  for (const [name, qty] of mine) {
    const k = `${name}:${qty}`;
    let h = 0;
    for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) | 0;
    sum = (sum + (h >>> 0)) % 4294967296;
  }
  return `q2|${profile}|${mine.size}|${sum}`;
}

/**
 * What still needs work after showing the saved stats:
 * - `recount`: commanders whose % owned must be recomputed from the cached page (new commander, or the binder changed);
 * - `refresh`: commanders whose EDHREC page is older than maxAge (re-downloaded quietly, after everything is shown).
 */
export function plan(keys: string[], saved: Map<string, SavedStat>, sameBinder: boolean, now: number, maxAge: number) {
  const recount = keys.filter((k) => !sameBinder || !saved.has(k));
  const refresh = keys.filter((k) => { const s = saved.get(k); return !s || now - s.at >= maxAge; });
  return { recount, refresh };
}

// Kept in the same IndexedDB table as EDHREC pages (like the salt list and sync backup), one row per binder.
const rowKey = (profile: number) => `cmdrstats:${profile}`;
type Row = { sig: string; stats: [string, Stat, number][] };

export async function loadStats(profile: number): Promise<{ sig: string; map: Map<string, SavedStat> }> {
  const hit = (await db.edhrec.get(rowKey(profile)).catch(() => undefined))?.data as Row | undefined;
  return { sig: hit?.sig ?? '', map: new Map((hit?.stats ?? []).map(([k, stat, at]) => [k, { stat, at }])) };
}

export async function saveStats(profile: number, sig: string, map: Map<string, SavedStat>) {
  const row: Row = { sig, stats: [...map].map(([k, v]) => [k, v.stat, v.at]) };
  await db.edhrec.put({ path: rowKey(profile), data: row, at: Date.now() }).catch(() => {});
}

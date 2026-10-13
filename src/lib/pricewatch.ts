import { db, type Card, type Entry } from './db';

/** One day's prices for the binder's cards: [cardId, usd, usdFoil]. Kept in the local cache store, 14 days. */
type Snap = [string, number | null, number | null][];
const DAY = 864e5;
const KEEP = 14;
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const path = (day: string) => `pricesnap:${day}`;
const num = (v?: string) => (v ? Number(v) : null);

/** Saves today's prices (once a day) and drops snapshots older than two weeks. */
export async function snapshot(entries: Entry[], cards: Map<string, Card>, now = Date.now()) {
  const today = dayOf(now);
  const ids = [...new Set(entries.map((e) => e.cardId))].filter((id) => cards.get(id)?.usd || cards.get(id)?.usdFoil);
  if (!ids.length) return;
  const data: Snap = ids.map((id) => [id, num(cards.get(id)!.usd), num(cards.get(id)!.usdFoil)]);
  await db.edhrec.put({ path: path(today), data, at: now });
  const old = (await db.edhrec.where('path').startsWith('pricesnap:').primaryKeys()).filter((k) => k < path(dayOf(now - KEEP * DAY)));
  if (old.length) await db.edhrec.bulkDelete(old);
}

/** The snapshot closest to `days` ago (not newer than one day old), else the oldest one there is. */
export async function snapshotFrom(days = 3, now = Date.now()) {
  const keys = (await db.edhrec.where('path').startsWith('pricesnap:').primaryKeys()).sort();
  const want = path(dayOf(now - days * DAY));
  const older = keys.filter((k) => k <= path(dayOf(now - DAY)));
  if (!older.length) return null;
  const k = older.filter((x) => x <= want).pop() ?? older[0];
  const hit = await db.edhrec.get(k);
  return hit ? { day: k.slice('pricesnap:'.length), prices: new Map((hit.data as Snap).map(([id, u, f]) => [id, { usd: u, foil: f }])) } : null;
}

export interface Move {
  entry: Entry;
  now: number;
  was: number;
  diff: number; // now - was, USD per copy
}

/** Per-copy price change of each entry (at its finish) between a snapshot and now; biggest moves first. */
export function movers(entries: Entry[], cards: Map<string, Card>, then: Map<string, { usd: number | null; foil: number | null }>, dir: 'up' | 'down', n = 3): Move[] {
  const seen = new Set<string>();
  const out: Move[] = [];
  for (const e of entries) {
    const c = cards.get(e.cardId);
    const t = then.get(e.cardId);
    if (!c || !t) continue;
    const k = `${e.cardId}|${e.foil ? 'f' : ''}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const now = e.foil ? num(c.usdFoil) ?? num(c.usd) : num(c.usd);
    const was = e.foil ? t.foil ?? t.usd : t.usd;
    if (now == null || was == null) continue;
    const diff = now - was;
    if ((dir === 'up' && diff > 0) || (dir === 'down' && diff < 0)) out.push({ entry: e, now, was, diff });
  }
  return out.sort((a, b) => (dir === 'up' ? b.diff - a.diff : a.diff - b.diff)).slice(0, n);
}

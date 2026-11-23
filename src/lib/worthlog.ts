import { db } from './db';
import type { ValuePoint } from './analytics';

/**
 * Worth log (Guillermo, Nov 23: "keep a year"): one small line per binder per day, what the binder was worth that day
 * at that day's prices. It lets WORTH OVER TIME reach back a year, where the per-card price snapshots
 * (`lib/pricewatch`) are kept only 14 days.
 *
 * Stored in the existing cache table (`edhrec`, key `worthlog:<binder>:<YYYY-MM-DD>`), so no database change; it stays
 * on this device and is not synced. It is only ever written by the app itself and holds no card data, so deleting it
 * loses nothing but the line.
 */
export interface WorthDay {
  day: string; // YYYY-MM-DD
  usd: number; // the binder's worth that day, USD at your printings and finishes
  est?: boolean; // worked out afterwards from the saved prices (today's cards at that day's prices), not logged that day
}

export const KEEP_DAYS = 366;
const DAY = 864e5;
const PREFIX = 'worthlog:';
const dayOf = (t: number) => new Date(t).toISOString().slice(0, 10);
const keyOf = (binder: number, day: string) => `${PREFIX}${binder}:${day}`;
const dayOfKey = (k: string) => k.slice(k.lastIndexOf(':') + 1);

/** Keys of one binder's log that are older than a year (dropped when today's line is written). */
export function expired(keys: string[], binder: number, now = Date.now()): string[] {
  const oldest = keyOf(binder, dayOf(now - (KEEP_DAYS - 1) * DAY));
  const mine = `${PREFIX}${binder}:`;
  return keys.filter((k) => k.startsWith(mine) && k < oldest);
}

/** Writes today's worth for a binder (a later write the same day replaces it) and drops days older than a year. */
export async function logWorth(binder: number, usd: number, now = Date.now()) {
  if (!(usd > 0)) return;
  await db.edhrec.put({ path: keyOf(binder, dayOf(now)), data: { usd: Math.round(usd * 100) / 100 }, at: now });
  const keys = (await db.edhrec.where('path').startsWith(`${PREFIX}${binder}:`).primaryKeys()) as string[];
  const old = expired(keys, binder, now);
  if (old.length) await db.edhrec.bulkDelete(old);
}

/** One binder's logged days, oldest first. */
export async function worthLog(binder: number): Promise<WorthDay[]> {
  const rows = await db.edhrec.where('path').startsWith(`${PREFIX}${binder}:`).toArray();
  return rows
    .map((r) => ({ day: dayOfKey(r.path), usd: Number((r.data as { usd?: number })?.usd ?? 0) }))
    .filter((p) => p.usd > 0)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * The line to draw: every logged day, and before the first logged day the days the price snapshots can still
 * reconstruct (marked `est`). A logged day always wins over an estimate of the same day; estimates never fill gaps
 * between logged days, so the line never mixes the two meanings in the middle.
 */
export function mergeWorth(logged: WorthDay[], estimated: ValuePoint[]): WorthDay[] {
  const first = logged[0]?.day;
  const before = estimated.filter((p) => !first || p.day < first).map((p) => ({ day: p.day, usd: p.usd, est: true }));
  return [...before, ...logged].sort((a, b) => a.day.localeCompare(b.day));
}

export interface WorthReadings {
  today: WorthDay;
  first: WorthDay;
  change: number; // today − first, USD
  best: WorthDay; // the highest day (the earliest of equal highs)
  estimated: number; // how many of the days are estimates
}

/** The three readings beside the line: today, the change since the line starts, and the best day. */
export function worthReadings(points: WorthDay[]): WorthReadings | null {
  if (!points.length) return null;
  const today = points[points.length - 1];
  const first = points[0];
  const best = points.reduce((b, p) => (p.usd > b.usd ? p : b), first);
  return { today, first, change: Math.round((today.usd - first.usd) * 100) / 100, best, estimated: points.filter((p) => p.est).length };
}

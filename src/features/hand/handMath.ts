import type { DeckCard } from '../../lib/db';
import { norm } from '../../lib/names';

const LOG_FACT = [0];
function logFact(n: number): number {
  for (let i = LOG_FACT.length; i <= n; i++) {
    LOG_FACT[i] = LOG_FACT[i - 1] + Math.log(i);
  }
  return LOG_FACT[n];
}

function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  return logFact(n) - logFact(k) - logFact(n - k);
}

/**
 * Exact hypergeometric probability P(X >= needed) when drawing `draws` cards
 * without replacement from a deck of `population` cards containing `successes` hits.
 */
export function hypergeomAtLeast(population: number, successes: number, draws: number, needed = 1): number {
  if (needed <= 0) return 1;
  if (population <= 0 || successes <= 0 || draws <= 0 || successes < needed || draws < needed) return 0;
  const n = Math.min(draws, population);
  if (population - successes < needed && n === population) return 1;
  const maxK = Math.min(successes, n);
  const logDenom = logChoose(population, n);
  let prob = 0;
  for (let k = needed; k <= maxK; k++) {
    if (n - k > population - successes) continue;
    prob += Math.exp(logChoose(successes, k) + logChoose(population - successes, n - k) - logDenom);
  }
  return Math.max(0, Math.min(1, prob));
}

export function keepVerdict(lands: number, handSize: number): { label: 'KEEP' | 'RISKY' | 'MULLIGAN'; tone: 'ok' | 'warn' | 'low'; note: string } {
  if (handSize <= 0) return { label: 'MULLIGAN', tone: 'low', note: 'Empty hand.' };
  if (lands >= 2 && lands <= 4) return { label: 'KEEP', tone: 'ok', note: `${lands} lands — solid mana opening.` };
  if (lands === 5) return { label: 'RISKY', tone: 'warn', note: '5 lands — flood risk unless commander fuels action.' };
  if (lands === 1) return { label: 'RISKY', tone: 'warn', note: '1 land — only keep with cheap ramp or fast draw.' };
  return { label: 'MULLIGAN', tone: 'low', note: lands === 0 ? '0 lands — automatic mulligan.' : `${lands} lands — too flood-heavy.` };
}

/** Expands DeckCards into a flat library array, omitting commander and partner. */
export function buildLibrary(cards: DeckCard[], commander?: string, partner?: string): string[] {
  const skip = new Set([commander, partner].filter(Boolean).map((n) => norm(n!)));
  const out: string[] = [];
  for (const c of cards) {
    if (skip.has(norm(c.name))) continue;
    for (let i = 0; i < c.qty; i++) out.push(c.name);
  }
  return out;
}

/** Pure Fisher-Yates shuffle returning a new array. */
export function shuffle<T>(items: T[], rng: () => number = Math.random): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

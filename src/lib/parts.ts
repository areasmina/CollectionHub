/** Pure helpers behind THE OVERHAUL's Meter part (views/parts.tsx). */

/** Ten bars for a match %: a bar lights once the % reaches its middle (so 95% lights all ten, 4% none). */
export function meterCells(pct: number, n = 10): boolean[] {
  const p = Math.max(0, Math.min(100, pct));
  return Array.from({ length: n }, (_, i) => (i + 0.5) * (100 / n) <= p);
}

/** Arena-style copies: ◆ for each owned copy, ◇ for each one still needed (at most `max` marks, then "+N"). */
export function diamonds(own: number, need: number, max = 4): string {
  const n = Math.max(1, need);
  const have = Math.max(0, Math.min(own, n));
  const marks = '◆'.repeat(have) + '◇'.repeat(n - have);
  return n > max ? `${marks.slice(0, max)} +${n - max}` : marks;
}

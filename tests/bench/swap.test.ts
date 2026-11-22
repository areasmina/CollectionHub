import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import baseline from './swap-baseline.json';
import { runSwap } from './swap';

/**
 * Swap benchmark on 48 real public decks (tests/bench/swap.ts): for 10 hidden spells of each deck, are the swap
 * window's top 3 stand-ins real cards of that deck, and does the first pick do the same job? Floors sit a little under
 * the measured baseline (swap-baseline.json): a scoring change that makes swaps worse fails here, a better one moves
 * the baseline up (BENCH=1 npx vitest run tests/bench/swap.test.ts).
 */
const SLACK = 0.02;
const round = (x: number) => Math.round(x * 1000) / 1000;
const runs = {
  edhrec: { plain: runSwap('edhrec', 'plain'), deck: runSwap('edhrec', 'deck') },
  none: { plain: runSwap('none', 'plain'), deck: runSwap('none', 'deck') },
};
type B = Record<'edhrec' | 'none', Record<'plain' | 'deck', { fit: number; job: number }>>;
const base = baseline as B;

describe('swap stand-ins: what the swap window offers for a missing card', () => {
  for (const ev of ['edhrec', 'none'] as const)
    for (const caller of ['plain', 'deck'] as const)
      it(`${ev} binder, ${caller === 'plain' ? 'commander page (no deck)' : 'saved deck'}`, () => {
        expect(runs[ev][caller].fit).toBeGreaterThanOrEqual(base[ev][caller].fit - SLACK);
        expect(runs[ev][caller].job).toBeGreaterThanOrEqual(base[ev][caller].job - SLACK);
      });
  it.skipIf(!process.env.BENCH)('prints the numbers and writes the baseline', () => {
    const out = Object.fromEntries(
      Object.entries(runs).map(([ev, r]) => [ev, Object.fromEntries(Object.entries(r).map(([c, x]) => [c, { fit: round(x.fit), job: round(x.job) }]))]),
    );
    console.log(JSON.stringify(out));
    writeFileSync('tests/bench/swap-baseline.json', JSON.stringify(out, null, 1) + '\n');
    if (process.env.PICKS) writeFileSync(process.env.PICKS, JSON.stringify(Object.fromEntries(Object.entries(runs).flatMap(([ev, r]) => Object.entries(r).map(([c, x]) => [`${ev}/${c}`, x.rows.map((row) => row.picks)])))));
  });
});

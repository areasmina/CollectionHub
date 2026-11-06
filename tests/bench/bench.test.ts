import { describe, expect, it } from 'vitest';
import { commanders, decksOf, reconstruct, strategy } from './measure';
import baseline from './baseline.json';

/**
 * Brain tests (ui-review §12) on 48 real public decks (4 commanders). Floors sit a little under the measured baseline
 * (tests/bench/baseline.json), so an engine change that makes the brain worse fails here; a better one moves the
 * baseline up (BENCH=1 npx vitest run tests/bench/print.test.ts).
 */
export const STRATEGIES: [string, string, (m: { type: string; text: string }) => boolean][] = [
  ['Doctor Doom, King of Latveria', 'Villains', (m) => /\bVillain\b/.test(m.type)],
  ['Doctor Doom, King of Latveria', 'Discard', (m) => /\bdiscard/i.test(m.text)],
  ["Trostani, Selesnya's Voice", 'Lifegain', (m) => /gain(s)? (\d+|x|that much) life|whenever you gain life/i.test(m.text)],
  ['Yuriko, the Tiger\'s Shadow', 'Ninjas', (m) => /\bNinja\b/.test(m.type) || /ninjutsu/i.test(m.text)],
];

const recon = commanders.flatMap((c) => decksOf(c).map((d) => reconstruct(c, d)));
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const base = baseline as { recon: { overlap: number }[] };

describe('reconstruction: rebuild real decks from their 99 mixed into ~300 random cards', () => {
  it('breaks no rule: legal, 100 cards, singleton, colour identity, bracket', () => {
    expect(recon.flatMap((r) => r.ruleViolations.map((v) => `${r.cmdr} / ${r.deck}: ${v}`))).toEqual([]);
  });
  it('rebuilds most of each real deck (median within 3 points of the baseline, none collapses)', () => {
    const m = median(recon.map((r) => r.overlap));
    expect(m).toBeGreaterThanOrEqual(median(base.recon.map((r) => r.overlap)) - 0.03);
    expect(Math.min(...recon.map((r) => r.overlap))).toBeGreaterThanOrEqual(0.4);
  });
});

describe('strategy: a less popular archetype gives a different deck from the same binder', () => {
  for (const [cmdr, label, test] of STRATEGIES)
    it(`${cmdr.split(',')[0]}: ${label}`, () => {
      const s = strategy(cmdr, label, test);
      expect(s.changed).toBeGreaterThanOrEqual(8); // meaningfully different
      expect(s.fitThemed).toBeGreaterThan(s.fitBase); // more cards of the strategy
      expect(s.surfaced.length).toBeGreaterThanOrEqual(3); // owned cards the popular build missed
    });
});

import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import baseline from './suggest-baseline.json';
import { runSuggest } from './suggest';

/**
 * Suggestion benchmark (overhaul phase 2) on 48 real public decks: hide 10 spells of each deck in a binder of ~300 random
 * cards and count how many the brain's top picks bring back. Floors sit a little under the measured baseline
 * (suggest-baseline.json): a brain change that makes suggestions worse fails here, a better one moves the baseline up
 * (BENCH=1 npx vitest run tests/bench/suggest.test.ts).
 */
const SLACK = 0.02;
const round = (x: number) => Math.round(x * 1000) / 1000;
const runs = { edhrec: runSuggest('edhrec'), none: runSuggest('none') };

describe('suggestions: find the cards a real deck is missing', () => {
  it('with popularity evidence (the normal case)', () => {
    expect(runs.edhrec.at10).toBeGreaterThanOrEqual(baseline.edhrec.at10 - SLACK);
    expect(runs.edhrec.at20).toBeGreaterThanOrEqual(baseline.edhrec.at20 - SLACK);
  });
  it('with no popularity evidence (owned cards EDHREC does not list): only what the cards do', () => {
    expect(runs.none.at10).toBeGreaterThanOrEqual(baseline.none.at10 - SLACK);
    expect(runs.none.at20).toBeGreaterThanOrEqual(baseline.none.at20 - SLACK);
  });
  it.skipIf(!process.env.BENCH)('prints the numbers and writes the baseline', () => {
    const out = Object.fromEntries(Object.entries(runs).map(([k, r]) => [k, { at10: round(r.at10), at20: round(r.at20), first: round(r.first) }]));
    console.log(out);
    writeFileSync('tests/bench/suggest-baseline.json', JSON.stringify(out, null, 1) + '\n');
  });
});

import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { commanders, decksOf, reconstruct, strategy } from './measure';
import { STRATEGIES } from './bench.test';

// BENCH=1 npx vitest run tests/bench/print.test.ts --silent=false : prints every deck and rewrites baseline.json.
it.skipIf(!process.env.BENCH)('prints the benchmark and writes the baseline', () => {
  const recon = commanders.flatMap((c) => decksOf(c).map((d) => reconstruct(c, d)));
  for (const r of recon) console.log(`${r.cmdr.slice(0, 22).padEnd(22)} ${r.deck.slice(0, 26).padEnd(26)} B${r.bracket} overlap ${(r.overlap * 100).toFixed(0)}% spells ${(r.spells * 100).toFixed(0)}% lands ${(r.lands * 100).toFixed(0)}% noise ${r.noise} rules ${r.ruleViolations.length}`);
  const strat = STRATEGIES.map(([c, l, t]) => strategy(c, l, t));
  for (const s of strat) console.log(s.cmdr, s.label, 'changed', s.changed, 'fit', s.fitBase, '→', s.fitThemed, 'surfaced', s.surfaced.length);
  const round = (x: number) => Math.round(x * 1000) / 1000;
  writeFileSync('tests/bench/baseline.json', JSON.stringify({ recon: recon.map((r) => ({ cmdr: r.cmdr, deck: r.deck, overlap: round(r.overlap), spells: round(r.spells), lands: round(r.lands), noise: r.noise, rules: r.ruleViolations.length })), strategy: strat.map((s) => ({ cmdr: s.cmdr, label: s.label, changed: s.changed, fitBase: s.fitBase, fitThemed: s.fitThemed, surfaced: s.surfaced.length })) }, null, 1) + '\n');
}, 600000);

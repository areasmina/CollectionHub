import { writeFileSync } from 'node:fs';
import { it } from 'vitest';
import { buildDeck } from '../../src/brain/build';
import { groupOf, isLand } from '../../src/lib/deckstats';
import { BASICS } from '../../src/lib/compare';
import { norm } from '../../src/lib/names';
import { cardOf, commanders, decksOf, gc, popularity } from './measure';
import { rng, seedOf } from '../../src/brain/wildcard';

// BLIND=path npx vitest run tests/bench/blind.test.ts : writes the blind-test pairs (ours vs the consensus of public decks).
it.skipIf(!process.env.BLIND)('writes blind-test pairs', () => {
  const out = commanders.map((cmdr) => {
    const decks = decksOf(cmdr);
    const pop = popularity(cmdr);
    const all = [...new Set(decks.flatMap((d) => d.cards.map(([n]) => n)))].filter((n) => !BASICS.has(norm(n)));
    const ours = buildDeck({ commander: cmdr, identity: cardOf(cmdr)!.ci, owned: all.map((name) => ({ name, incl: pop(name) || undefined })), cardOf, bracket: 4, gc }).cards.filter((c) => c.name !== cmdr);
    // Consensus: the most-played cards across the public decks, with their median land and basic counts.
    const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const landsN = med(decks.map((d) => d.cards.filter(([n]) => isLand(cardOf(n)?.type)).reduce((s, [, q]) => s + q, 0)));
    const basicsN = med(decks.map((d) => d.cards.filter(([n]) => BASICS.has(norm(n))).reduce((s, [, q]) => s + q, 0)));
    const byPop = all.slice().sort((a, b) => pop(b) - pop(a) || a.localeCompare(b));
    const nb = byPop.filter((n) => isLand(cardOf(n)?.type)).slice(0, landsN - basicsN);
    const sp = byPop.filter((n) => !isLand(cardOf(n)?.type)).slice(0, 99 - landsN);
    const basicTotals = new Map<string, number>();
    for (const d of decks) for (const [n, q] of d.cards) if (BASICS.has(norm(n))) basicTotals.set(n, (basicTotals.get(n) ?? 0) + q);
    const tot = [...basicTotals.values()].reduce((a, b) => a + b, 0) || 1;
    const basics = [...basicTotals].map(([n, q]) => ({ name: n, qty: Math.round((q / tot) * basicsN) })).filter((b) => b.qty > 0);
    const fill = 99 - sp.length - nb.length - basics.reduce((s, b) => s + b.qty, 0);
    if (basics.length) basics[0].qty += fill;
    const consensus = [...sp, ...nb].map((name) => ({ name, qty: 1 })).concat(basics);
    const show = (cards: { name: string; qty: number }[]) => cards.map((c) => { const m = cardOf(c.name); return [c.name, c.qty, m ? groupOf(m.type) : 'Other', Math.round(m?.cmc ?? 0)]; });
    const oursFirst = rng(seedOf(cmdr))() < 0.5;
    const shared = ours.filter((c) => consensus.some((x) => norm(x.name) === norm(c.name)) && !BASICS.has(norm(c.name))).length;
    return { cmdr, decks: decks.length, shared, a: show(oursFirst ? ours : consensus), b: show(oursFirst ? consensus : ours), ours: oursFirst ? 'A' : 'B' };
  });
  writeFileSync(process.env.BLIND!, JSON.stringify(out));
});

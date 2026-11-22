// Swap benchmark: are the stand-ins the swap window offers for a missing card any good?
// Take a real public deck and hide 10 of its spells. For each hidden card, ask the swap window's ranking (rankSubs) for
// its top 3 stand-ins from a binder of the other 9 hidden cards plus ~300 random ones. Plain counting, no AI judging AI.
//
// - fit: share of the top 3 that are real cards of this deck (one of the other hidden ones). Higher is better.
// - job: when the missing card does a deck-count job by its rules text (ramp, draw, removal, wipes, tutors), the share
//   of first picks that do one of the same jobs by their rules text. The text rules (lib/deckstats.ts roleOf without a
//   name) are not what rankSubs ranks on, which reads the Scryfall Tagger file.
// - Two binders, as in tests/bench/suggest.ts: 'edhrec' (candidates carry how often this commander's other decks play
//   them) and 'none' (no popularity at all).
// - Two callers: 'plain' is the commander page's auto-fill (no deck context); 'deck' is a saved deck's swap window,
//   which passes the deck so the brain's deck needs, combos and themes count.
import { deckNeeds, type DeckContext } from '../../src/brain/score';
import { inIdentity } from '../../src/brain/identity';
import { rng } from '../../src/brain/wildcard';
import { BASICS } from '../../src/lib/compare';
import { isLand, roleOf } from '../../src/lib/deckstats';
import { norm } from '../../src/lib/names';
import { rankSubs, type SubCard } from '../../src/lib/subs';
import { cardOf, commanders, decksOf, popularity } from './measure';
import { mean, type Evidence } from './suggest';

export type Caller = 'plain' | 'deck';
type FDeck = { id: number; name: string; bracket: number | null; cards: [string, number][] };

function shuffled<T>(xs: T[], r: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const textRoles = (n: string) => {
  const m = cardOf(n);
  return m ? roleOf({ type: m.type, text: m.text }) : [];
};

export interface SwapRun {
  cmdr: string;
  deck: string;
  fit: number;
  /** Slots whose missing card has a text job, and how many first picks shared one. */
  jobSlots: number;
  jobHits: number;
  /** Top 3 per hidden card, for comparing two versions of the ranking pick by pick. */
  picks: string[][];
}

export function swapDeck(cmdr: string, d: FDeck, evidence: Evidence, caller: Caller, hideN = 10, noiseN = 300): SwapRun {
  const identity = cardOf(cmdr)!.ci;
  const r = rng(d.id * 17 + 3);
  const spell = (n: string) => { const m = cardOf(n); return !!m && m.legal && !isLand(m.type) && inIdentity(m.ci, identity); };
  const spells = d.cards.map(([n]) => n).filter((n) => !BASICS.has(norm(n)) && norm(n) !== norm(cmdr) && spell(n)).sort();
  const hidden = shuffled(spells, r).slice(0, hideN);
  const hiddenKeys = new Set(hidden.map(norm));
  const inDeck = new Set(d.cards.map(([n]) => norm(n)));
  const others = [...new Set(commanders.filter((c) => c !== cmdr).flatMap((c) => decksOf(c).flatMap((x) => x.cards.map(([n]) => n))))].filter((n) => !BASICS.has(norm(n)) && !inDeck.has(norm(n))).sort();
  const noise = shuffled(others, r).slice(0, noiseN).filter((n) => { const m = cardOf(n); return m && m.legal && inIdentity(m.ci, identity); });
  const pop = popularity(cmdr, d.id);
  const info = (name: string): SubCard => ({ name, type: cardOf(name)!.type, cmc: cardOf(name)!.cmc, incl: evidence === 'edhrec' ? pop(name) || undefined : undefined });
  const deck = [{ name: cmdr, qty: 1 }, ...d.cards.filter(([n]) => !hiddenKeys.has(norm(n)) && norm(n) !== norm(cmdr)).map(([name, qty]) => ({ name, qty }))];
  const ctx: DeckContext | undefined = caller === 'deck' ? { deck, cardOf, commander: cmdr, bracket: d.bracket ?? 4, aggression: 'hungry' } : undefined;
  const needs = ctx ? deckNeeds(ctx) : undefined;
  const pool = [...hidden, ...noise].map(info);
  let fit = 0;
  let jobSlots = 0;
  let jobHits = 0;
  const picks: string[][] = [];
  for (const h of hidden) {
    const top = rankSubs(info(h), pool.filter((c) => c.name !== h), 3, ctx, needs).map((c) => c.name);
    picks.push(top);
    fit += top.filter((n) => hiddenKeys.has(norm(n))).length / 3;
    const want = textRoles(h);
    if (want.length && top[0]) {
      jobSlots++;
      if (textRoles(top[0]).some((x) => want.includes(x))) jobHits++;
    }
  }
  return { cmdr, deck: d.name, fit: fit / Math.max(1, hidden.length), jobSlots, jobHits, picks };
}

export function runSwap(evidence: Evidence, caller: Caller) {
  const rows = commanders.flatMap((c) => decksOf(c).map((d) => swapDeck(c, d, evidence, caller)));
  const slots = rows.reduce((n, r) => n + r.jobSlots, 0);
  return { rows, fit: mean(rows.map((r) => r.fit)), job: rows.reduce((n, r) => n + r.jobHits, 0) / Math.max(1, slots) };
}

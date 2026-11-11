// Suggestion benchmark (overhaul phase 2): does the brain's "what next?" list find the cards a real deck is missing?
// Take a real public deck, hide some of its spells, put them back in a binder with ~300 random cards, and ask the same
// suggestCards the Forge uses for its top picks. Plain counting, no AI judging AI.
//
// Two readings per deck:
// - 'edhrec': candidates carry how often this commander's other public decks play them (the stand-in for EDHREC
//   inclusion). This is today's normal case.
// - 'none': no popularity at all, as for an owned card EDHREC doesn't list for this commander. Here the brain can only
//   use what a card does (roles, combos, the deck's needs, themes). This is the number the overhaul has to move.
import { suggestCards, type DeckContext } from '../../src/brain/score';
import { inIdentity } from '../../src/brain/identity';
import { rng } from '../../src/brain/wildcard';
import { BASICS } from '../../src/lib/compare';
import { isLand } from '../../src/lib/deckstats';
import { norm } from '../../src/lib/names';
import { cardOf, commanders, decksOf, popularity } from './measure';

export type Evidence = 'edhrec' | 'none';
export interface Next {
  cmdr: string;
  deck: string;
  evidence: Evidence;
  hidden: number;
  /** Share of the hidden cards in the top 10 / top 20 suggestions. */
  at10: number;
  at20: number;
  /** 1 / position of the first hidden card in the list (0 when none shows up in the top 50). */
  first: number;
  top: string[];
}

function shuffled<T>(xs: T[], r: () => number) {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function nextCards(cmdr: string, d: { id: number; name: string; bracket: number | null; cards: [string, number][] }, evidence: Evidence, hideN = 10, noiseN = 300): Next {
  const identity = cardOf(cmdr)!.ci;
  const r = rng(d.id * 7 + 1);
  const spells = d.cards.map(([n]) => n).filter((n) => !BASICS.has(norm(n)) && norm(n) !== norm(cmdr) && cardOf(n) && !isLand(cardOf(n)!.type)).sort();
  const hidden = shuffled(spells, r).slice(0, hideN);
  const hiddenKeys = new Set(hidden.map(norm));
  const deck = [{ name: cmdr, qty: 1 }, ...d.cards.filter(([n]) => !hiddenKeys.has(norm(n)) && norm(n) !== norm(cmdr)).map(([name, qty]) => ({ name, qty }))];
  const inDeck = new Set(d.cards.map(([n]) => norm(n)));
  const others = [...new Set(commanders.filter((c) => c !== cmdr).flatMap((c) => decksOf(c).flatMap((x) => x.cards.map(([n]) => n))))].filter((n) => !BASICS.has(norm(n)) && !inDeck.has(norm(n))).sort();
  const noise = shuffled(others, r).slice(0, noiseN);
  const pop = popularity(cmdr, d.id);
  // The binder as the Forge sees it: legal, inside the commander's colours (brain/candidates.ts).
  const candidates = [...hidden, ...noise]
    .filter((n) => { const m = cardOf(n); return m && m.legal && inIdentity(m.ci, identity); })
    .map((name) => ({ name, type: cardOf(name)!.type, cmc: cardOf(name)!.cmc, incl: evidence === 'edhrec' ? pop(name) || undefined : undefined }));
  const ctx: DeckContext = { deck, cardOf, commander: cmdr, bracket: d.bracket ?? 4, aggression: 'hungry' };
  const top = suggestCards(candidates, ctx, 50).filter((s) => !s.blocked).map((s) => s.name);
  const hit = (n: number) => top.slice(0, n).filter((x) => hiddenKeys.has(norm(x))).length / Math.max(1, hidden.length);
  const firstAt = top.findIndex((x) => hiddenKeys.has(norm(x)));
  return { cmdr, deck: d.name, evidence, hidden: hidden.length, at10: hit(10), at20: hit(20), first: firstAt < 0 ? 0 : 1 / (firstAt + 1), top: top.slice(0, 10) };
}

export const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
export function runSuggest(evidence: Evidence) {
  const rows = commanders.flatMap((c) => decksOf(c).map((d) => nextCards(c, d, evidence)));
  return { rows, at10: mean(rows.map((r) => r.at10)), at20: mean(rows.map((r) => r.at20)), first: mean(rows.map((r) => r.first)) };
}

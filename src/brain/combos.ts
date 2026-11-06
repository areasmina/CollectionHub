import { combosIn, isEarly } from '../lib/deckstats';
import { norm } from '../lib/names';
import { brainData, type Combo } from './data';
import { comboAllowed } from './win';

/** Combos for the views (veteran playtest round 2, C1): in the deck, one card away, and what a swap would break. */

/** Two-card combos complete in the deck (the commander counts), earliest first. */
export const deckCombos = (names: string[], index = brainData().combos) => (index ? combosIn(names, index) : []);

/** Combos that taking `card` out of the deck would break: "breaks Kinnan + Basalt Monolith". */
export function comboBreaks(card: string, names: string[], index = brainData().combos): Combo[] {
  return deckCombos(names, index).filter((c) => c.cards.some((n) => norm(n) === norm(card)));
}

/** What swapping `out` for `inn` does to combos: lost ones, and new ones `inn` completes with the rest of the deck. */
export function swapEffect(out: string, inn: string, names: string[], bracket: number, index = brainData().combos) {
  const rest = names.filter((n) => norm(n) !== norm(out));
  const lost = comboBreaks(out, names, index);
  const gained = deckCombos([...rest, inn], index).filter((c) => c.cards.some((n) => norm(n) === norm(inn)));
  return { lost, gained, gainedBlocked: gained.filter((c) => !comboAllowed(c, bracket)) };
}

/**
 * Combos one card away: one piece in the deck, the other owned but not in it (`inBinder`), or not owned at all.
 * Owned ones first (that's the brain's whole point), then early ones, then cheaper.
 */
export function nearCombos(names: string[], owned: Set<string>, index = brainData().combos) {
  if (!index) return [];
  const have = new Set(names.map(norm));
  const out = new Map<string, { combo: Combo; add: string; owned: boolean }>();
  for (const k of have)
    for (const c of index.get(k) ?? []) {
      const missing = c.cards.filter((n) => !have.has(norm(n)));
      if (missing.length !== 1) continue;
      out.set(c.id, { combo: c, add: missing[0], owned: owned.has(norm(missing[0])) });
    }
  return [...out.values()].sort((a, b) => Number(b.owned) - Number(a.owned) || Number(isEarly(b.combo)) - Number(isEarly(a.combo)) || a.combo.mv - b.combo.mv);
}

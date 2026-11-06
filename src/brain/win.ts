import { combosIn, isEarly } from '../lib/deckstats';
import type { Card } from '../lib/db';
import { brainData, type Combo } from './data';

/**
 * The brain's first question for every deck: how does it kill? Rule-based reading of Oracle text (ported from
 * Deck Wizard's win plans, PLAN_RX) plus two-card combos from Commander Spellbook. It counts real ways to win; it
 * never claims a turn number.
 */
export type Plan = 'overrun' | 'drain' | 'voltron' | 'alt' | 'combo';

const PLAN_RX: Record<Exclude<Plan, 'combo'>, RegExp> = {
  overrun:
    /creatures you control (gain [^.]{0,40}? and )?get \+(x|\d+)\/\+(x|\d+)[^.]{0,60}until end of turn|until end of turn, creatures you control (gain [^.]{0,40}? and )?get \+(x|\d+)\/\+(x|\d+)|creatures you control gain [^.]{0,40}double strike[^.]{0,40}until end of turn/i,
  drain:
    /(whenever|at the beginning of) [^.]{0,80}(\. if you do, )?(each opponent loses (x|\d+) life|deals? (x|\d+) damage to each opponent)|each opponent loses (x|[5-9]|\d\d) life|deals? (x|[5-9]|\d\d) damage to each opponent|(each opponent loses life|damage to each opponent) equal to|each opponent loses \w+ life for each|deals? \w+ damage to each opponent for each|repeat the following process x times[^.]*\. each opponent loses/i,
  voltron:
    /(equipped|enchanted) creature (gets \+([2-9x]|\d\d)\/\+|has double strike|has [^.]{0,30}can't be blocked)|(equipped|enchanted) creature gets [^.]{0,20}and has [^.]{0,30}(double strike|can't be blocked)|target creature gains double strike/i,
  alt: /\byou win the game\b|(each opponent|target player|that player) loses the game|additional combat phase|double strike and trample/i,
};

export const PLAN_NAME: Record<Plan, string> = {
  overrun: 'Overrun (team pump)',
  drain: 'Drain / burn each opponent',
  voltron: 'Voltron (one big threat)',
  alt: 'Alternate win / extra combat',
  combo: 'Two-card combo',
};

/** Which finisher plans a card's text supports (empty = not a finisher). */
export function finisherPlans(c: Pick<Card, 'text'>): Exclude<Plan, 'combo'>[] {
  const t = (c.text ?? '').replace(/\([^)]*\)/g, ''); // reminder text out: "(This creature can't be blocked…)" isn't a plan
  return (Object.keys(PLAN_RX) as Exclude<Plan, 'combo'>[]).filter((p) => PLAN_RX[p].test(t));
}

export interface WinRoute {
  plan: Plan;
  cards: string[];
  source: 'card text' | 'Commander Spellbook';
  /** For combos: whether the given bracket's rules allow it. */
  allowed?: boolean;
  early?: boolean;
}
export interface KillCheck {
  routes: WinRoute[];
  /** Ways to win the bracket allows: combos count once each, finishers once each. */
  count: number;
  /** The plan with the most routes. */
  main?: Plan;
  verdict: 'lethal' | 'thin' | 'none';
  /** Plain sentence for the UI. */
  says: string;
}

/** Can the bracket (2–5) run this combo? Official rules: none in II, none early in III. */
export const comboAllowed = (c: Combo, bracket: number) => (bracket <= 2 ? false : bracket === 3 ? !isEarly(c) : true);

/** Enough routes to call a deck lethal: 3, as Deck Wizard's Build Readiness check (READY_WIN). */
export const LETHAL_ROUTES = 3;

export function killCheck(cards: { name: string; card?: Pick<Card, 'text' | 'type'> }[], bracket = 4, index = brainData().combos): KillCheck {
  const routes: WinRoute[] = [];
  for (const c of cards) {
    if (!c.card) continue;
    for (const plan of finisherPlans(c.card)) routes.push({ plan, cards: [c.name], source: 'card text' });
  }
  if (index)
    for (const k of combosIn(cards.map((c) => c.name), index).filter((k) => k.relevant))
      routes.push({ plan: 'combo', cards: [...k.cards], source: 'Commander Spellbook', allowed: comboAllowed(k, bracket), early: isEarly(k) });
  // One card can carry two plans (a drain that is also an alt win): count it once.
  const counted = new Set<string>();
  for (const r of routes) if (r.allowed !== false) counted.add(r.cards.join('+'));
  const byPlan = new Map<Plan, number>();
  for (const r of routes) if (r.allowed !== false) byPlan.set(r.plan, (byPlan.get(r.plan) ?? 0) + 1);
  const main = [...byPlan].sort((a, b) => b[1] - a[1])[0]?.[0];
  const count = counted.size;
  const verdict = count >= LETHAL_ROUTES ? 'lethal' : count ? 'thin' : 'none';
  const blocked = routes.filter((r) => r.allowed === false).length;
  const says =
    (count ? `${count} way${count > 1 ? 's' : ''} to win${main ? `, mostly ${PLAN_NAME[main].toLowerCase()}` : ''}.` : 'No clear way to win yet.') +
    (verdict === 'thin' ? ` Lethal decks run ${LETHAL_ROUTES}+.` : '') +
    (blocked ? ` ${blocked} combo${blocked > 1 ? 's' : ''} this bracket doesn't allow.` : '');
  return { routes, count, main, verdict, says };
}

/**
 * The aggression dial. It moves the deck's role targets inside the usual 100-card template ranges (Command Zone /
 * EDHREC template, as in deckstats TARGETS): Patient leans on answers and cards, Lethal on threats and a low curve.
 * These are house ranges, stated as such in the UI, not measured optima.
 */
export type Aggression = 'patient' | 'hungry' | 'lethal';
export const AGGRESSION: Record<Aggression, { label: string; ramp: [number, number]; draw: [number, number]; removal: [number, number]; wipes: [number, number]; finishers: [number, number]; maxAvgMv: number }> = {
  patient: { label: 'Patient', ramp: [10, 12], draw: [10, 13], removal: [8, 11], wipes: [3, 5], finishers: [2, 4], maxAvgMv: 3.8 },
  hungry: { label: 'Hungry', ramp: [9, 12], draw: [9, 12], removal: [7, 10], wipes: [2, 4], finishers: [3, 6], maxAvgMv: 3.5 },
  lethal: { label: 'Lethal', ramp: [9, 11], draw: [8, 11], removal: [6, 9], wipes: [0, 2], finishers: [5, 8], maxAvgMv: 3.0 },
};

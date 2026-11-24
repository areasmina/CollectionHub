import { isLand, LANDS_BY_BRACKET, roleOf, TARGETS, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import type { SubCard } from '../lib/subs';
import { landFit } from './build';
import { brainData } from './data';
import { deckNeeds, scoreCard, type DeckContext, type Part, type Scored } from './score';
import { finisherPlans } from './win';

/**
 * The guided builder's steps (Guillermo, Nov 24, after EDHspace's flow): commander, mana base, then one card job at a
 * time. Each job step is a role the brain already counts (lib/deckstats.ts roleOf), with the target from the dial
 * (brain/win.ts AGGRESSION), so the guide, the Forge meters and the deck page all agree on what "enough ramp" means.
 */
export const STEPS = ['lands', 'ramp', 'draw', 'removal', 'wipes', 'plan', 'rest'] as const;
export type Step = (typeof STEPS)[number];
export const STEP_LABEL: Record<Step, string> = {
  lands: 'Mana base',
  ramp: 'Ramp',
  draw: 'Card advantage',
  removal: 'Targeted disruption',
  wipes: 'Mass disruption',
  plan: 'Plan',
  rest: 'The rest',
};
const STEP_ROLE: Partial<Record<Step, Role>> = { ramp: 'ramp', draw: 'draw', removal: 'removal', wipes: 'wipes' };

export interface StepPick extends Scored {
  /** EDHREC's play rate for this commander (0–1), for the optional reference only: never part of `total`. */
  incl?: number;
}
export interface StepRead {
  step: Step;
  /** How many the deck has now for this step, and the usual range (none for "the rest"). */
  have: number;
  target?: [number, number];
  /** Your cards for this step, our order first: best first, cards the bracket forbids last and marked. */
  picks: StepPick[];
}

/** Does this card belong in this step's list? A card with two jobs shows in both steps (it counts once in the deck). */
function inStep(step: Step, c: SubCard, ctx: DeckContext, comboWith: (name: string) => boolean): boolean {
  const meta = ctx.cardOf(c.name);
  const type = meta?.type ?? c.type;
  if (step === 'lands') return isLand(type);
  if (isLand(type)) return false;
  if (step === 'rest') return true;
  if (!meta) return false; // no card data yet: we can't tell its job, so it waits for "the rest"
  const role = STEP_ROLE[step];
  if (role) return roleOf({ ...meta, name: c.name }).includes(role);
  // Plan: a way to win, a card of the theme you picked, or the missing half of a combo with a card in the deck.
  return finisherPlans(meta).length > 0 || !!(ctx.focus && ctx.focus.test(meta)) || comboWith(c.name);
}

/**
 * One step of the guided builder: your cards for that job, ranked by our own score (DeckContext.evidence 'own':
 * EDHREC's play rate and lift stay out of the order, how good the card is at its job comes in), with what the deck
 * has and the target. EDHREC's play rate rides along on each pick as `incl` for the optional reference.
 *
 * `candidates` are your cards that can legally go in (brain/candidates.ts binderCandidates: in the colours, legal).
 * Pure: no storage, no network.
 */
export function stepPicks(step: Step, candidates: SubCard[], ctxIn: DeckContext, o: { n?: number; identity?: string[] } = {}): StepRead {
  const n = o.n ?? 20;
  const ctx: DeckContext = { ...ctxIn, evidence: 'own' };
  const needs = deckNeeds(ctx);
  const s = needs.stats;
  let have: number;
  let target: [number, number] | undefined;
  if (step === 'lands') {
    have = s.lands;
    target = LANDS_BY_BRACKET[ctx.bracket] ?? TARGETS.lands;
  } else if (step === 'plan') {
    have = needs.kill.count;
    target = needs.dial.finishers;
  } else if (step === 'rest') {
    have = s.total;
    target = [100, 100];
  } else {
    const role = STEP_ROLE[step]!;
    have = s.roles[role];
    target = needs.range(role);
  }

  // Mana base: the commander's colours, each weighted by how much the deck so far asks for it (coloured mana symbols).
  // Before any spell is in, every colour counts the same.
  const colours = ['W', 'U', 'B', 'R', 'G'].filter((x) => !o.identity || o.identity.includes(x));
  const pips: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
  if (step === 'lands')
    for (const dc of ctx.deck) for (const sym of ctx.cardOf(dc.name)?.mana?.match(/\{[^}]+\}/g) ?? []) for (const x of colours) if (sym.includes(x)) pips[x] += dc.qty;
  const maxPips = Math.max(...colours.map((x) => pips[x]), 0);
  const demand = (x: string) => (maxPips ? pips[x] / maxPips : 1);

  const comboWith = (name: string) => {
    const index = combosOf(name);
    return index.some((k) => k.some((other) => norm(other) !== norm(name) && needs.names.has(norm(other))));
  };

  const picks: StepPick[] = [];
  const seen = new Set<string>();
  for (const c of candidates) {
    const k = norm(c.name);
    if (seen.has(k) || needs.names.has(k)) continue;
    seen.add(k);
    if (!inStep(step, c, ctx, comboWith)) continue;
    const sc = scoreCard(c, ctx, needs);
    let { parts, total } = sc;
    const meta = ctx.cardOf(c.name);
    if (step === 'lands' && meta) {
      const f = landFit(meta, colours, demand);
      const extra: Part[] = [];
      if (f.made >= 2) extra.push({ label: `makes ${f.cols.join('')} for this deck`, value: f.colour, source: 'card text' });
      else if (f.colour) extra.push({ label: `makes ${f.cols.join('')}`, value: f.colour, source: 'card text' });
      if (f.tapped) extra.push({ label: 'enters tapped', value: f.tapped, source: 'card text' });
      parts = [...parts, ...extra];
      total += extra.reduce((x, p) => x + p.value, 0);
    }
    picks.push({ name: c.name, total, parts, ...(sc.blocked ? { blocked: sc.blocked } : {}), ...(c.incl != null ? { incl: c.incl } : {}) });
  }
  picks.sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.total - a.total || a.name.localeCompare(b.name));
  return { step, have, target, picks: picks.slice(0, n) };
}

/** The other cards of each two-card combo this card is in (Commander Spellbook file), as name lists. */
function combosOf(name: string): string[][] {
  return (brainData().combos?.get(norm(name)) ?? []).map((k) => k.cards);
}

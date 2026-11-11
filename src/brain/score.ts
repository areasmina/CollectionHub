import { edhSignal, type SubCard } from '../lib/subs';
import { roleOf, deckStats, isLand, LANDS_BY_BRACKET, TARGETS, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import type { Card, DeckCard } from '../lib/db';
import { brainData } from './data';
import { AGGRESSION, comboAllowed, finisherPlans, killCheck, type Aggression } from './win';
import { tasteFor, type TasteEvent } from './taste';
import { themeRoleOf, type Theme } from './themes';

/**
 * scoreCard / suggestCards: one needs-aware score for "what should go in this slot", shared by every view.
 * The score is a sum of named parts, each with its source, so "why this card" shows real parts and no invented
 * percentage. Scale: an EDHREC inclusion share (0–1) is the unit; every other part is a small, stated nudge.
 */
export interface Part {
  label: string;
  value: number;
  source: 'EDHREC' | 'Commander Spellbook' | 'Scryfall Tagger' | 'card text' | 'deck needs' | 'your taste' | 'bracket rules';
}
export interface Scored {
  name: string;
  total: number;
  parts: Part[];
  /** Set when the bracket rules forbid the card here (it completes a combo the bracket doesn't allow). */
  blocked?: string;
}

export interface DeckContext {
  /** Cards in the deck now (commander included). */
  deck: DeckCard[];
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana'> | undefined;
  commander?: string;
  bracket: number; // 2–5
  aggression: Aggression;
  taste?: TasteEvent[];
  /** The theme you build towards (an EDHREC tag as a rules-text test, brain/themes.ts): fitting cards get a stated nudge. */
  focus?: Theme;
}

const NEED = 0.15; // per role the deck is short of (at most two roles)
const SURPLUS = -0.05; // a role already above the usual range
const WIN_NEED = 0.2; // a finisher while the deck has fewer ways to win than the dial asks for
const COMBO = 0.25; // completes a two-card combo the bracket allows
const THEME = 0.15; // fits the theme you picked (Deck Wizard FOCUS_W)
const BALANCE = 0.08; // enabler/payoff balance when the deck has one half of an engine without the other
const SIGNAL_W = 0.5; // EDHREC lift, on the old synergy scale (Deck Wizard SYN_W)
const ROLE_LABEL: Record<Role, string> = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipes: 'board wipes', tutors: 'tutors' };

/** What the deck has and lacks, computed once per deck state. */
export function deckNeeds(ctx: DeckContext) {
  const stats = deckStats(ctx.deck, ctx.cardOf, ctx.commander);
  const dial = AGGRESSION[ctx.aggression];
  const kill = killCheck(ctx.deck.map((c) => ({ name: c.name, card: ctx.cardOf(c.name) })), ctx.bracket);
  const range = (r: Role): [number, number] | undefined => (r === 'tutors' ? undefined : dial[r]);
  const themeBalance = { enablers: 0, payoffs: 0 };
  if (ctx.focus) {
    for (const c of ctx.deck) {
      const m = ctx.cardOf(c.name);
      if (!m) continue;
      const tr = themeRoleOf(ctx.focus.label, m);
      if (tr === 'enabler') themeBalance.enablers += c.qty;
      else if (tr === 'payoff') themeBalance.payoffs += c.qty;
    }
  }
  return { stats, dial, kill, range, themeBalance, names: new Set(ctx.deck.map((c) => norm(c.name))) };
}
export type Needs = ReturnType<typeof deckNeeds>;

export function scoreCard(c: SubCard, ctx: DeckContext, needs: Needs = deckNeeds(ctx)): Scored {
  const parts: Part[] = [];
  const card = ctx.cardOf(c.name);
  if (c.incl) parts.push({ label: `in ${Math.round(c.incl * 100)}% of decks`, value: c.incl, source: 'EDHREC' });
  const sig = edhSignal(c);
  if (sig) parts.push({ label: c.lift != null ? `${c.lift.toFixed(1)}x lift` : 'synergy', value: SIGNAL_W * sig, source: 'EDHREC' });

  const roles = card ? roleOf({ ...card, name: c.name }) : [];
  const src = brainData().roles?.has(norm(c.name)) ? 'Scryfall Tagger' : 'card text';
  let short = 0;
  for (const r of roles) {
    const rg = needs.range(r);
    if (!rg) continue;
    const have = needs.stats.roles[r];
    if (have < rg[0] && short < 2) {
      short++;
      parts.push({ label: `fills ${ROLE_LABEL[r]} (deck has ${have}, ${needs.dial.label} wants ${rg[0]}–${rg[1]})`, value: NEED, source: src });
    } else if (have > rg[1]) parts.push({ label: `deck already has ${have} ${ROLE_LABEL[r]}`, value: SURPLUS, source: 'deck needs' });
  }

  // Lands are a need too: a deck short of lands for its size values a land, a deck at the top of the range doesn't.
  // The range is the bracket's (cEDH runs fewer), scaled to how full the deck is so a half-built list isn't all lands.
  const type = card?.type ?? c.type;
  if (type && isLand(type)) {
    const [lo, hi] = LANDS_BY_BRACKET[ctx.bracket] ?? TARGETS.lands;
    const have = needs.stats.lands;
    const wantNow = Math.round(lo * Math.min(1, needs.stats.total / 100));
    if (have < wantNow) parts.push({ label: `fills lands (deck has ${have}, usual is ${lo}–${hi})`, value: NEED, source: 'deck needs' });
    else if (have >= hi) parts.push({ label: `deck already has ${have} lands`, value: SURPLUS, source: 'deck needs' });
  }

  if (card && finisherPlans(card).length && needs.kill.count < needs.dial.finishers[0])
    parts.push({ label: `a way to win (deck has ${needs.kill.count}, ${needs.dial.label} wants ${needs.dial.finishers[0]}+)`, value: WIN_NEED, source: 'card text' });

  let blocked: string | undefined;
  for (const k of brainData().combos?.get(norm(c.name)) ?? []) {
    const other = k.cards.find((n) => norm(n) !== norm(c.name))!;
    if (!needs.names.has(norm(other))) continue;
    if (!comboAllowed(k, ctx.bracket)) blocked = `completes ${k.cards.join(' + ')}, which bracket ${ctx.bracket} doesn't allow`;
    else if (k.relevant) {
      parts.push({ label: `combo with ${other}`, value: COMBO, source: 'Commander Spellbook' });
      break;
    }
  }

  if (card?.cmc != null && card.cmc > 4 && needs.stats.avgMv > needs.dial.maxAvgMv)
    parts.push({ label: `curve already high (${needs.stats.avgMv.toFixed(1)} average)`, value: -0.03 * (card.cmc - 4), source: 'deck needs' });

  if (ctx.focus && card && ctx.focus.test(card)) {
    const lbl = ctx.focus.label.toLowerCase();
    parts.push({ label: `fits ${lbl}`, value: THEME, source: 'card text' });
    const tr = themeRoleOf(ctx.focus.label, card);
    const { enablers, payoffs } = needs.themeBalance;
    if (tr === 'enabler' && payoffs >= 3 && enablers < Math.ceil(payoffs * 0.75)) {
      parts.push({ label: `enabler for ${lbl} (deck has ${payoffs} payoffs, ${enablers} enablers)`, value: BALANCE, source: 'deck needs' });
    } else if (tr === 'payoff' && enablers >= 4 && payoffs < 2) {
      parts.push({ label: `payoff for ${lbl} (deck has ${enablers} enablers, ${payoffs} payoffs)`, value: BALANCE, source: 'deck needs' });
    }
  }

  const t = ctx.taste ? tasteFor(ctx.taste, norm(c.name), c.name) : null;
  if (t) parts.push({ label: t.why, value: t.delta, source: 'your taste' });

  const total = parts.reduce((n, p) => n + p.value, 0);
  return { name: c.name, total, parts, ...(blocked ? { blocked } : {}) };
}

/** Best candidates for the deck now, highest score first; cards the bracket forbids go last, marked. */
export function suggestCards(candidates: SubCard[], ctx: DeckContext, n = 10): Scored[] {
  const needs = deckNeeds(ctx);
  return candidates
    .filter((c) => !needs.names.has(norm(c.name)))
    .map((c) => scoreCard(c, ctx, needs))
    .sort((a, b) => Number(!!a.blocked) - Number(!!b.blocked) || b.total - a.total || a.name.localeCompare(b.name))
    .slice(0, n);
}

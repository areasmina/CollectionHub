import type { SubCard } from '../lib/subs';
import { isEarly, roleOf, roleSource, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import { comboBreaks } from './combos';
import { brainData } from './data';
import { scoreCard, type DeckContext, type Part } from './score';
import { comboAllowed, finisherPlans, PLAN_NAME } from './win';

/**
 * "Why this card?" (Deck Wizard's WHY panel, ported as data): the real parts behind a card in a deck, each with its
 * source, and no invented percentage. The score parts are computed as if the card were the next pick (the deck without
 * it), so "fills card draw (deck has 8…)" reads true for the card itself.
 */
export interface Why {
  name: string;
  /** How it got into the deck. */
  how: 'edhrec' | 'swap' | 'stand-in' | 'wildcard' | 'pin' | 'commander' | 'yours';
  headline: string;
  parts: Part[];
  roles: { role: Role; source: string }[];
  plans: string[];
  combos: { with: string; early: boolean; allowed: boolean }[];
  gameChanger: boolean;
  /** Plain warnings: breaks a combo if cut, a Game Changer counts toward the bracket cap, blocked by the bracket. */
  notes: string[];
}

const ROLE_WORD: Record<Role, string> = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipes: 'board wipe', tutors: 'tutor' };

export function whyCard(o: {
  name: string;
  ctx: DeckContext;
  rec?: SubCard;
  how?: Why['how'];
  /** For a stand-in or swap: the EDHREC card whose slot it took. */
  slot?: string;
  gc?: Set<string> | null;
}): Why {
  const { name, ctx } = o;
  const rest = { ...ctx, deck: ctx.deck.filter((c) => norm(c.name) !== norm(name)) };
  const scored = scoreCard(o.rec ?? { name }, rest);
  const card = ctx.cardOf(name);
  const roles = card ? roleOf({ ...card, name }).map((role) => ({ role, source: roleSource(name) })) : [];
  const plans = card ? finisherPlans(card).map((p) => PLAN_NAME[p]) : [];
  const names = ctx.deck.map((c) => c.name);
  const combos = (brainData().combos?.get(norm(name)) ?? [])
    .map((k) => ({ k, other: k.cards.find((n) => norm(n) !== norm(name))! }))
    .filter(({ other }) => names.some((n) => norm(n) === norm(other)))
    .map(({ k, other }) => ({ with: other, early: isEarly(k), allowed: comboAllowed(k, ctx.bracket) }));
  const gameChanger = !!o.gc?.has(norm(name));
  const how = o.how ?? (name === ctx.commander ? 'commander' : o.rec?.incl != null ? 'edhrec' : 'yours');
  const lead: Record<Why['how'], string> = {
    commander: 'Your commander.',
    edhrec: o.rec?.incl != null ? `EDHREC: in ${Math.round(o.rec.incl * 100)}% of this commander's decks.` : 'On EDHREC\'s list for this commander.',
    swap: `Your swap${o.slot ? ` for ${o.slot}` : ''}.`,
    'stand-in': `Stand-in from your binder${o.slot ? ` for ${o.slot}` : ''}.`,
    wildcard: 'WILDCARD: a card with evidence that most lists skip.',
    pin: 'Pinned by you: always in.',
    yours: 'From your binder.',
  };
  const notes: string[] = [];
  if (scored.blocked) notes.push(scored.blocked);
  const breaks = comboBreaks(name, names);
  if (breaks.length) notes.push(`Cutting it breaks ${breaks.map((k) => k.cards.join(' + ')).join(', ')}.`);
  if (gameChanger) notes.push(`Game Changer: counts toward the bracket's cap (none in II, 3 in III).`);
  if (!roles.length && !plans.length && !combos.length && !scored.parts.length) notes.push('No stated reason found: a candidate to cut.');
  const job = [...roles.map((r) => ROLE_WORD[r.role]), ...plans.map((p) => `wins by ${p.toLowerCase()}`)];
  const headline = `${lead[how]}${job.length ? ` Does: ${job.join(', ')}.` : ''}`;
  return { name, how, headline, parts: scored.parts, roles, plans, combos, gameChanger, notes };
}

import type { SubCard } from '../lib/subs';
import { isLand, roleOf, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import { comboBreaks } from './combos';
import { deckNeeds, scoreCard, type DeckContext, type Needs, type Part, type Scored } from './score';
import { ENGINES, profileOf } from './synergy';
import { comboAllowed } from './win';

/**
 * The deck session (overhaul phase 2): one read of a deck that every screen can share. Given the deck as it stands
 * and the cards you could add, it answers the four questions a builder keeps asking:
 *   what does the deck need, what should go in next, what is the weakest card in it, and which owned card would do a
 *   weak card's job better.
 * All four use the same scoreCard, so a card can't be "our pick" in one panel and a suggested cut in another.
 * Pure: no storage, no network. Recompute it when the deck changes (readDeck is the whole live analysis).
 */
export interface Cut {
  name: string;
  /** What the card is worth to this deck, scored as if it were the next pick (the deck without it). */
  total: number;
  parts: Part[];
  /** One plain line: why it is the weakest. */
  why: string;
  /** Set when the card holds up a role the deck is short of: swap it for another card of that role, don't just cut it. */
  holds?: string;
}
export interface Kept {
  name: string;
  total: number;
  /** Why a low-scoring card is not offered as a cut. */
  reason: string;
}
export interface Upgrade {
  out: string;
  in: string;
  /** How much better the new card scores in this deck. */
  gain: number;
  /** The job both cards do ("card draw", "tokens"), or the type they share. */
  job: string;
  /** The new card's strongest reasons. */
  parts: Part[];
}
export interface DeckRead {
  needs: Needs;
  suggestions: Scored[];
  /** Weakest cards first. */
  cuts: Cut[];
  /** Low scorers the brain refuses to cut, with why (combo piece, pinned by you). */
  kept: Kept[];
  upgrades: Upgrade[];
}

const ROLE_WORD: Record<Role, string> = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipes: 'board wipes', tutors: 'tutors' };
/** An upgrade must beat the card it replaces by this much (a swap for a rounding error is noise). */
export const UPGRADE_MARGIN = 0.12;
const TYPES = ['Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
const mainType = (t = '') => TYPES.find((x) => t.includes(x)) ?? '';

/** The jobs a card does, as words: its roles, then the engines it makes. */
function jobsOf(name: string, card: { type: string; text: string } | undefined): string[] {
  if (!card) return [];
  const p = profileOf(card);
  return [...roleOf({ ...card, name }).map((r) => ROLE_WORD[r]), ...ENGINES.filter((_, i) => p.makes & (1 << i)).map((e) => e.label)];
}

export function readDeck(o: {
  ctx: DeckContext;
  /** Cards that could go in (owned cards first is the caller's choice; the session scores what it is given). */
  candidates: SubCard[];
  /** EDHREC's numbers for a card already in the deck, when known. */
  recOf?: (name: string) => SubCard | undefined;
  /** Cards you pinned "always in": never offered as a cut. */
  pinned?: string[];
  suggestions?: number;
  cuts?: number;
}): DeckRead {
  const { ctx } = o;
  const needs = deckNeeds(ctx);
  const pool = o.candidates.filter((c) => !needs.names.has(norm(c.name)));
  const scored = pool.map((c) => scoreCard(c, ctx, needs));
  const order = (a: Scored, b: Scored) => Number(!!a.blocked) - Number(!!b.blocked) || b.total - a.total || a.name.localeCompare(b.name);
  const suggestions = [...scored].sort(order).slice(0, o.suggestions ?? 10);

  // Every spell in the deck, scored as the next pick for the deck without it: the same question a suggestion answers.
  const pinned = new Set((o.pinned ?? []).map(norm));
  const names = ctx.deck.map((c) => c.name);
  const rated: (Cut & { keep?: string })[] = [];
  for (const dc of ctx.deck) {
    const card = ctx.cardOf(dc.name);
    if (!card || isLand(card.type) || (ctx.commander && norm(dc.name) === norm(ctx.commander))) continue;
    const rest: DeckContext = { ...ctx, deck: ctx.deck.filter((c) => c !== dc) };
    const restNeeds = deckNeeds(rest);
    const s = scoreCard({ ...o.recOf?.(dc.name), name: dc.name, type: card.type, cmc: card.cmc }, rest, restNeeds);
    let keep: string | undefined;
    let holds: string | undefined;
    const combo = comboBreaks(dc.name, names).find((k) => comboAllowed(k, ctx.bracket));
    if (pinned.has(norm(dc.name))) keep = 'pinned by you';
    else if (combo) keep = `part of ${combo.cards.join(' + ')}`;
    else {
      // A card holding up a role the deck is at or under the minimum of: cutting it opens a hole, so it is only
      // offered as a swap for another card of that role.
      const role = roleOf({ ...card, name: dc.name }).find((r) => {
        const rg = needs.range(r);
        return rg && needs.stats.roles[r] <= rg[0];
      });
      if (role) holds = ROLE_WORD[role];
    }
    const good = s.parts.filter((p) => p.value > 0);
    const why = s.blocked
      ? s.blocked
      : !good.length
        ? 'nothing ties it to this commander or this deck'
        : `its only pull: ${good
            .sort((a, b) => b.value - a.value)
            .slice(0, 2)
            .map((p) => p.label)
            .join(', ')}`;
    rated.push({ name: dc.name, total: s.total, parts: s.parts, why: holds ? `${why}; the deck has only ${needs.stats.roles[(Object.keys(ROLE_WORD) as Role[]).find((r) => ROLE_WORD[r] === holds)!]} ${holds}, so swap it rather than cut it` : why, keep, ...(holds ? { holds } : {}) });
  }
  rated.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
  const nCuts = o.cuts ?? 8;
  const cuts = rated.filter((r) => !r.keep).slice(0, nCuts).map(({ keep: _k, ...c }) => c);
  const floor = cuts.at(-1)?.total ?? -Infinity;
  const kept = rated.filter((r) => r.keep && r.total <= floor).map((r) => ({ name: r.name, total: r.total, reason: r.keep! }));

  // Upgrades: for each weak card, the best candidate that does the same job and scores clearly higher. One use each.
  const used = new Set<string>();
  const upgrades: Upgrade[] = [];
  const ranked = scored.filter((s) => !s.blocked).sort(order);
  const metaOf = (n: string) => ctx.cardOf(n) ?? undefined;
  for (const cut of cuts) {
    const cm = metaOf(cut.name);
    const cutJobs = jobsOf(cut.name, cm);
    for (const cand of ranked) {
      if (used.has(cand.name) || cand.total < cut.total + UPGRADE_MARGIN) continue;
      const m = metaOf(cand.name);
      if (!m || isLand(m.type)) continue;
      const candJobs = jobsOf(cand.name, m);
      if (cut.holds && !candJobs.includes(cut.holds)) continue;
      const shared = cut.holds ?? candJobs.find((j) => cutJobs.includes(j));
      const job = shared ?? (!cutJobs.length && mainType(m.type) && mainType(m.type) === mainType(cm?.type) ? mainType(m.type).toLowerCase() : undefined);
      if (!job) continue;
      used.add(cand.name);
      upgrades.push({ out: cut.name, in: cand.name, gain: cand.total - cut.total, job, parts: [...cand.parts].filter((p) => p.value > 0).sort((a, b) => b.value - a.value).slice(0, 3) });
      break;
    }
  }
  return { needs, suggestions, cuts, kept, upgrades };
}

/** "Swap Vanilla Bear for Mind Rot: both are discard, and Mind Rot feeds Doctor Doom." */
export function upgradeLine(u: Upgrade): string {
  const lead = u.parts[0]?.label;
  return `${u.in} for ${u.out}: same job (${u.job})${lead ? `, and it ${/^(feeds|pays off|fills|fits|completes|combo)/.test(lead) ? lead : `has ${lead}`}` : ''}.`;
}

export interface SubCard {
  name: string;
  category?: string; // EDHREC list the card sits in on the commander page
  type?: string; // Scryfall type line
  cmc?: number;
  synergy?: number; // EDHREC's old signal (pages fetched before Oct 1, 2026)
  lift?: number; // EDHREC's signal since Oct 1, 2026: how much more decks of this commander play the card (1 = no more than usual)
  incl?: number; // inclusion 0–1
}

/**
 * How strongly EDHREC ties a card to this commander, on the old synergy scale (about -1 to 1) so the weights below keep
 * their meaning: lift 2x = 0.5, 4x = 1, 1x = 0, 0.5x = -0.5. Falls back to synergy for pages cached before lift existed.
 */
export function edhSignal(c: SubCard): number {
  if (c.lift != null && c.lift > 0) return Math.max(-1, Math.min(1, Math.log2(c.lift) / 2));
  return c.synergy ?? 0;
}

/** "2.4x lift" for a card clearly played more with this commander (lift 1.25+), or "+12% synergy" on old pages. */
function signalTag(c: SubCard): string | undefined {
  if (c.lift != null) return c.lift >= 1.25 ? `${c.lift.toFixed(1)}x lift` : undefined;
  return c.synergy && c.synergy >= 0.05 ? `+${pctOf(c.synergy)} synergy` : undefined;
}

import { brainData, CORE_MASK, CORE_ROLES, JOB_WORD, ROLE_BITS, type Job } from '../brain/data';
import { deckNeeds, scoreCard, type DeckContext, type Needs, type Part } from '../brain/score';
import { BASICS } from './compare';
import { norm } from './names';

const TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
export const mainType = (type = '') => TYPES.find((t) => type.includes(t)) ?? '';

/** A card's Scryfall Tagger roles by name (bits of ROLE_BITS), when the brain's roles file knows it. */
const tagBits = (name: string) => brainData().roles?.get(norm(name));
/** A Tagger role in plain words (the deck-count roles keep their short names). */
const roleWord = (r: (typeof ROLE_BITS)[number]) => (r in JOB_WORD ? JOB_WORD[r as Job] : r);
/** Roles two cards share, by Tagger tags (undefined when either card isn't tagged). */
export function sharedRoles(a: string, b: string): (typeof ROLE_BITS)[number][] | undefined {
  const x = tagBits(a);
  const y = tagBits(b);
  if (x == null || y == null) return undefined;
  return ROLE_BITS.filter((_, i) => x & y & (1 << i));
}

/** One part of a stand-in's score: a brain part (brain/score.ts Part) plus whether the swap window names it as a reason. */
export interface StandInPart extends Part {
  /** Named among the reasons even at no score (a different mana value is still worth saying). */
  say?: boolean;
}
export interface StandIn {
  name: string;
  /** The ranking number: what ties the card to the missing one, EDHREC, and (with a deck) the brain's parts. */
  total: number;
  /** In the order the swap window names them. */
  parts: StandInPart[];
  /** Set when the bracket rules forbid the card in this deck (brain/score.ts scoreCard). */
  blocked?: string;
}

// Weights on the brain's scale (an EDHREC inclusion share, 0–1, is the unit; brain/score.ts). They are the swap
// window's long-standing weights divided by 4, so the picks stay what they were when the two scorers were separate.
const W = {
  core: 0.75, // each deck-count role (ramp, draw, removal…) the two cards share (Scryfall Tagger)
  other: 0.25, // each other job (recursion, sacrifice outlet…) they share
  noJob: -0.75, // the stand-in does none of the missing card's deck-count jobs
  category: 1, // the same EDHREC list on the commander page
  type: 0.5, // the same card type
  mv: 0.125, // per point of mana value closer than 2 apart
  signal: 0.25, // EDHREC lift (on the old synergy scale)
  incl: 0.25, // EDHREC inclusion share
} as const;

/**
 * One score for a stand-in: what the card has in common with the missing one, what EDHREC says, and, when `ctx` is
 * given (a saved deck), every non-EDHREC part of the brain's scoreCard (deck needs, combos, themes, copies, taste).
 * What the card *does* comes first (veteran playtest round 2: Basalt Monolith was offered Sylvan Library). The swap
 * window ranks by `total` and names its reasons from `parts`, so the order and the reasons can't disagree.
 */
export function scoreStandIn(missing: SubCard, c: SubCard, ctx?: DeckContext, needs?: Needs): StandIn {
  const job: StandInPart[] = [];
  const shared = sharedRoles(missing.name, c.name);
  let jobV = 0;
  if (shared) {
    const core = shared.filter((r) => ROLE_BITS.indexOf(r) < CORE_ROLES).length;
    const other = shared.length - core;
    jobV = core ? W.core * core + W.other * other : (tagBits(missing.name) ?? 0) & CORE_MASK ? W.noJob : W.other * other;
    if (shared.length) job.push({ label: `Same job: ${shared.map(roleWord).join(', ')} (Scryfall Tagger)`, value: jobV, source: 'Scryfall Tagger' });
    else if (jobV) job.push({ label: 'Does none of its jobs', value: jobV, source: 'Scryfall Tagger' });
  }
  const catV = missing.category && c.category === missing.category ? W.category : 0;
  const t = mainType(c.type);
  const typeV = mainType(missing.type) && t === mainType(missing.type) ? W.type : 0;
  const mvV = missing.cmc != null && c.cmc != null ? Math.max(0, 2 - Math.abs(missing.cmc - c.cmc)) * W.mv : 0;
  const sigV = edhSignal(c) * W.signal;
  const inclV = (c.incl ?? 0) * W.incl;

  let brain: Part[] = [];
  let brainV = 0;
  let blocked: string | undefined;
  if (ctx) {
    const sc = scoreCard(c, ctx, needs ?? deckNeeds(ctx));
    blocked = sc.blocked;
    brain = sc.parts.filter((p) => p.source !== 'EDHREC');
    brainV = brain.reduce((sum, p) => sum + p.value, 0);
  }

  const parts: StandInPart[] = [];
  if (catV) parts.push({ label: `Same role: ${missing.category}`, value: catV, source: 'EDHREC' });
  parts.push(...job, ...brain);
  if (typeV) parts.push({ label: `${t} like it`, value: typeV, source: 'card text' });
  if (c.cmc != null && missing.cmc != null)
    parts.push({ label: c.cmc === missing.cmc ? `Same mana value (${c.cmc})` : `Mana value ${c.cmc} (vs ${missing.cmc})`, value: mvV, source: 'card text', say: true });
  const sig = signalTag(c);
  if (sigV || sig) parts.push({ label: sig ?? (c.lift != null ? `${c.lift.toFixed(1)}x lift` : 'synergy'), value: sigV, source: 'EDHREC', say: !!sig });
  if (c.incl) parts.push({ label: `In ${pctOf(c.incl)} of decks`, value: inclV, source: 'EDHREC', say: true });

  // Summed in the order the separate scorers added up, so ties fall exactly as before.
  const total = jobV + catV + typeV + mvV + sigV + inclV + brainV;
  return { name: c.name, total, parts, ...(blocked ? { blocked } : {}) };
}

/** Whether the swap window names this part as a reason: it helps, it's your taste, or it's always worth saying. */
const named = (p: StandInPart) => (p.say ?? p.value > 0) || p.source === 'your taste';

/**
 * Owned stand-ins for a missing card, best first (scoreStandIn). Basic lands are never offered, a land never stands in
 * for a spell or a spell for a land, and with a deck a card the bracket rules forbid is left out.
 */
export function rankSubs(missing: SubCard, candidates: SubCard[], n = 3, ctx?: DeckContext, preNeeds?: Needs): SubCard[] {
  const nd = ctx ? (preNeeds ?? deckNeeds(ctx)) : undefined;
  const isLand = (c: SubCard) => mainType(c.type) === 'Land';
  return candidates
    .filter((c) => c.name !== missing.name && !BASICS.has(norm(c.name)) && (!missing.type || !c.type || isLand(c) === isLand(missing)))
    .map((c) => ({ c, s: scoreStandIn(missing, c, ctx, nd) }))
    .filter((x) => !x.s.blocked)
    .sort((a, b) => b.s.total - a.s.total || a.c.name.localeCompare(b.c.name))
    .slice(0, n)
    .map((x) => x.c);
}

const pctOf = (n: number) => `${Math.round(n * 100)}%`;

/** Why a card is in the deck: its EDHREC role, how many decks run it, lift. */
export function whyIn(c: SubCard): string[] {
  const out: string[] = [];
  if (c.category) out.push(`Role: ${c.category}`);
  if (c.incl) out.push(`In ${pctOf(c.incl)} of decks`);
  const sig = signalTag(c);
  if (sig) out.push(sig);
  return out;
}

/** Short tags saying why an owned card was suggested for a missing one: the named parts of the same score rankSubs sorts by. */
export function reasonsFor(missing: SubCard, sub: SubCard, owned = 0, ctx?: DeckContext, needs?: Needs): string[] {
  const out = scoreStandIn(missing, sub, ctx, needs).parts.filter(named).map((p) => p.label);
  if (owned) out.push(`You own ×${owned}`);
  return out;
}

// Highlight lists aren't a role (Top Cards, High Lift…): a card's category is its type list (Creatures, Mana Artifacts…).
const META = /^(new cards|top cards|high synergy|high lift|game changers)/i;
/** What EDHREC says about each recommended card (key = norm(name)): its role list, how many decks play it, lift. */
export function recInfoOf(
  lists: { header: string; cards: { name: string; synergy?: number; lift?: number; decks?: number; potential?: number }[] }[],
  key: (name: string) => string,
  cardOf: (c: { name: string }) => { type?: string; cmc?: number } | undefined,
): Map<string, SubCard> {
  const out = new Map<string, SubCard>();
  for (const l of lists)
    for (const c of l.cards) {
      const prev = out.get(key(c.name));
      const meta = META.test(l.header);
      if (prev && (prev.category || meta)) continue;
      const sc = cardOf(c);
      out.set(key(c.name), { name: c.name, category: meta ? undefined : l.header, type: sc?.type, cmc: sc?.cmc, synergy: c.synergy, lift: c.lift, incl: c.potential ? (c.decks ?? 0) / c.potential : undefined });
    }
  return out;
}

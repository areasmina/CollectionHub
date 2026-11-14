import type { Card, DeckCard } from '../lib/db';
import { BASICS } from '../lib/compare';
import { deckStats, isLand, type BracketCall, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import { inIdentity } from './identity';
import { AGGRESSION, killCheck, type Aggression } from './win';

/**
 * Build Readiness (Deck Wizard's `readiness()`, ported): pass/fail checks on a 100-card deck, each with its value,
 * its target and where the target comes from. Two kinds:
 * - rules: what makes the deck legal (100 cards, singleton, Commander-legal, inside the colour identity). A deck
 *   that fails one is "not legal", whatever else it does.
 * - build: what makes it play well (lands, ramp, draw, removal, wipes, ways to win, curve, colour sources). Ranges
 *   are the aggression dial's (house ranges inside the EDHREC / Command Zone template, stated as such).
 * No score out of 10: the verdict is the count of checks passed.
 */
export type CheckKey = 'cards' | 'singleton' | 'legal' | 'identity' | 'lands' | Exclude<Role, 'tutors'> | 'win' | 'curve' | 'colours';
export interface Check {
  key: CheckKey;
  kind: 'rules' | 'build';
  label: string;
  value: string;
  target: string;
  ok: boolean;
  /** Plain sentence: what is wrong and which cards, or why it's fine. */
  says: string;
  /** Cards behind a failed rules check (off-colour, banned, duplicates). */
  cards?: string[];
}
export interface Readiness {
  checks: Check[];
  passed: number;
  verdict: 'ready' | 'almost' | 'not ready' | 'not legal';
}

/** "Any number of cards named …" (Relentless Rats, Shadowborn Apostle…) and "A deck can have up to N" cards. */
const ANY_NUMBER = /a deck can have (any number of|up to \w+) cards named/i;
/** Baseline land sources each colour of the identity should have; Karsten's pip math raises it for pip-heavy colours. */
export const SOURCES_MIN = 10;
const COLOURS = ['W', 'U', 'B', 'R', 'G'] as const;
const BASIC_TYPE: Record<string, (typeof COLOURS)[number]> = { Plains: 'W', Island: 'U', Swamp: 'B', Mountain: 'R', Forest: 'G' };

/**
 * Frank Karsten's 99-card Commander land count formula:
 *   lands = 31.42 + 3.13 * avgMv - 0.28 * cheapFlow
 * where `cheapFlow` is the number of cheap (MV <= 2) ramp and card-draw spells.
 * Clamped to [33, 40] for brackets 1–4, and [25, 31] for bracket 5 (cEDH).
 */
export function karstenLands(o: { avgMv: number; cheapFlow?: number; bracket?: number }): number {
  const flow = o.cheapFlow ?? 10;
  const raw = 31.42 + 3.13 * (o.avgMv || 3.0) - 0.28 * flow;
  if (o.bracket === 5) return Math.max(25, Math.min(31, Math.round(raw - 6)));
  return Math.max(33, Math.min(40, Math.round(raw)));
}

/**
 * Karsten-inspired coloured mana source targets per colour in the commander's identity.
 * Every colour starts at SOURCES_MIN (10), rising up to 18 for colours with heavy pip share or multiple double/triple-pip spells.
 */
export function karstenSources(o: {
  deck: DeckCard[];
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana'> | undefined;
  identity: string[];
}): Record<string, number> {
  const colours = COLOURS.filter((x) => o.identity.includes(x));
  if (!colours.length) return {};
  const pips: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
  const multiPip: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
  for (const c of o.deck) {
    const card = o.cardOf(c.name);
    if (!card || isLand(card.type)) continue;
    const syms = card.mana?.match(/\{[^}]+\}/g) ?? [];
    for (const x of colours) {
      const count = syms.filter((s) => s.includes(x)).length;
      if (count > 0) pips[x] += count * c.qty;
      if (count >= 2) multiPip[x] += (count - 1) * c.qty;
    }
  }
  const out: Record<string, number> = {};
  for (const x of colours) {
    const extra = Math.max(0, Math.floor((pips[x] - 20) / 6)) + Math.floor(multiPip[x] / 3);
    out[x] = Math.min(18, SOURCES_MIN + extra);
  }
  return out;
}

/** Colours a land can make, from its type line (basic land types) and its "Add …" text. */
export function landColours(c: Pick<Card, 'type' | 'text'>): Set<string> {
  const out = new Set<string>();
  for (const [t, col] of Object.entries(BASIC_TYPE)) if (new RegExp(`\\b${t}\\b`).test(c.type)) out.add(col);
  const text = c.text ?? '';
  if (/mana of any (one )?colou?r|any colou?r of mana|mana of any type/i.test(text)) COLOURS.forEach((x) => out.add(x));
  for (const m of text.matchAll(/add ([^.]*)/gi)) for (const s of m[1].match(/\{[WUBRG]\}/g) ?? []) out.add(s[1]);
  // Fetch lands: "Search your library for a Plains or Island card" counts as both.
  for (const m of text.matchAll(/search your library for an? ([^.]*?) card/gi)) for (const [t, col] of Object.entries(BASIC_TYPE)) if (m[1].includes(t)) out.add(col);
  return out;
}

/**
 * The four rules checks alone (100 cards, singleton, Commander-legal, inside the colour identity): what makes a deck
 * legal to play. Readiness starts with these; My Decks runs them on every saved deck so an imported or hand-edited
 * deck that can't be played says so on its tile.
 */
export function deckRules(o: {
  deck: DeckCard[];
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'legal'> | undefined;
  commander?: string;
  partner?: string;
  identity: string[];
  /** No commander picked yet: there are no colours to be outside of, so skip that check (My Decks tiles). */
  skipIdentity?: boolean;
}): Check[] {
  const st = deckStats(o.deck, o.cardOf, o.commander);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);
  const list = (xs: string[]) => xs.slice(0, 5).join(', ') + (xs.length > 5 ? '…' : '');
  add({ key: 'cards', kind: 'rules', label: 'Cards', value: `${st.total}`, target: '100', ok: st.total === 100, says: st.total === 100 ? '100 cards, commander included.' : `${st.total} cards: a Commander deck has exactly 100.` });
  const counts = new Map<string, { name: string; n: number }>();
  for (const c of o.deck) {
    const k = norm(c.name);
    counts.set(k, { name: c.name, n: (counts.get(k)?.n ?? 0) + c.qty });
  }
  const dupes = [...counts.entries()].filter(([k, v]) => v.n > 1 && !BASICS.has(k) && !ANY_NUMBER.test(o.cardOf(v.name)?.text ?? '')).map(([, v]) => v.name);
  add({ key: 'singleton', kind: 'rules', label: 'Singleton', value: dupes.length ? `${dupes.length} doubled` : 'yes', target: 'one of each', ok: !dupes.length, says: dupes.length ? `More than one copy of ${list(dupes)}.` : 'One copy of each card (basics aside).', cards: dupes });
  const banned = o.deck.filter((c) => o.cardOf(c.name)?.legal === false).map((c) => c.name);
  add({ key: 'legal', kind: 'rules', label: 'Legal', value: banned.length ? `${banned.length} banned` : 'yes', target: 'no banned cards', ok: !banned.length, says: banned.length ? `Not legal in Commander: ${list(banned)}.` : 'Every card is legal in Commander.', cards: banned });
  if (o.skipIdentity) return checks;
  const lead = new Set([o.commander, o.partner].filter(Boolean).map((n) => norm(n!)));
  const off = o.deck.filter((c) => !lead.has(norm(c.name))).filter((c) => {
    const ci = o.cardOf(c.name)?.ci;
    return ci !== undefined && !inIdentity(ci, o.identity);
  }).map((c) => c.name);
  add({ key: 'identity', kind: 'rules', label: 'Colours', value: off.length ? `${off.length} outside` : 'yes', target: `inside ${o.identity.join('') || 'colourless'}`, ok: !off.length, says: off.length ? `Outside the commander's colours: ${list(off)}.` : "Every card is inside the commander's colours.", cards: off });
  return checks;
}

export function readiness(o: {
  deck: DeckCard[];
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'legal'> | undefined;
  commander?: string;
  partner?: string;
  identity: string[];
  bracket?: number;
  aggression?: Aggression;
}): Readiness {
  const dial = AGGRESSION[o.aggression ?? 'hungry'];
  const st = deckStats(o.deck, o.cardOf, o.commander);
  const checks: Check[] = [];
  const add = (c: Check) => checks.push(c);

  // Rules (the same four checks My Decks runs on every saved deck)
  for (const c of deckRules(o)) add(c);

  // Build
  const range = (key: CheckKey, label: string, n: number, [lo, hi]: [number, number], low: string) =>
    add({ key, kind: 'build', label, value: `${n}`, target: `${lo}–${hi}`, ok: n >= lo, says: n >= lo ? `${n} ${label.toLowerCase()}${n > hi ? `: above the usual ${lo}–${hi}` : ''}.` : `${n} ${label.toLowerCase()}: ${dial.label} wants ${lo}–${hi}. ${low}` });
  const lands: [number, number] = o.bracket === 5 ? [24, 31] : [33, 38];
  range('lands', 'Lands', st.lands, lands, 'Expect missed land drops.');
  range('ramp', 'Ramp', st.roles.ramp, dial.ramp, 'The deck may start slowly.');
  range('draw', 'Card draw', st.roles.draw, dial.draw, 'Hands may run dry mid-game.');
  range('removal', 'Removal', st.roles.removal, dial.removal, 'Few answers to a threat.');
  if (o.bracket !== 5) range('wipes', 'Board wipes', st.roles.wipes, dial.wipes, 'Hard to recover from a flooded board.');
  const kill = killCheck(o.deck.map((c) => ({ name: c.name, card: o.cardOf(c.name) })), o.bracket ?? 4);
  add({ key: 'win', kind: 'build', label: 'Ways to win', value: `${kill.count}`, target: `${dial.finishers[0]}+`, ok: kill.count >= dial.finishers[0], says: kill.says });
  add({ key: 'curve', kind: 'build', label: 'Curve', value: st.avgMv.toFixed(2), target: `≤ ${dial.maxAvgMv}`, ok: st.avgMv <= dial.maxAvgMv, says: st.avgMv <= dial.maxAvgMv ? `Average mana value ${st.avgMv.toFixed(2)}.` : `Average mana value ${st.avgMv.toFixed(2)}: top-heavy for ${dial.label}; lean on ramp or cut a few 5+ drops.` });
  const colours = COLOURS.filter((x) => o.identity.includes(x));
  if (colours.length > 1) {
    const src: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
    for (const c of o.deck) {
      const card = o.cardOf(c.name);
      if (!card || !isLand(card.type)) continue;
      const made = landColours(card);
      for (const x of colours) if (made.has(x)) src[x] += c.qty;
    }
    const kTargets = karstenSources(o);
    const weakest = colours.reduce((a, b) => (src[b] < src[a] ? b : a));
    const pipShort = colours.find((x) => src[x] < (kTargets[x] ?? SOURCES_MIN));
    const ok = src[weakest] >= SOURCES_MIN;
    const note = pipShort && src[pipShort] >= SOURCES_MIN ? ` (${pipShort} has heavy pips and wants ~${kTargets[pipShort]} sources)` : '';
    add({
      key: 'colours',
      kind: 'build',
      label: 'Colour sources',
      value: `${weakest} ${src[weakest]}`,
      target: `${SOURCES_MIN}+ each`,
      ok,
      says: ok
        ? `Every colour has ${SOURCES_MIN}+ land sources (weakest: ${weakest} ${src[weakest]})${note}.`
        : `Only ${src[weakest]} lands make ${weakest} (Karsten target: ${kTargets[weakest] ?? SOURCES_MIN}+): add duals or basics for it.`,
    });
  }

  const rulesOk = checks.filter((c) => c.kind === 'rules').every((c) => c.ok);
  const build = checks.filter((c) => c.kind === 'build');
  const failed = build.filter((c) => !c.ok).length;
  const passed = checks.filter((c) => c.ok).length;
  const verdict: Readiness['verdict'] = !rulesOk ? 'not legal' : failed === 0 ? 'ready' : failed <= 2 ? 'almost' : 'not ready';
  return { checks, passed, verdict };
}

/**
 * Bracket Fit (Deck Wizard's tile): the bracket the deck's cards put it in (`bracketOf`, official rules only) against
 * the bracket you aim for. "fits" = same; "over" = the cards push it higher, with what does it; "under" = it could
 * play one bracket down. Bracket 5 is intent, so aiming at 5 with a IV deck fits.
 */
export interface BracketFit {
  aim: number;
  est: number;
  fit: 'fits' | 'over' | 'under';
  says: string;
  /** What lifts the deck above the aim (Game Changers beyond the cap, early combos, MLD, chained extra turns). */
  over: string[];
  /** Why this bracket: Game Changers, combo breakdown, turns, MLD */
  reasons?: string[];
  gameChangers?: string[];
  combos?: { cards: [string, string]; early: boolean; mv: number; id: string }[];
  mld?: string[];
  extraTurns?: string[];
}
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export function bracketFit(call: BracketCall, aim: number): BracketFit {
  const est = call.bracket;
  const cap = aim >= 5 ? 4 : aim;
  const over: string[] = [];
  if (est > cap) {
    if (cap <= 2 && call.gameChangers.length) over.push(...call.gameChangers.map((c) => `${c} (Game Changer)`));
    if (cap === 3 && call.gameChangers.length > 3) over.push(`${call.gameChangers.length - 3} Game Changers over the 3 allowed`);
    over.push(...call.mld.map((c) => `${c} (mass land denial)`));
    if (call.extraTurns.length >= 3) over.push(`${call.extraTurns.length} extra-turn cards`);
    for (const k of call.combos) if (cap <= 2 || (cap === 3 && k.early)) over.push(`${k.cards.join(' + ')} (${k.early ? 'early ' : ''}two-card combo)`);
  }
  const fit: BracketFit['fit'] = est === 0 ? 'under' : est > cap ? 'over' : est < cap && aim < 5 ? 'under' : 'fits';
  let says = '';
  if (est === 0) {
    says = 'No bracket yet. Add cards to your deck to calculate its bracket based on Game Changers, two-card combos, and power rules.';
  } else if (fit === 'over') {
    const overSummary = over.slice(0, 4).join(', ') + (over.length > 4 ? '…' : '');
    says = `Plays like bracket ${ROMAN[est]}, above the ${ROMAN[aim]} you aim for: ${overSummary}.`;
  } else if (fit === 'fits') {
    if (aim >= 5) {
      says = `Fits bracket V intent (cards play at bracket ${ROMAN[est] || 'IV'}).`;
    } else if (est === 4) {
      const parts = [
        call.gameChangers.length > 3 ? `${call.gameChangers.length} Game Changers` : call.gameChangers.length ? `${call.gameChangers.length} Game Changer${call.gameChangers.length > 1 ? 's' : ''}` : '',
        call.combos.some((c) => c.early) ? `${call.combos.filter((c) => c.early).length} early two-card combo${call.combos.filter((c) => c.early).length > 1 ? 's' : ''}` : '',
        call.mld.length ? 'mass land denial' : '',
        call.extraTurns.length >= 3 ? 'chained extra turns' : '',
      ].filter(Boolean);
      says = `Fits bracket IV.${parts.length ? ` Driven by ${parts.join(' and ')}.` : ''}`;
    } else if (est === 3) {
      const parts = [
        call.gameChangers.length ? `${call.gameChangers.length} Game Changer${call.gameChangers.length > 1 ? 's' : ''}` : '',
        call.combos.length ? `${call.combos.length} two-card combo${call.combos.length > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      says = `Fits bracket III.${parts.length ? ` Driven by ${parts.join(' and ')}.` : ''}`;
    } else {
      says = `Fits bracket ${ROMAN[est] || est}. Core casual power: no Game Changers, mass land denial, or two-card combos.`;
    }
  } else {
    // fit === 'under'
    if (est === 3) {
      const parts = [
        call.gameChangers.length ? `${call.gameChangers.length} Game Changer${call.gameChangers.length > 1 ? 's' : ''}` : '',
        call.combos.length ? `${call.combos.length} two-card combo${call.combos.length > 1 ? 's' : ''}` : '',
      ].filter(Boolean);
      says = `Currently at Bracket III${parts.length ? ` (${parts.join(', ')})` : ''}, below target ${ROMAN[aim]}. Add ${aim >= 4 ? 'more Game Changers or fast combos' : 'upgraded pieces'} to reach ${ROMAN[aim]}.`;
    } else if (est === 2) {
      says = `Currently at Bracket II (no Game Changers, mass land denial, or two-card combos). Aiming for ${ROMAN[aim]}.`;
    } else {
      says = `Fits bracket ${ROMAN[aim]}, and nothing in it goes past ${ROMAN[est]}.`;
    }
  }
  return {
    aim,
    est,
    fit,
    says,
    over,
    reasons: call.reasons,
    gameChangers: call.gameChangers,
    combos: call.combos,
    mld: call.mld,
    extraTurns: call.extraTurns,
  };
}

/**
 * The one short label a My Decks tile shows when a saved deck breaks a rule, and the full reasons for its tooltip and
 * screen readers. The first broken rule names the label, in the order a player fixes them: card count, banned,
 * off-colour, doubled. Undefined when the deck is legal.
 */
export function rulesLabel(checks: Check[]): { label: string; says: string } | undefined {
  const bad = checks.filter((c) => c.kind === 'rules' && !c.ok);
  if (!bad.length) return undefined;
  const order: CheckKey[] = ['cards', 'legal', 'identity', 'singleton'];
  const first = [...bad].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))[0];
  const n = first.cards?.length ?? 0;
  const label =
    first.key === 'cards' ? `${first.value}/100 CARDS` : first.key === 'legal' ? `${n} BANNED` : first.key === 'identity' ? `${n} OFF-COLOUR` : `${n} DOUBLED`;
  return { label: bad.length > 1 ? `${label} +${bad.length - 1}` : label, says: `Not legal in Commander yet. ${bad.map((c) => c.says).join(' ')}` };
}

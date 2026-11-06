import { brainData, loadBrainData, ROLE_BITS, type Combo } from '../brain/data';
import type { Card, DeckCard } from './db';
import { norm } from './names';

loadBrainData(); // roles + combos files, in the background

/** Moxfield-style type groups, in display order. A card goes to the first group its (front-face) type matches. */
export const GROUPS = ['Commander', 'Creatures', 'Planeswalkers', 'Battles', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other'] as const;
export type Group = (typeof GROUPS)[number];

const front = (type = '') => type.split(' // ')[0];
export const isLand = (type?: string) => /\bLand\b/.test(front(type));

export function groupOf(type?: string): Group {
  const t = front(type);
  if (!t) return 'Other';
  if (/\bLand\b/.test(t) && !/\bCreature\b/.test(t)) return 'Lands';
  if (/\bCreature\b/.test(t)) return 'Creatures';
  if (/\bPlaneswalker\b/.test(t)) return 'Planeswalkers';
  if (/\bBattle\b/.test(t)) return 'Battles';
  if (/\bInstant\b/.test(t)) return 'Instants';
  if (/\bSorcery\b/.test(t)) return 'Sorceries';
  if (/\bArtifact\b/.test(t)) return 'Artifacts';
  if (/\bEnchantment\b/.test(t)) return 'Enchantments';
  return 'Other';
}

// Fallback roles read from Oracle text, for cards the Scryfall Tagger file doesn't know yet (new sets) or before it loads.
// Fixed after the veteran playtest (Nov 6): "an opponent draws" isn't your draw, Treasure is ramp, "additional" draws,
// one-sided bounce and -X/-X sweepers, counters for noncreature spells, tutors for a coloured card or to the graveyard.
const ROLES: Record<Role, RegExp> = {
  ramp: /add \{|add (one|two|three) mana|mana of any|create (a|an|one|two|three|x|\w+) treasure|treasure tokens?\b.*create|search your library for (up to (two|three|\w+) )?(a |an )?(basic )?(land|forest|plains|island|swamp|mountain)|put (a|up to \w+) (basic )?land cards? .*onto the battlefield/i,
  draw: /\bdraws? (a|an|two|three|four|x|\w+) (additional )?cards?|draw cards equal|\binvestigate|connives?\b/i,
  removal: /(destroy|exile) target|counter target ([a-z]+ )?(spell|activated|ability)|deals? (\d+|x|that much) damage to (any target|target (creature|planeswalker|permanent))|return target (nonland )?(creature|permanent)( you don't control)? to its owner's hand|target (creature|player) (gets -|sacrifices)/i,
  wipes: /(destroy|exile) all (creatures|nonland permanents|permanents|other creatures)|(each|all) (other )?creatures? gets? -|deals? \d+ damage to each creature|return all (nonland permanents|creatures)|return each nonland permanent|overload/i,
  tutors: /search your library (and\/or graveyard )?for (a|an|up to (one|two)) ([a-z]+ )?(card|instant|sorcery|creature|artifact|enchantment|planeswalker|legendary)(?! named)/i,
};
export type Role = 'ramp' | 'draw' | 'removal' | 'wipes' | 'tutors';
const OPP_DRAW = /(whenever an|each|target) opponent draws/gi;

/** Where a card's roles came from: Scryfall Tagger (the file) or our own text rules. */
export const roleSource = (name?: string) => (name && brainData().roles?.has(norm(name)) ? 'Scryfall Tagger' : 'card text');

/**
 * A card's roles: Scryfall Tagger tags when the card is in the brain's roles file (counterspells count as removal),
 * else read from its Oracle text. Lands have none (their mana is counted as lands).
 */
export function roleOf(c: Pick<Card, 'type' | 'text'> & { name?: string }): Role[] {
  if (isLand(c.type)) return [];
  const bits = c.name != null ? brainData().roles?.get(norm(c.name)) : undefined;
  if (bits != null) {
    const has = (r: (typeof ROLE_BITS)[number]) => !!(bits & (1 << ROLE_BITS.indexOf(r)));
    return (['ramp', 'draw', 'removal', 'wipes', 'tutors'] as Role[]).filter((r) => has(r) || (r === 'removal' && has('counters')));
  }
  const text = c.text ?? '';
  return (Object.keys(ROLES) as Role[]).filter((r) => {
    if (r === 'removal' && /counter target noncreature|counter target spell/i.test(text)) return true;
    return ROLES[r].test(r === 'draw' ? text.replace(OPP_DRAW, '') : text);
  });
}

const MLD = /(destroy|exile) all lands|each player sacrifices (all|\w+) lands|lands don't untap|players can't untap more than one land|nonbasic lands are mountains|each land is a/i;
const EXTRA_TURN = /takes? an extra turn/i;

/** Typical ranges for a 100-card Commander deck (EDHREC / Command Zone template). */
export const TARGETS: Record<'lands' | Role, [number, number]> = { lands: [35, 38], ramp: [9, 12], draw: [9, 12], removal: [7, 10], wipes: [2, 4], tutors: [0, 99] };

export interface BracketCall {
  bracket: 1 | 2 | 3 | 4; // 5 (cEDH) is about intent and is never guessed
  reasons: string[];
  gameChangers: string[];
  mld: string[];
  extraTurns: string[];
  tutors: string[]; // information only: Wizards removed tutor limits from the brackets (Oct 2025)
  /** Two-card combos complete in the deck, earliest first. `early` = Commander Spellbook's early-game rule. */
  combos: { cards: [string, string]; early: boolean; mv: number; id: string }[];
  /** False when the combo file isn't loaded yet (first visit offline): combos weren't checked. */
  combosChecked: boolean;
}

/** Spellbook's "early game" reading (as in Deck Wizard, from commander-spellbook-backend's estimate_bracket, MIT):
 *  relevant (wins / status S), definitely two cards, and at most 4 mana needed. */
export const EARLY_MV = 4;
export const isEarly = (c: Combo) => c.relevant && c.definite && c.mv <= EARLY_MV;

/** Two-card combos with both cards in the list (the commander counts as a card). */
export function combosIn(names: string[], index: Map<string, Combo[]>): Combo[] {
  const have = new Set(names.map(norm));
  const out = new Map<string, Combo>();
  for (const k of have) for (const c of index.get(k) ?? []) if (have.has(norm(c.cards[0])) && have.has(norm(c.cards[1]))) out.set(c.id, c);
  return [...out.values()].sort((a, b) => Number(isEarly(b)) - Number(isEarly(a)) || a.mv - b.mv);
}

/**
 * Commander bracket estimate from the official rules we can check (Wizards, Feb 2025 + Oct 2025 updates): Game Changers,
 * mass land denial, chained extra turns, and two-card combos (from Commander Spellbook): none in brackets I–II, none in
 * the early game in III. Tutors are listed as information only (no longer a bracket rule since Oct 2025).
 * Bracket 1 vs 2 and bracket 5 are about intent, so the floor is 2 and 5 is never given.
 */
export function bracketOf(cards: { name: string; card?: Pick<Card, 'type' | 'text'> }[], gc: Set<string> | null, comboIndex = brainData().combos): BracketCall {
  const gameChangers = gc ? cards.filter((c) => gc.has(norm(c.name))).map((c) => c.name) : [];
  const mld = cards.filter((c) => c.card && !isLand(c.card.type) && MLD.test(c.card.text)).map((c) => c.name);
  const extraTurns = cards.filter((c) => c.card && EXTRA_TURN.test(c.card.text)).map((c) => c.name);
  const tutors = cards.filter((c) => c.card && roleOf({ ...c.card, name: c.name }).includes('tutors')).map((c) => c.name);
  const found = comboIndex ? combosIn(cards.map((c) => c.name), comboIndex) : [];
  const combos = found.map((c) => ({ cards: c.cards, early: isEarly(c), mv: c.mv, id: c.id }));
  let bracket: BracketCall['bracket'] = 2;
  const reasons: string[] = [];
  const up = (b: BracketCall['bracket'], why: string) => {
    if (b > bracket) bracket = b;
    reasons.push(why);
  };
  if (gameChangers.length > 3) up(4, `${gameChangers.length} Game Changers (more than 3 means bracket IV)`);
  else if (gameChangers.length) up(3, `${gameChangers.length} Game Changer${gameChangers.length > 1 ? 's' : ''} (1–3 means bracket III)`);
  if (mld.length) up(4, `mass land denial: ${mld.join(', ')}`);
  if (extraTurns.length >= 3) up(4, `${extraTurns.length} extra-turn cards: chaining turns is bracket IV`);
  else if (extraTurns.length) reasons.push(`${extraTurns.length} extra-turn card${extraTurns.length > 1 ? 's' : ''}: fine below IV if they don't chain`);
  const early = combos.filter((c) => c.early);
  const late = combos.filter((c) => !c.early);
  const pair = (c: { cards: [string, string] }) => c.cards.join(' + ');
  if (early.length) up(4, `early two-card combo${early.length > 1 ? 's' : ''} (${early.length}): ${early.slice(0, 3).map(pair).join(', ')}. Bracket III allows none in the early game`);
  if (late.length) up(3, `two-card combo${late.length > 1 ? 's' : ''} (${late.length}): ${late.slice(0, 3).map(pair).join(', ')}. Brackets I–II allow none`);
  if (tutors.length) reasons.push(`${tutors.length} tutor${tutors.length > 1 ? 's' : ''}: information only, tutors no longer set the bracket (Oct 2025)`);
  if (bracket === 2) reasons.unshift('no Game Changers, mass land denial, chained extra turns or two-card combos');
  if (!gc) reasons.push("Game Changers couldn't be checked (offline)");
  if (!comboIndex) reasons.push("two-card combos couldn't be checked yet (combo list not loaded)");
  return { bracket, reasons, gameChangers, mld, extraTurns, tutors, combos, combosChecked: !!comboIndex };
}

export interface DeckStats {
  total: number;
  lands: number;
  avgMv: number; // non-land cards
  curve: number[]; // index 0..7 (7 = 7+), non-land cards by mana value, × qty
  groups: Map<Group, number>;
  roles: Record<Role, number>;
  pips: Record<'W' | 'U' | 'B' | 'R' | 'G' | 'C', number>;
  unknown: number; // cards without Scryfall data yet
}

export function deckStats(list: DeckCard[], cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana'> | undefined, commander?: string): DeckStats {
  const s: DeckStats = { total: 0, lands: 0, avgMv: 0, curve: Array(8).fill(0), groups: new Map(), roles: { ramp: 0, draw: 0, removal: 0, wipes: 0, tutors: 0 }, pips: { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 }, unknown: 0 };
  let mvSum = 0;
  let spells = 0;
  for (const dc of list) {
    const c = cardOf(dc.name);
    const q = dc.qty;
    s.total += q;
    const g = dc.name === commander ? 'Commander' : groupOf(c?.type);
    s.groups.set(g, (s.groups.get(g) ?? 0) + q);
    if (!c) {
      s.unknown += q;
      continue;
    }
    if (isLand(c.type)) {
      s.lands += q;
      continue;
    }
    const mv = Math.max(0, Math.round(c.cmc ?? 0));
    s.curve[Math.min(mv, 7)] += q;
    mvSum += mv * q;
    spells += q;
    for (const r of roleOf({ ...c, name: dc.name })) s.roles[r] += q;
    for (const m of (c.mana ?? '').match(/\{[^}]+\}/g) ?? []) for (const k of ['W', 'U', 'B', 'R', 'G', 'C'] as const) if (m.includes(k)) s.pips[k] += q;
  }
  s.avgMv = spells ? mvSum / spells : 0;
  return s;
}

/** The deck's shape to compare with: EDHREC's average deck for this commander and bracket (Deck Wizard avg_shape). */
export interface RefShape {
  lands: number;
  label?: string; // e.g. "EDHREC's cEDH average deck"
}

/** Land ranges by bracket when no average deck is at hand: cEDH lists run far fewer lands (EDHREC's cEDH Kinnan
 *  average: 25). Other brackets keep the 100-card template. */
export const LANDS_BY_BRACKET: Record<number, [number, number]> = { 5: [24, 31], 4: [31, 37] };

/**
 * A few plain-language lines comparing the deck with what's usual. With `ref` (EDHREC's average deck for this
 * commander and bracket) the land count is compared with that deck, ±2; else with the bracket's range; else the
 * template. Veteran playtest round 2, A5: a cEDH list was told "25 lands: light".
 */
export function analysis(s: DeckStats, opts: { bracket?: number; ref?: RefShape } = {}): { tone: 'ok' | 'low' | 'high'; text: string }[] {
  const out: { tone: 'ok' | 'low' | 'high'; text: string }[] = [];
  const check = (n: number, [lo, hi]: [number, number], what: string, lowNote: string, highNote: string, usual = 'most decks run') => {
    if (n < lo) out.push({ tone: 'low', text: `${n} ${what}: light, ${usual} ${lo}–${hi}. ${lowNote}`.trim() });
    else if (n > hi) out.push({ tone: 'high', text: `${n} ${what}: more than the usual ${lo}–${hi}. ${highNote}`.trim() });
    else out.push({ tone: 'ok', text: `${n} ${what}: right in the usual ${lo}–${hi}.` });
  };
  if (s.total < 100) out.push({ tone: 'low', text: `${s.total} cards: a Commander deck has 100 (commander included).` });
  else if (s.total > 100) out.push({ tone: 'high', text: `${s.total} cards: a Commander deck has exactly 100.` });
  const lands: [number, number] = opts.ref ? [opts.ref.lands - 2, opts.ref.lands + 2] : (LANDS_BY_BRACKET[opts.bracket ?? 0] ?? TARGETS.lands);
  const usual = opts.ref ? `${opts.ref.label ?? "EDHREC's average deck"} runs ${opts.ref.lands}, so` : opts.bracket === 5 ? 'cEDH lists run' : 'most decks run';
  check(s.lands, lands, 'lands', 'Expect missed land drops.', 'Room to cut a land for a spell, more so with lots of ramp.', usual);
  const cedh = opts.bracket === 5;
  check(s.roles.ramp, TARGETS.ramp, 'ramp pieces', 'The deck may start slowly.', cedh ? 'Normal for fast mana.' : '');
  check(s.roles.draw, TARGETS.draw, 'card-draw sources', 'Hands may run dry mid-game.', '');
  check(s.roles.removal, cedh ? [10, 20] : TARGETS.removal, 'targeted removal / counters', 'Few answers to a threat.', '');
  check(s.roles.wipes, cedh ? [0, 3] : TARGETS.wipes, 'board wipes', cedh ? '' : 'Hard to recover if someone floods the board.', 'Can hurt your own board too.');
  if (s.avgMv) out.push({ tone: s.avgMv > 3.8 ? 'high' : 'ok', text: `Average mana value ${s.avgMv.toFixed(2)}${s.avgMv > 3.8 ? ': top-heavy, lean on ramp' : s.avgMv < 2.6 ? ': low curve, fast starts' : ''}.` });
  return out;
}

/** EDHREC's average deck as a RefShape: its land count (basics + nonbasics, from the page's own type counts). */
export function refShapeOf(page: { lists: { header: string; cards: { qty?: number }[] }[] }, label?: string): RefShape | undefined {
  const l = page.lists.find((x) => /^lands?$/i.test(x.header));
  if (!l) return undefined;
  return { lands: l.cards.reduce((n, c) => n + (c.qty ?? 1), 0), label };
}

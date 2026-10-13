import type { Card, DeckCard } from './db';
import { norm } from './names';

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

// Roles read from Oracle text: a rough count, stated as such in the UI.
const ROLES: Record<Role, RegExp> = {
  ramp: /add \{|add (one|two|three) mana|mana of any|search your library for (up to (two|three|\w+) )?(a |an )?(basic )?(land|forest|plains|island|swamp|mountain)|put (a|up to \w+) (basic )?land cards? .*onto the battlefield/i,
  draw: /draws? (a|two|three|four|x|\w+) cards?|draw cards equal|investigate|connives?\b/i,
  removal: /(destroy|exile) target|counter target (spell|activated|ability)|deals? (\d+|x|that much) damage to (any target|target (creature|planeswalker|permanent))|return target (nonland )?(creature|permanent) to its owner's hand|target (creature|player) (gets -|sacrifices)/i,
  wipes: /(destroy|exile) all (creatures|nonland permanents|permanents|other creatures)|each (creature|other creature) gets -|deals? \d+ damage to each creature|return all (nonland permanents|creatures)/i,
  tutors: /search your library for (a|an|up to (one|two)) (card|instant|sorcery|creature|artifact|enchantment|planeswalker|legendary)(?! named)/i,
};
export type Role = 'ramp' | 'draw' | 'removal' | 'wipes' | 'tutors';
export const roleOf = (c: Pick<Card, 'type' | 'text'>): Role[] => (isLand(c.type) ? [] : (Object.keys(ROLES) as Role[]).filter((r) => ROLES[r].test(c.text ?? '')));

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
  tutors: string[];
}

/** Commander bracket estimate from the official rules we can check: Game Changers, mass land denial, extra turns, tutors.
 *  Two-card combos are not checked. Bracket 1 vs 2 and bracket 5 are about intent, so the floor is 2 and 5 is never given. */
export function bracketOf(cards: { name: string; card?: Pick<Card, 'type' | 'text'> }[], gc: Set<string> | null): BracketCall {
  const gameChangers = gc ? cards.filter((c) => gc.has(norm(c.name))).map((c) => c.name) : [];
  const mld = cards.filter((c) => c.card && !isLand(c.card.type) && MLD.test(c.card.text)).map((c) => c.name);
  const extraTurns = cards.filter((c) => c.card && EXTRA_TURN.test(c.card.text)).map((c) => c.name);
  const tutors = cards.filter((c) => c.card && ROLES.tutors.test(c.card.text)).map((c) => c.name);
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
  if (tutors.length >= 4) up(3, `${tutors.length} tutors: brackets I–II expect few`);
  if (!reasons.length) reasons.push('no Game Changers, mass land denial, extra turns or tutor pile');
  if (!gc) reasons.push("Game Changers couldn't be checked (offline)");
  return { bracket, reasons, gameChangers, mld, extraTurns, tutors };
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
    for (const r of roleOf(c)) s.roles[r] += q;
    for (const m of (c.mana ?? '').match(/\{[^}]+\}/g) ?? []) for (const k of ['W', 'U', 'B', 'R', 'G', 'C'] as const) if (m.includes(k)) s.pips[k] += q;
  }
  s.avgMv = spells ? mvSum / spells : 0;
  return s;
}

/** A few plain-language lines comparing the deck with the usual template. */
export function analysis(s: DeckStats): { tone: 'ok' | 'low' | 'high'; text: string }[] {
  const out: { tone: 'ok' | 'low' | 'high'; text: string }[] = [];
  const check = (n: number, [lo, hi]: [number, number], what: string, lowNote: string, highNote: string) => {
    if (n < lo) out.push({ tone: 'low', text: `${n} ${what}: light, most decks run ${lo}–${hi}. ${lowNote}`.trim() });
    else if (n > hi) out.push({ tone: 'high', text: `${n} ${what}: more than the usual ${lo}–${hi}. ${highNote}`.trim() });
    else out.push({ tone: 'ok', text: `${n} ${what}: right in the usual ${lo}–${hi}.` });
  };
  if (s.total < 100) out.push({ tone: 'low', text: `${s.total} cards: a Commander deck has 100 (commander included).` });
  else if (s.total > 100) out.push({ tone: 'high', text: `${s.total} cards: a Commander deck has exactly 100.` });
  check(s.lands, TARGETS.lands, 'lands', 'Expect missed land drops.', 'Room to cut a land for a spell, more so with lots of ramp.');
  check(s.roles.ramp, TARGETS.ramp, 'ramp pieces', 'The deck may start slowly.', '');
  check(s.roles.draw, TARGETS.draw, 'card-draw sources', 'Hands may run dry mid-game.', '');
  check(s.roles.removal, TARGETS.removal, 'targeted removal / counters', 'Few answers to a threat.', '');
  check(s.roles.wipes, TARGETS.wipes, 'board wipes', 'Hard to recover if someone floods the board.', 'Can hurt your own board too.');
  if (s.avgMv) out.push({ tone: s.avgMv > 3.8 ? 'high' : 'ok', text: `Average mana value ${s.avgMv.toFixed(2)}${s.avgMv > 3.8 ? ': top-heavy, lean on ramp' : s.avgMv < 2.6 ? ': low curve, fast starts' : ''}.` });
  return out;
}

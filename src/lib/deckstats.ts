import type { Card, DeckCard } from './db';
import { norm } from './names';

/** Deck page groups, Moxfield-style: commander first, then by main card type. */
export const GROUPS = ['Commander', 'Creatures', 'Planeswalkers', 'Battles', 'Instants', 'Sorceries', 'Artifacts', 'Enchantments', 'Lands', 'Other'] as const;
export type Group = (typeof GROUPS)[number];

/** Main type of a card (front face; a creature land counts as a land, an artifact creature as a creature). */
export function groupOf(type: string | undefined): Group {
  const t = (type ?? '').split(' // ')[0];
  if (/\bLand\b/.test(t)) return 'Lands';
  if (/\bCreature\b/.test(t)) return 'Creatures';
  if (/\bPlaneswalker\b/.test(t)) return 'Planeswalkers';
  if (/\bBattle\b/.test(t)) return 'Battles';
  if (/\bInstant\b/.test(t)) return 'Instants';
  if (/\bSorcery\b/.test(t)) return 'Sorceries';
  if (/\bArtifact\b/.test(t)) return 'Artifacts';
  if (/\bEnchantment\b/.test(t)) return 'Enchantments';
  return 'Other';
}

// Rough oracle-text roles. Heuristics, so the UI calls the result an estimate.
const RX = {
  ramp: /add \{|add (one|two|three) mana|adds? mana of any|search your library for (a|an|up to \w+) (basic )?(land|forest|plains|island|swamp|mountain)|put (a|that|those|up to \w+) (basic )?land cards? .*onto the battlefield|create (a|two|\w+) treasure/i,
  draw: /draws? (a|an|one|two|three|four|five|x|that many|\w+) cards?|draw cards equal/i,
  removal: /(destroy|exile) (target|another target|up to \w+ target)|deals? (\d+|x) damage to (any target|target creature|target (creature or )?planeswalker)|return (target|up to \w+ target) (creature|nonland permanent|permanent)s? .*to (its|their) owner'?s'? hand|target (creature|player|opponent) sacrifices|counter target (spell|noncreature spell|creature spell)|fights? (target|up to one target)/i,
  wipe: /(destroy|exile) all (creatures|other creatures|nonland permanents|permanents|artifacts|enchantments|nontoken)|all creatures get -|deals? (\d+|x) damage to each creature|each (player|opponent) sacrifices (all|each)|return all (nonland|creatures)/i,
  turns: /takes? an extra turn/i,
  mld: /destroy all lands|destroy all (nonbasic )?lands|each player sacrifices (all|\w+) lands|lands? (don't|do not) untap/i,
};
/** Tutors: searching the library for a non-land card. */
function isTutor(text: string) {
  for (const m of text.matchAll(/search(es)? (your|their) library for ([^.]*?)(card|cards)\b/gi)) if (!/land|basic|forest|plains|island|swamp|mountain/i.test(m[3])) return true;
  return false;
}

export interface DeckStats {
  total: number;
  lands: number;
  groups: { group: Group; cards: DeckCard[]; count: number }[];
  curve: number[]; // nonland mana values 0..7+ (index 7 = 7 or more)
  avgMv: number;
  pips: Record<'W' | 'U' | 'B' | 'R' | 'G', number>;
  roles: { ramp: string[]; draw: string[]; removal: string[]; wipe: string[]; tutor: string[]; turns: string[]; mld: string[] };
  known: number; // cards with Scryfall data (the rest are ignored by the stats)
}

export function deckStats(cards: DeckCard[], cardOf: (name: string) => Card | undefined, commander?: string): DeckStats {
  const groups = new Map<Group, DeckCard[]>();
  const curve = Array(8).fill(0);
  const pips = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const roles: DeckStats['roles'] = { ramp: [], draw: [], removal: [], wipe: [], tutor: [], turns: [], mld: [] };
  let total = 0,
    lands = 0,
    mvSum = 0,
    mvN = 0,
    known = 0;
  for (const dc of cards) {
    const c = cardOf(dc.name);
    const isCmdr = !!commander && norm(dc.name) === norm(commander);
    const g = isCmdr ? 'Commander' : groupOf(c?.type);
    groups.set(g, [...(groups.get(g) ?? []), dc]);
    total += dc.qty;
    if (!c) continue;
    known += dc.qty;
    const land = groupOf(c.type) === 'Lands';
    if (land) lands += dc.qty;
    else {
      const mv = Math.round(c.cmc ?? 0);
      curve[Math.min(mv, 7)] += dc.qty;
      mvSum += mv * dc.qty;
      mvN += dc.qty;
    }
    for (const sym of (c.mana ?? '').match(/\{[^}]+\}/g) ?? []) for (const k of 'WUBRG') if (sym.includes(k)) pips[k as keyof typeof pips] += dc.qty;
    if (isCmdr) continue; // the commander's own text isn't a slot in the 99
    const text = c.text ?? '';
    if (!land && RX.ramp.test(text)) roles.ramp.push(dc.name);
    if (RX.draw.test(text)) roles.draw.push(dc.name);
    if (RX.wipe.test(text)) roles.wipe.push(dc.name);
    else if (RX.removal.test(text)) roles.removal.push(dc.name);
    if (isTutor(text)) roles.tutor.push(dc.name);
    if (RX.turns.test(text)) roles.turns.push(dc.name);
    if (RX.mld.test(text)) roles.mld.push(dc.name);
  }
  return {
    total,
    lands,
    groups: GROUPS.filter((g) => groups.has(g)).map((g) => ({ group: g, cards: groups.get(g)!, count: groups.get(g)!.reduce((n, c) => n + c.qty, 0) })),
    curve,
    avgMv: mvN ? mvSum / mvN : 0,
    pips,
    roles,
    known,
  };
}

/** Bracket estimate from what the list shows (WotC's Commander Brackets): Game Changers, mass land
 *  destruction, extra turns, tutors. Two-card combos aren't checked; 1 and 5 depend on intent, so not guessed. */
export function estimateBracket(names: string[], st: DeckStats, gameChangers: Set<string>) {
  const gc = [...new Set(names.filter((n) => gameChangers.has(norm(n))))];
  const why: string[] = [];
  let b = 2;
  if (gc.length) why.push(`${gc.length} Game Changer${gc.length > 1 ? 's' : ''}: ${gc.join(', ')}`);
  if (gc.length > 3) b = 4;
  else if (gc.length) b = 3;
  if (st.roles.mld.length) {
    b = 4;
    why.push(`mass land denial: ${st.roles.mld.join(', ')}`);
  }
  if (st.roles.turns.length >= 2) {
    b = Math.max(b, 4);
    why.push(`${st.roles.turns.length} extra-turn cards (can chain): ${st.roles.turns.join(', ')}`);
  } else if (st.roles.turns.length) {
    b = Math.max(b, 3);
    why.push(`an extra-turn card: ${st.roles.turns[0]}`);
  }
  if (st.roles.tutor.length >= 3) {
    b = Math.max(b, 3);
    why.push(`${st.roles.tutor.length} tutors`);
  }
  if (!why.length) why.push('no Game Changers, mass land denial, extra turns or tutor pile');
  return { bracket: b, gc, why };
}

/** Short heuristic read of the list against common Commander counts (100-card decks). */
export function analyse(st: DeckStats) {
  const out: { tone: 'ok' | 'low' | 'high'; text: string }[] = [];
  const check = (n: number, lo: number, hi: number, what: string, low: string, high?: string) => {
    const [l, h] = [lo, hi];
    if (n < l) out.push({ tone: 'low', text: `${n} ${what}: ${low} (most decks run ${l}–${h}).` });
    else if (n > h && high) out.push({ tone: 'high', text: `${n} ${what}: ${high} (most decks run ${l}–${h}).` });
    else out.push({ tone: 'ok', text: `${n} ${what}: on target.` });
  };
  check(st.lands, 35, 38, 'lands', 'light, expect missed land drops', 'heavy, room for more spells');
  check(st.roles.ramp.length, 9, 13, 'ramp pieces', 'slow starts likely');
  check(st.roles.draw.length, 9, 13, 'draw sources', 'may run out of gas');
  check(st.roles.removal.length, 7, 11, 'spot removal', 'few answers to threats');
  check(st.roles.wipe.length, 2, 4, 'board wipes', 'hard to reset a lost board', 'many resets, check they fit your plan');
  const mv = st.avgMv;
  out.push({ tone: mv > 3.6 ? 'high' : 'ok', text: `Average mana value ${mv.toFixed(2)}${mv > 3.6 ? ': top-heavy, add cheaper plays or more ramp.' : mv < 2.4 ? ': low curve, fast.' : '.'}` });
  return out;
}

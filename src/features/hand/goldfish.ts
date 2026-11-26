import { BASICS } from '../../lib/compare';
import type { Card, DeckCard } from '../../lib/db';
import { isLand } from '../../lib/deckstats';
import { norm } from '../../lib/names';
import { buildLibrary, shuffle } from './handMath';

export interface PermanentOnField {
  id: string;
  name: string;
  isLand: boolean;
  manaProduced: number;
  tapped: boolean;
  isCommander?: boolean;
}

export interface GoldfishState {
  hand: string[];
  library: string[];
  battlefield: PermanentOnField[];
  graveyard: string[];
  commandZone: { name: string; casts: number }[];
  commanderCasts: Record<string, number>;
  turn: number;
  mulligans: number;
  toBottom: number;
  landsPlayedThisTurn: number;
  floatingMana: number;
  log: string[];
  nextId: number;
}

type CardMeta = Pick<Card, 'type' | 'text' | 'cmc' | 'img'>;

export function isDeckLand(name: string, card?: Pick<CardMeta, 'type'>): boolean {
  return isLand(card?.type) || BASICS.has(norm(name));
}

export function cardManaYield(card: Pick<CardMeta, 'type' | 'text'> | undefined, land: boolean): number {
  const text = card?.text ?? '';
  if (land) return /add \{c\}\{c\}/i.test(text) ? 2 : 1;
  if (/\b(Instant|Sorcery)\b/i.test(card?.type ?? '')) return 0;
  if (/\{t\}[^.:]{0,35}: add /i.test(text) || /add (one|two|three) mana|\{t\}: add \{/i.test(text)) {
    if (/three mana|\{c\}\{c\}\{c\}/i.test(text)) return 3;
    if (/two mana|\{c\}\{c\}/i.test(text)) return 2;
    return 1;
  }
  return 0;
}

export function availableMana(state: GoldfishState): number {
  return (
    state.floatingMana +
    state.battlefield.filter((p) => !p.tapped && p.manaProduced > 0).reduce((n, p) => n + p.manaProduced, 0)
  );
}

export function maxManaPool(state: GoldfishState): number {
  return state.battlefield.filter((p) => p.manaProduced > 0).reduce((n, p) => n + p.manaProduced, 0);
}

function spendMana(state: GoldfishState, cost: number): { battlefield: PermanentOnField[]; floatingMana: number } | null {
  if (availableMana(state) < cost) return null;
  let need = Math.max(0, cost - state.floatingMana);
  let floatingMana = Math.max(0, state.floatingMana - cost);
  if (need === 0) return { battlefield: state.battlefield, floatingMana };

  // Prefer lands before non-land rocks, and smallest manaProduced first so excess waste is minimal
  const sources = state.battlefield
    .filter((p) => !p.tapped && p.manaProduced > 0)
    .sort((a, b) => Number(b.isLand) - Number(a.isLand) || a.manaProduced - b.manaProduced);
  const tapIds = new Set<string>();
  for (const s of sources) {
    if (need <= 0) break;
    tapIds.add(s.id);
    if (s.manaProduced >= need) {
      floatingMana += s.manaProduced - need;
      need = 0;
    } else {
      need -= s.manaProduced;
    }
  }
  const battlefield = state.battlefield.map((p) => (tapIds.has(p.id) ? { ...p, tapped: true } : p));
  return { battlefield, floatingMana };
}

export function dealGoldfish(
  cards: DeckCard[],
  commander?: string,
  partner?: string,
  mulligans = 0,
  rng: () => number = Math.random,
): GoldfishState {
  const full = shuffle(buildLibrary(cards, commander, partner), rng);
  const drawN = Math.min(7, full.length);
  const toBottom = mulligans > 1 ? Math.min(mulligans - 1, Math.max(0, drawN - 1)) : 0;
  const leads = [commander, partner].filter((n): n is string => Boolean(n));
  const commanderCasts: Record<string, number> = Object.fromEntries(leads.map((n) => [norm(n), 0]));
  return {
    hand: full.slice(0, drawN),
    library: full.slice(drawN),
    battlefield: [],
    graveyard: [],
    commandZone: leads.map((name) => ({ name, casts: 0 })),
    commanderCasts,
    turn: 1,
    mulligans,
    toBottom,
    landsPlayedThisTurn: 0,
    floatingMana: 0,
    log: [mulligans === 0 ? 'Dealt opening 7' : mulligans === 1 ? 'Took free Commander mulligan' : `Mulliganed to ${drawN - toBottom}`],
    nextId: 1,
  };
}

export function bottomGoldfishCard(state: GoldfishState, handIdx: number): GoldfishState {
  if (state.toBottom <= 0 || handIdx < 0 || handIdx >= state.hand.length) return state;
  const card = state.hand[handIdx];
  const nextHand = state.hand.filter((_, i) => i !== handIdx);
  return {
    ...state,
    hand: nextHand,
    library: [...state.library, card],
    toBottom: state.toBottom - 1,
  };
}

export function canPlayHandCard(
  state: GoldfishState,
  handIdx: number,
  cardOf: (name: string) => CardMeta | undefined,
): { ok: boolean; isLand: boolean; cost: number; reason?: string } {
  if (state.toBottom > 0) return { ok: false, isLand: false, cost: 0, reason: 'Finish London mulligan bottoming first' };
  const name = state.hand[handIdx];
  if (!name) return { ok: false, isLand: false, cost: 0, reason: 'Missing card' };
  const card = cardOf(name);
  const land = isDeckLand(name, card);
  if (land) {
    if (state.landsPlayedThisTurn >= 1) return { ok: false, isLand: true, cost: 0, reason: 'Land drop already used this turn' };
    return { ok: true, isLand: true, cost: 0 };
  }
  const cost = Math.max(0, Math.round(card?.cmc ?? 0));
  const avail = availableMana(state);
  if (avail < cost) return { ok: false, isLand: false, cost, reason: `Needs ${cost} mana (${avail} available)` };
  return { ok: true, isLand: false, cost };
}

export function playHandCard(
  state: GoldfishState,
  handIdx: number,
  cardOf: (name: string) => CardMeta | undefined,
): GoldfishState {
  const check = canPlayHandCard(state, handIdx, cardOf);
  if (!check.ok) return state;
  const name = state.hand[handIdx];
  const card = cardOf(name);
  const nextHand = state.hand.filter((_, i) => i !== handIdx);

  if (check.isLand) {
    const etbTapped = /enters (the battlefield )?tapped/i.test(card?.text ?? '') && !/unless/i.test(card?.text ?? '');
    const perm: PermanentOnField = {
      id: `p${state.nextId}`,
      name,
      isLand: true,
      manaProduced: cardManaYield(card, true),
      tapped: etbTapped,
    };
    return {
      ...state,
      hand: nextHand,
      battlefield: [...state.battlefield, perm],
      landsPlayedThisTurn: state.landsPlayedThisTurn + 1,
      log: [...state.log.slice(-11), `T${state.turn}: Land — ${name}${etbTapped ? ' (tapped)' : ''}`],
      nextId: state.nextId + 1,
    };
  }

  const paid = spendMana(state, check.cost);
  if (!paid) return state;

  if (/\b(Instant|Sorcery)\b/i.test(card?.type ?? '')) {
    return {
      ...state,
      hand: nextHand,
      battlefield: paid.battlefield,
      floatingMana: paid.floatingMana,
      graveyard: [...state.graveyard, name],
      log: [...state.log.slice(-11), `T${state.turn}: Cast ${name} (${check.cost})`],
    };
  }

  const perm: PermanentOnField = {
    id: `p${state.nextId}`,
    name,
    isLand: false,
    manaProduced: cardManaYield(card, false),
    tapped: false,
  };
  return {
    ...state,
    hand: nextHand,
    battlefield: [...paid.battlefield, perm],
    floatingMana: paid.floatingMana,
    log: [...state.log.slice(-11), `T${state.turn}: Cast ${name} (${check.cost})`],
    nextId: state.nextId + 1,
  };
}

export function castFromCommandZone(
  state: GoldfishState,
  czIdx: number,
  cardOf: (name: string) => CardMeta | undefined,
): GoldfishState {
  if (state.toBottom > 0) return state;
  const cz = state.commandZone[czIdx];
  if (!cz) return state;
  const card = cardOf(cz.name);
  const baseCmc = Math.max(0, Math.round(card?.cmc ?? 0));
  const cost = baseCmc + cz.casts * 2;
  const paid = spendMana(state, cost);
  if (!paid) return state;

  const perm: PermanentOnField = {
    id: `p${state.nextId}`,
    name: cz.name,
    isLand: false,
    manaProduced: cardManaYield(card, false),
    tapped: false,
    isCommander: true,
  };
  const nextCasts = cz.casts + 1;
  return {
    ...state,
    battlefield: [...paid.battlefield, perm],
    floatingMana: paid.floatingMana,
    commandZone: state.commandZone.filter((_, i) => i !== czIdx),
    commanderCasts: { ...state.commanderCasts, [norm(cz.name)]: nextCasts },
    log: [...state.log.slice(-11), `T${state.turn}: Cast Commander — ${cz.name} (${cost})`],
    nextId: state.nextId + 1,
  };
}

export function returnCommanderToZone(state: GoldfishState, permId: string): GoldfishState {
  const perm = state.battlefield.find((p) => p.id === permId && p.isCommander);
  if (!perm) return state;
  const casts = state.commanderCasts[norm(perm.name)] ?? 1;
  return {
    ...state,
    battlefield: state.battlefield.filter((p) => p.id !== permId),
    commandZone: [...state.commandZone, { name: perm.name, casts }],
    log: [...state.log.slice(-11), `T${state.turn}: ${perm.name} → Command Zone`],
  };
}

export function togglePermanentTap(state: GoldfishState, permId: string): GoldfishState {
  return {
    ...state,
    battlefield: state.battlefield.map((p) => (p.id === permId ? { ...p, tapped: !p.tapped } : p)),
  };
}

export function advanceTurn(state: GoldfishState): GoldfishState {
  if (state.toBottom > 0) return state;
  const nextTurn = state.turn + 1;
  const drawn = state.library[0];
  return {
    ...state,
    turn: nextTurn,
    hand: drawn ? [...state.hand, drawn] : state.hand,
    library: drawn ? state.library.slice(1) : state.library,
    battlefield: state.battlefield.map((p) => ({ ...p, tapped: false })),
    landsPlayedThisTurn: 0,
    floatingMana: 0,
    log: [...state.log.slice(-11), drawn ? `T${nextTurn}: Untap & drew ${drawn}` : `T${nextTurn}: Untap (library empty)`],
  };
}

export interface GoldfishSummary {
  runs: number;
  keepablePct: number;
  t4ThreeLandsPct: number;
  t3ManaAvg: number;
  t4ManaAvg: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Monte Carlo simulation over 4 turns (1 land/turn + affordable mana rocks). */
export function simulateGoldfish(
  cards: DeckCard[],
  cardOf: (name: string) => CardMeta | undefined,
  commander?: string,
  partner?: string,
  runs = 400,
): GoldfishSummary {
  const rng = mulberry32(0x474f4c44);
  let keepable = 0;
  let t4ThreeLands = 0;
  let t3ManaSum = 0;
  let t4ManaSum = 0;

  for (let r = 0; r < runs; r++) {
    let s = dealGoldfish(cards, commander, partner, 0, rng);
    const openLands = s.hand.filter((n) => isDeckLand(n, cardOf(n))).length;
    if (openLands >= 2 && openLands <= 4) keepable++;

    for (let turn = 1; turn <= 4; turn++) {
      // Play 1 land (preferring untapped)
      const landIdx = s.hand.findIndex((n) => isDeckLand(n, cardOf(n)) && !/enters (the battlefield )?tapped/i.test(cardOf(n)?.text ?? ''));
      const anyLandIdx = landIdx >= 0 ? landIdx : s.hand.findIndex((n) => isDeckLand(n, cardOf(n)));
      if (anyLandIdx >= 0) s = playHandCard(s, anyLandIdx, cardOf);

      // Cast up to 2 affordable mana rocks per turn to model ramp curves
      for (let k = 0; k < 2; k++) {
        const rockIdx = s.hand.findIndex((n, i) => {
          const c = cardOf(n);
          return !isDeckLand(n, c) && cardManaYield(c, false) > 0 && canPlayHandCard(s, i, cardOf).ok;
        });
        if (rockIdx < 0) break;
        s = playHandCard(s, rockIdx, cardOf);
      }

      if (turn === 3) t3ManaSum += maxManaPool(s);
      if (turn === 4) {
        t4ManaSum += maxManaPool(s);
        if (s.battlefield.filter((p) => p.isLand).length >= 3) t4ThreeLands++;
      } else {
        s = advanceTurn(s);
      }
    }
  }

  return {
    runs,
    keepablePct: Math.round((keepable / runs) * 100),
    t4ThreeLandsPct: Math.round((t4ThreeLands / runs) * 100),
    t3ManaAvg: Math.round((t3ManaSum / runs) * 10) / 10,
    t4ManaAvg: Math.round((t4ManaSum / runs) * 10) / 10,
  };
}

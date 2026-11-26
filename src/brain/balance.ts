import { BASICS } from '../lib/compare';
import type { DeckCard } from '../lib/db';
import { deckStats, isLand, roleOf, type BracketCall, type Role } from '../lib/deckstats';
import { norm } from '../lib/names';
import type { SubCard } from '../lib/subs';
import { landFit } from './build';
import { inIdentity } from './identity';
import { deckNeeds, scoreCard, type DeckContext, type Part } from './score';
import { readDeck } from './session';
import { karstenLands } from './validate';
import { AGGRESSION } from './win';

const BASIC_OF: Record<string, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

const ROLE_WORD: Record<Role, string> = {
  ramp: 'Ramp',
  draw: 'Card Draw',
  removal: 'Removal',
  wipes: 'Board Wipes',
  tutors: 'Tutors',
};

export interface BalanceItem {
  id: string;
  kind: 'add' | 'cut' | 'swap';
  add?: string;
  cut?: string;
  job?: string;
  why: string;
  parts: Part[];
  incl?: number;
  lift?: number;
  taken?: string;
  afterCut?: string;
}

export interface BalanceProposal {
  items: BalanceItem[];
  currentCount: number;
  targetCount: number;
  targetLands: number;
  mode: 'under' | 'over' | 'at100';
}

export interface ImpactStat {
  key: 'cards' | 'lands' | 'ramp' | 'draw' | 'removal' | 'wipes';
  label: string;
  before: number;
  after: number;
  range?: [number, number];
}

export interface BracketPathPlan {
  fits: boolean;
  target: 2 | 3;
  current: number;
  actions: { card: string; reason: string }[];
}

function pickBasic(identity: string[], idx: number): string {
  const cols = identity.filter((c) => BASIC_OF[c]);
  if (!cols.length) return 'Wastes';
  return BASIC_OF[cols[idx % cols.length]];
}

function gcCap(bracket: number): number {
  if (bracket <= 2) return 0;
  if (bracket === 3) return 3;
  return 999;
}

function addToDeckArr(list: DeckCard[], name: string): DeckCard[] {
  const k = norm(name);
  const idx = list.findIndex((c) => norm(c.name) === k);
  if (idx >= 0) {
    if (!BASICS.has(k)) return list;
    return list.map((c, i) => (i === idx ? { ...c, qty: c.qty + 1 } : c));
  }
  return [...list, { name, qty: 1 }];
}

function removeOneFromDeckArr(list: DeckCard[], name: string): DeckCard[] {
  const k = norm(name);
  return list.flatMap((c) => {
    if (norm(c.name) !== k) return [c];
    return c.qty > 1 ? [{ ...c, qty: c.qty - 1 }] : [];
  });
}

function cutImpactNote(name: string, ctx: DeckContext, currentRoles: Record<Role, number>): string | undefined {
  const card = ctx.cardOf(name);
  if (!card || isLand(card.type)) return undefined;
  const roles = roleOf({ ...card, name });
  const dial = AGGRESSION[ctx.aggression];
  for (const r of roles) {
    if (r === 'tutors') continue;
    const min = dial[r]?.[0];
    if (min == null) continue;
    const after = Math.max(0, currentRoles[r] - 1);
    if (after < min) return `After this cut: ${ROLE_WORD[r]} ${after}/${min} (below target)`;
  }
  return undefined;
}

/**
 * Pure proposal engine for Balance to 100.
 * Never mutates `ctx.deck` or `candidates`.
 */
export function balanceDeck(o: {
  ctx: DeckContext;
  candidates: SubCard[];
  identity: string[];
  partner?: string;
  pinned?: string[];
  never?: Set<string>;
  recOf?: (name: string) => SubCard | undefined;
  gameChangers?: Set<string> | null;
  allowSwapsAt100?: boolean;
}): BalanceProposal {
  const { ctx, candidates, identity, partner, pinned = [], never = new Set(), recOf, gameChangers, allowSwapsAt100 = true } = o;
  let work: DeckCard[] = ctx.deck.map((c) => ({ ...c }));
  const currentCount = work.reduce((n, c) => n + c.qty, 0);
  const baseStats = deckStats(work, ctx.cardOf, ctx.commander);
  const targetLands = Math.max(29, Math.min(38, karstenLands({ avgMv: baseStats.avgMv || 3.2, bracket: ctx.bracket })));
  const items: BalanceItem[] = [];

  const takenLabel = (name: string): string | undefined => {
    const t = ctx.taken?.(name);
    if (!t || t.used < t.own || !t.by.length) return undefined;
    return `in ${t.by[0]}`;
  };

  if (currentCount < 100) {
    const used = new Set(work.map((c) => norm(c.name)));
    let gcCount = gameChangers ? work.filter((c) => gameChangers.has(norm(c.name))).length : 0;
    const maxGc = gcCap(ctx.bracket);
    let basicStep = 0;

    while (work.reduce((n, c) => n + c.qty, 0) < 100) {
      const workCtx: DeckContext = { ...ctx, deck: work };
      const needs = deckNeeds(workCtx);
      const totalNow = work.reduce((n, c) => n + c.qty, 0);
      const slotsLeft = 100 - totalNow;
      const landsShort = Math.max(0, targetLands - needs.stats.lands);
      const wantLand = landsShort >= slotsLeft || (landsShort > 0 && items.length % 3 === 0);

      const pool = candidates.filter((c) => {
        const k = norm(c.name);
        if (used.has(k) || never.has(k) || BASICS.has(k)) return false;
        const meta = ctx.cardOf(c.name);
        if (meta && 'ci' in meta && Array.isArray((meta as { ci?: string[] }).ci)) {
          if (!inIdentity((meta as { ci: string[] }).ci, identity)) return false;
        }
        if (gameChangers?.has(k) && gcCount >= maxGc) return false;
        const land = isLand(c.type ?? meta?.type);
        return wantLand ? land : !land;
      });

      const colours = ['W', 'U', 'B', 'R', 'G'].filter((x) => identity.includes(x));
      const pips: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
      if (wantLand) {
        for (const dc of work) {
          for (const sym of ctx.cardOf(dc.name)?.mana?.match(/\{[^}]+\}/g) ?? []) {
            for (const x of colours) if (sym.includes(x)) pips[x] += dc.qty;
          }
        }
      }
      const maxPips = Math.max(...colours.map((x) => pips[x]), 0);
      const demand = (x: string) => (maxPips ? pips[x] / maxPips : 1);

      const scored = pool
        .map((c) => {
          const res = scoreCard(c, workCtx, needs);
          if (!wantLand) return { sub: c, res };
          const meta = ctx.cardOf(c.name);
          if (!meta) return { sub: c, res };
          const f = landFit(meta, colours, demand, needs.synergy, ctx.commander?.split(',')[0]);
          const extra = f.colour + f.tapped + f.restricted;
          return {
            sub: c,
            res: {
              ...res,
              total: res.total + extra,
              parts: [
                ...res.parts,
                ...(f.colour ? [{ label: `makes ${f.cols.join('')} for this deck`, value: f.colour, source: 'card text' as const }] : []),
                ...(f.restricted ? [{ label: 'conditional mana restriction', value: f.restricted, source: 'card text' as const }] : []),
              ],
            },
          };
        })
        .filter((x) => !x.res.blocked)
        .sort((a, b) => b.res.total - a.res.total || a.sub.name.localeCompare(b.sub.name));

      const best = scored[0];
      if (best) {
        const k = norm(best.sub.name);
        used.add(k);
        if (gameChangers?.has(k)) gcCount++;
        work = addToDeckArr(work, best.sub.name);
        const topParts = [...best.res.parts].filter((p) => p.value > 0).sort((a, b) => b.value - a.value);
        items.push({
          id: `add-${items.length}-${k}`,
          kind: 'add',
          add: best.sub.name,
          why: topParts.slice(0, 2).map((p) => p.label).join(' · ') || 'fits your colours and curve',
          parts: best.res.parts,
          incl: best.sub.incl,
          lift: best.sub.lift,
          taken: takenLabel(best.sub.name),
        });
        continue;
      }

      // No matching owned non-basic land or spell: use basic land when lands needed or owned spell pool exhausted
      const basic = pickBasic(identity, basicStep++);
      work = addToDeckArr(work, basic);
      items.push({
        id: `add-basic-${items.length}-${norm(basic)}`,
        kind: 'add',
        add: basic,
        why: wantLand ? 'balances land count for your colours' : 'fills remaining slot (owned spell pool exhausted)',
        parts: [],
      });
    }

    return { items, currentCount, targetCount: 100, targetLands, mode: 'under' };
  }

  if (currentCount > 100) {
    let excess = currentCount - 100;
    const allPinned = [...pinned, ...(partner ? [partner] : [])];
    const protectedSet = new Set([ctx.commander, partner, ...pinned].filter(Boolean).map((n) => norm(n!)));

    // Trim clearly excess basic lands first if way over targetLands
    if (baseStats.lands > targetLands + 2) {
      let landBudget = Math.min(excess, baseStats.lands - targetLands);
      for (const c of work) {
        if (landBudget <= 0) break;
        const k = norm(c.name);
        if (!BASICS.has(k) || protectedSet.has(k)) continue;
        const drop = Math.min(landBudget, Math.max(0, c.qty - 1));
        for (let i = 0; i < drop; i++) {
          work = removeOneFromDeckArr(work, c.name);
          excess--;
          landBudget--;
          items.push({
            id: `cut-land-${items.length}-${k}`,
            kind: 'cut',
            cut: c.name,
            why: `deck has ${baseStats.lands} lands (target ${targetLands})`,
            parts: [],
          });
        }
      }
    }

    if (excess > 0) {
      const read = readDeck({
        ctx: { ...ctx, deck: work },
        candidates,
        recOf,
        pinned: allPinned,
        cuts: excess + 8,
      });
      const roleCounts = { ...deckStats(work, ctx.cardOf, ctx.commander).roles };
      for (const c of read.cuts.slice(0, excess)) {
        const afterCut = cutImpactNote(c.name, ctx, roleCounts);
        const card = ctx.cardOf(c.name);
        if (card && !isLand(card.type)) {
          for (const r of roleOf({ ...card, name: c.name })) roleCounts[r] = Math.max(0, roleCounts[r] - 1);
        }
        const rec = recOf?.(c.name);
        items.push({
          id: `cut-${items.length}-${norm(c.name)}`,
          kind: 'cut',
          cut: c.name,
          why: c.why,
          parts: c.parts,
          incl: rec?.incl,
          lift: rec?.lift,
          afterCut,
        });
      }
    }

    return { items, currentCount, targetCount: 100, targetLands, mode: 'over' };
  }

  // Exactly 100 cards: offer category-rebalancing swaps for short roles/lands
  if (!allowSwapsAt100) {
    return { items: [], currentCount, targetCount: 100, targetLands, mode: 'at100' };
  }

  const allPinned = [...pinned, ...(partner ? [partner] : [])];
  const needs = deckNeeds(ctx);
  const dial = AGGRESSION[ctx.aggression];
  const shortCategories: { key: 'lands' | Role; label: string; deficit: number }[] = [];

  if (needs.stats.lands < targetLands - 1) {
    shortCategories.push({ key: 'lands', label: 'lands', deficit: targetLands - needs.stats.lands });
  }
  for (const r of ['ramp', 'draw', 'removal', 'wipes'] as const) {
    const min = dial[r][0];
    if (needs.stats.roles[r] < min) {
      shortCategories.push({ key: r, label: ROLE_WORD[r].toLowerCase(), deficit: min - needs.stats.roles[r] });
    }
  }

  if (!shortCategories.length) {
    return { items: [], currentCount, targetCount: 100, targetLands, mode: 'at100' };
  }

  const read = readDeck({
    ctx,
    candidates,
    recOf,
    pinned: allPinned,
    cuts: 18,
  });

  const cutCandidates = read.cuts.filter((c) => !c.holds);
  const usedIn = new Set(work.map((c) => norm(c.name)));
  const usedOut = new Set<string>();
  let gcCount = gameChangers ? work.filter((c) => gameChangers.has(norm(c.name))).length : 0;
  const maxGc = gcCap(ctx.bracket);
  let basicIdx = 0;

  for (const cat of shortCategories) {
    for (let step = 0; step < cat.deficit && items.length < 6; step++) {
      const cut = cutCandidates.find((c) => !usedOut.has(norm(c.name)));
      if (!cut) break;

      const pool = candidates.filter((c) => {
        const k = norm(c.name);
        if (usedIn.has(k) || never.has(k) || BASICS.has(k)) return false;
        if (gameChangers?.has(k) && gcCount >= maxGc) return false;
        const meta = ctx.cardOf(c.name);
        const type = c.type ?? meta?.type ?? '';
        if (cat.key === 'lands') return isLand(type);
        if (isLand(type) || !meta) return false;
        return roleOf({ ...meta, name: c.name }).includes(cat.key);
      });

      const scored = pool
        .map((c) => ({ sub: c, res: scoreCard(c, ctx, needs) }))
        .filter((x) => !x.res.blocked)
        .sort((a, b) => b.res.total - a.res.total || a.sub.name.localeCompare(b.sub.name));

      const best = scored[0];
      let addName: string | undefined = best?.sub.name;
      let parts: Part[] = best?.res.parts ?? [];
      let incl = best?.sub.incl;
      let lift = best?.sub.lift;

      if (!addName && cat.key === 'lands') {
        addName = pickBasic(identity, basicIdx++);
      }
      if (!addName) break;

      usedOut.add(norm(cut.name));
      usedIn.add(norm(addName));
      if (gameChangers?.has(norm(addName))) gcCount++;

      const afterCut = cutImpactNote(cut.name, ctx, needs.stats.roles);
      items.push({
        id: `swap-${items.length}-${norm(cut.name)}-${norm(addName)}`,
        kind: 'swap',
        cut: cut.name,
        add: addName,
        job: cat.label,
        why: `fills short ${cat.label}; ${cut.why}`,
        parts,
        incl,
        lift,
        taken: takenLabel(addName),
        afterCut,
      });
    }
  }

  return { items, currentCount, targetCount: 100, targetLands, mode: 'at100' };
}

/** Applies ONLY the ticked items to a decklist without ever substituting unticked items. */
export function applyProposal(deck: DeckCard[], items: BalanceItem[], tickedIds: Set<string>): DeckCard[] {
  let out = deck.map((c) => ({ ...c }));
  for (const item of items) {
    if (!tickedIds.has(item.id)) continue;
    if (item.kind === 'add' && item.add) {
      out = addToDeckArr(out, item.add);
    } else if (item.kind === 'cut' && item.cut) {
      out = removeOneFromDeckArr(out, item.cut);
    } else if (item.kind === 'swap' && item.cut && item.add) {
      out = removeOneFromDeckArr(out, item.cut);
      out = addToDeckArr(out, item.add);
    }
  }
  return out;
}

/** Summarizes before -> after stats across core categories for the ticked proposal. */
export function proposalImpact(beforeDeck: DeckCard[], afterDeck: DeckCard[], ctx: DeckContext, targetLands: number): ImpactStat[] {
  const b = deckStats(beforeDeck, ctx.cardOf, ctx.commander);
  const a = deckStats(afterDeck, ctx.cardOf, ctx.commander);
  const dial = AGGRESSION[ctx.aggression];
  return [
    { key: 'cards', label: 'Cards', before: b.total, after: a.total, range: [100, 100] },
    { key: 'lands', label: 'Lands', before: b.lands, after: a.lands, range: [Math.min(35, targetLands), Math.max(38, targetLands)] },
    { key: 'ramp', label: 'Ramp', before: b.roles.ramp, after: a.roles.ramp, range: dial.ramp },
    { key: 'draw', label: 'Draw', before: b.roles.draw, after: a.roles.draw, range: dial.draw },
    { key: 'removal', label: 'Removal', before: b.roles.removal, after: a.roles.removal, range: dial.removal },
    { key: 'wipes', label: 'Wipes', before: b.roles.wipes, after: a.roles.wipes, range: dial.wipes },
  ];
}

/** "One path to Bracket X" (from Spellweave): concrete cuts required to bring a deck down to Bracket 2 or 3. */
export function bracketPath(call: BracketCall, target: 2 | 3, commander?: string, partner?: string): BracketPathPlan {
  const protectedLead = new Set([commander, partner].filter(Boolean).map((n) => norm(n!)));
  const actions: { card: string; reason: string }[] = [];
  const seen = new Set<string>();
  const push = (card: string, reason: string) => {
    const k = norm(card);
    if (seen.has(k)) return;
    seen.add(k);
    actions.push({ card, reason });
  };

  if (target === 2) {
    for (const gc of call.gameChangers) push(gc, 'Game Changer (none allowed in Bracket II)');
    for (const mld of call.mld) push(mld, 'Mass Land Denial (not allowed in Bracket II)');
    for (const et of call.extraTurns) push(et, 'Extra turn spell (avoid chaining in Bracket II)');
    for (const combo of call.combos) {
      const cut = combo.cards.find((c) => !protectedLead.has(norm(c))) ?? combo.cards[1];
      if (!combo.cards.some((c) => seen.has(norm(c)))) {
        push(cut, `Breaks 2-card combo (${combo.cards.join(' + ')})`);
      }
    }
  } else {
    if (call.gameChangers.length > 3) {
      for (const gc of call.gameChangers.slice(3)) {
        push(gc, `4th+ Game Changer (Bracket III allows at most 3)`);
      }
    }
    for (const mld of call.mld) push(mld, 'Mass Land Denial (not allowed in Bracket III)');
    for (const combo of call.combos.filter((c) => c.early)) {
      const cut = combo.cards.find((c) => !protectedLead.has(norm(c))) ?? combo.cards[1];
      if (!combo.cards.some((c) => seen.has(norm(c)))) {
        push(cut, `Breaks early 2-card combo (${combo.cards.join(' + ')})`);
      }
    }
  }

  return {
    fits: call.bracket > 0 && call.bracket <= target && actions.length === 0,
    target,
    current: call.bracket,
    actions,
  };
}

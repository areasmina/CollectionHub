import type { Card, DeckCard } from '../lib/db';
import { BASICS } from '../lib/compare';
import { isLand } from '../lib/deckstats';
import { norm } from '../lib/names';
import type { SubCard } from '../lib/subs';
import { inIdentity } from './identity';
import { deckNeeds, scoreCard, type DeckContext, type Part } from './score';
import { landColours } from './validate';
import type { Aggression } from './win';
import { STACK_WEIGHTS, themeRoleOf } from './themes';

type FocusTheme = { label: string; test: (c: Pick<Card, 'type' | 'text'> & { name: string }) => boolean };

/**
 * Owned-only builder (plan phase 2a): the best 99 from your binder for a commander, with the same scoreCard every view
 * uses. Greedy and needs-aware: after each pick the deck's needs are recounted, so a deck short of draw values draw.
 * Rules first, always: colour identity, Commander-legal, singleton, Game Changer cap and the bracket's combo rules
 * (scoreCard marks a combo the bracket forbids as blocked; blocked cards are never picked).
 *
 * Strategy: `focus` is the strategy you pick (an archetype such as Villains or Discard), a test on the card's text and
 * type. Matching cards get FOCUS_W, so a less popular strategy surfaces owned cards the popular build skips
 * (CLAUDE.md "strategy independence": EDHREC is evidence, not a requirement).
 */
export const FOCUS_W = 0.3;
const BALANCE_W = 0.08;
/** Lands when the curve says nothing else (Karsten's formula is in validate.ts karstenLands). */
export const LANDS = 36;
export const LANDS_CEDH = 29;
/** Basics kept at least, by number of colours, so the mana works with owned duals first (Deck Wizard owned_duals). */
const BASICS_MIN: Record<number, number> = { 0: 0, 1: 20, 2: 12, 3: 8, 4: 5, 5: 3 };
const GC_CAP: Record<number, number> = { 1: 0, 2: 0, 3: 3, 4: 99, 5: 99 };
const BASIC_OF: Record<string, string> = { W: 'Plains', U: 'Island', B: 'Swamp', R: 'Mountain', G: 'Forest' };

type Meta = Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'legal'>;
export interface BuildPick {
  name: string;
  total: number;
  parts: Part[];
}
export interface Built {
  cards: DeckCard[];
  picks: BuildPick[];
  lands: string[];
  basics: Record<string, number>;
  /** Owned cards the rules kept out, with why (for the tests and "why not this card?"). */
  refused: { name: string; why: string }[];
}

export function buildDeck(o: {
  commander: string;
  partner?: string;
  identity: string[];
  /** Owned cards with their evidence (incl / lift when known). Basics are added by the builder. */
  owned: SubCard[];
  cardOf: (name: string) => Meta | undefined;
  bracket: number;
  aggression?: Aggression;
  gc?: Set<string> | null;
  /** The strategy stack: one theme, or a primary plus up to two secondary themes (themes.ts themeOf). */
  focus?: FocusTheme | FocusTheme[];
  pins?: { in: string[]; out: string[] };
  lands?: number;
}): Built {
  const lead = [o.commander, ...(o.partner ? [o.partner] : [])];
  const leadKeys = new Set(lead.map(norm));
  const out = new Set((o.pins?.out ?? []).map(norm));
  const refused: Built['refused'] = [];
  const seen = new Set<string>();
  const pool: (SubCard & { meta: Meta })[] = [];
  for (const c of o.owned) {
    const k = norm(c.name);
    if (seen.has(k) || leadKeys.has(k) || BASICS.has(k) || out.has(k)) continue;
    seen.add(k);
    const meta = o.cardOf(c.name);
    if (!meta) refused.push({ name: c.name, why: 'no card data' });
    else if (!meta.legal) refused.push({ name: c.name, why: 'not legal in Commander' });
    else if (!inIdentity(meta.ci, o.identity)) refused.push({ name: c.name, why: "outside the commander's colours" });
    else pool.push({ ...c, type: meta.type, cmc: meta.cmc, meta });
  }

  const landTarget = o.lands ?? (o.bracket >= 5 ? LANDS_CEDH : LANDS);
  const slots = 100 - lead.length;
  const deck: DeckCard[] = lead.map((name) => ({ name, qty: 1 }));
  const picks: BuildPick[] = [];
  const has = new Set(lead.map(norm));
  const add = (name: string, p?: BuildPick) => {
    deck.push({ name, qty: 1 });
    has.add(norm(name));
    if (p) picks.push(p);
  };
  for (const name of o.pins?.in ?? []) {
    const c = pool.find((x) => norm(x.name) === norm(name));
    if (c && !has.has(norm(name))) add(c.name, { name: c.name, total: 0, parts: [{ label: 'pinned by you', value: 0, source: 'your taste' }] });
  }

  // Spells: greedy on scoreCard + strategy, needs recounted after each pick.
  const ctx: DeckContext = { deck, cardOf: o.cardOf, commander: o.commander, bracket: o.bracket, aggression: o.aggression ?? 'hungry' };
  const spells = pool.filter((c) => !isLand(c.meta.type));
  const gcCap = GC_CAP[o.bracket] ?? 99;
  const gcCount = () => deck.filter((c) => o.gc?.has(norm(c.name))).length;
  const spellTarget = slots - landTarget;
  const stack = (Array.isArray(o.focus) ? o.focus : o.focus ? [o.focus] : []).slice(0, STACK_WEIGHTS.length);
  while (deck.length - lead.length < spellTarget) {
    const needs = deckNeeds(ctx);
    const gcFull = gcCount() >= gcCap;
    // Count enablers vs payoffs for the primary strategy theme so we don't build all payoffs with no engine.
    let enablers = 0;
    let payoffs = 0;
    if (stack[0]) {
      for (const dc of deck) {
        const m = o.cardOf(dc.name);
        if (!m) continue;
        const tr = themeRoleOf(stack[0].label, m);
        if (tr === 'enabler') enablers += dc.qty;
        else if (tr === 'payoff') payoffs += dc.qty;
      }
    }
    let best: BuildPick | undefined;
    for (const c of spells) {
      if (has.has(norm(c.name))) continue;
      if (gcFull && o.gc?.has(norm(c.name))) continue;
      const s = scoreCard(c, ctx, needs);
      if (s.blocked) continue;
      const parts = [...s.parts];
      let total = s.total;
      stack.forEach((t, i) => {
        if (!t.test({ ...c.meta, name: c.name })) return;
        const w = FOCUS_W * (STACK_WEIGHTS[i] ?? 0);
        parts.push({ label: `strategy: ${t.label}`, value: w, source: 'card text' });
        total += w;
        if (i === 0) {
          const tr = themeRoleOf(t.label, c.meta);
          if (tr === 'enabler' && payoffs >= 3 && enablers < Math.ceil(payoffs * 0.75)) {
            parts.push({ label: `enabler for ${t.label.toLowerCase()}`, value: BALANCE_W, source: 'deck needs' });
            total += BALANCE_W;
          } else if (tr === 'payoff' && enablers >= 4 && payoffs < 2) {
            parts.push({ label: `payoff for ${t.label.toLowerCase()}`, value: BALANCE_W, source: 'deck needs' });
            total += BALANCE_W;
          }
        }
      });
      if (!best || total > best.total || (total === best.total && c.name < best.name)) best = { name: c.name, total, parts };
    }
    if (!best) break; // the binder ran out of legal spells: the rest goes to lands
    add(best.name, best);
  }

  // Lands: owned non-basics weighted by the deck's coloured pip demand (Karsten's colour math), then basics split by pips.
  const colours = ['W', 'U', 'B', 'R', 'G'].filter((x) => o.identity.includes(x));
  const pips: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
  const multiPip: Record<string, number> = Object.fromEntries(colours.map((x) => [x, 0]));
  for (const c of deck) {
    const syms = o.cardOf(c.name)?.mana?.match(/\{[^}]+\}/g) ?? [];
    for (const x of colours) {
      const count = syms.filter((s) => s.includes(x)).length;
      if (count > 0) pips[x] += count;
      if (count >= 2) multiPip[x] += count - 1;
    }
  }
  const maxDemand = Math.max(1, ...colours.map((x) => pips[x] + 0.5 * multiPip[x]));
  const landSlots = slots - (deck.length - lead.length);
  const nonbasicMax = Math.max(0, landSlots - (BASICS_MIN[colours.length] ?? 0));
  const ranked = pool
    .filter((c) => isLand(c.meta.type) && !has.has(norm(c.name)))
    .map((c) => {
      const cols = [...landColours(c.meta)].filter((x) => colours.includes(x));
      const made = cols.length;
      const demandSum = cols.reduce((s, x) => s + (0.75 + 0.5 * ((pips[x] + 0.5 * multiPip[x]) / maxDemand)), 0);
      return { c, made, rank: (c.incl ?? 0) + 0.1 * demandSum + (/enters (the battlefield )?tapped/i.test(c.meta.text) && !/unless/i.test(c.meta.text) ? -0.05 : 0) };
    })
    .filter((x) => x.made > 0 || (x.c.incl ?? 0) > 0)
    .sort((a, b) => b.rank - a.rank || a.c.name.localeCompare(b.c.name))
    .map((x) => x.c.name);
  const lands: string[] = [];
  for (const l of ranked) {
    if (lands.length >= nonbasicMax) break;
    if (o.gc?.has(norm(l)) && gcCount() >= gcCap) continue; // Gaea's Cradle & co. count toward the cap too
    lands.push(l);
    add(l);
  }
  const basicsLeft = slots - (deck.length - lead.length);
  const basics: Record<string, number> = {};
  if (basicsLeft > 0) {
    if (!colours.length) basics.Wastes = basicsLeft;
    else {
      // Split by coloured pips + Karsten double-pip demand (Manafoundry countColorPips + Karsten multi-pip weight), at least one of each colour.
      const weight = (x: string) => Math.max(1, pips[x] + 0.5 * multiPip[x]);
      const sum = colours.reduce((n, x) => n + weight(x), 0);
      const raw = colours.map((x) => ({ x, v: (basicsLeft * weight(x)) / sum }));
      for (const r of raw) basics[BASIC_OF[r.x]] = Math.floor(r.v);
      let left = basicsLeft - raw.reduce((n, r) => n + Math.floor(r.v), 0);
      for (const r of [...raw].sort((a, b) => (b.v % 1) - (a.v % 1))) if (left-- > 0) basics[BASIC_OF[r.x]]++;
    }
    for (const [name, qty] of Object.entries(basics)) if (qty > 0) deck.push({ name, qty });
  }
  return { cards: deck, picks, lands, basics, refused };
}

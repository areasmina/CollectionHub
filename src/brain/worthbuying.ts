import { BASICS } from '../lib/compare';
import { norm } from '../lib/names';
import type { SubCard } from '../lib/subs';
import { inIdentity } from './identity';
import type { DeckContext, Part } from './score';
import { readDeck, UPGRADE_MARGIN, upgradeLine } from './session';

/**
 * Missing upgrades worth buying (DeckWizard rule):
 *   - Ranked strictly by deck fit & synergy (readDeck upgrades + high-fit additions).
 *   - Price is strictly information + an optional per-card ceiling filter: price NEVER alters a card's score or rank.
 *   - Kept out of Forge SUGGESTIONS (which stay owned-only); shown only in BalanceSheet WORTH BUYING.
 */
export interface WorthBuyingItem {
  name: string;
  replaces?: string;
  job?: string;
  /** Score (or score gain over `replaces`). Price NEVER enters this number. */
  score: number;
  gain?: number;
  why: string;
  parts: Part[];
  incl?: number;
  lift?: number;
  /** Informational CAD price (cheapest paper printing), if known. */
  cad?: number;
  /** True when maxCad is set and cad > maxCad. */
  overBudget?: boolean;
}

const gcCap = (bracket: number) => (bracket <= 2 ? 0 : bracket === 3 ? 3 : 999);

export function worthBuying(o: {
  ctx: DeckContext;
  unowned: SubCard[];
  identity: string[];
  pinned?: string[];
  never?: Set<string>;
  recOf?: (name: string) => SubCard | undefined;
  priceOf?: (name: string) => number | undefined;
  gameChangers?: Set<string> | null;
  maxCad?: number | null;
  hideOverBudget?: boolean;
  limit?: number;
}): WorthBuyingItem[] {
  const { ctx, unowned, identity, pinned = [], never = new Set(), recOf, priceOf, gameChangers, maxCad = null, hideOverBudget = false, limit = 12 } = o;
  const inDeck = new Set(ctx.deck.map((c) => norm(c.name)));
  const maxGc = gcCap(ctx.bracket);
  const currentGc = gameChangers ? ctx.deck.filter((c) => gameChangers.has(norm(c.name))).length : 0;

  const seen = new Set<string>();
  const filtered: SubCard[] = [];
  for (const c of unowned) {
    const k = norm(c.name);
    if (seen.has(k) || inDeck.has(k) || never.has(k) || BASICS.has(k)) continue;
    seen.add(k);
    const meta = ctx.cardOf(c.name) as ({ ci?: string[]; legal?: boolean } & NonNullable<ReturnType<DeckContext['cardOf']>>) | undefined;
    if (meta?.legal === false) continue;
    if (meta?.ci && !inIdentity(meta.ci, identity)) continue;
    if (gameChangers?.has(k) && currentGc >= maxGc) continue;
    filtered.push(c);
  }

  const read = readDeck({ ctx, candidates: filtered, recOf, pinned, suggestions: 24, cuts: 16 });
  const candByKey = new Map(filtered.map((c) => [norm(c.name), c]));
  const items: WorthBuyingItem[] = [];
  const used = new Set<string>();

  for (const u of read.upgrades) {
    if (u.gain < UPGRADE_MARGIN) continue;
    const k = norm(u.in);
    used.add(k);
    const rec = candByKey.get(k);
    const cad = priceOf?.(u.in);
    items.push({
      name: u.in,
      replaces: u.out,
      job: u.job,
      score: u.gain,
      gain: u.gain,
      why: upgradeLine(u),
      parts: u.parts,
      incl: rec?.incl,
      lift: rec?.lift,
      cad,
      overBudget: maxCad != null && cad != null && cad > maxCad,
    });
  }

  for (const s of read.suggestions) {
    if (s.blocked || s.total < 0.22) continue;
    const k = norm(s.name);
    if (used.has(k)) continue;
    used.add(k);
    const rec = candByKey.get(k);
    const cad = priceOf?.(s.name);
    const reasons = [...s.parts]
      .filter((p) => p.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 2)
      .map((p) => p.label)
      .join(' · ');
    items.push({
      name: s.name,
      score: s.total,
      why: reasons || 'strong fit for your commander and deck plan',
      parts: s.parts,
      incl: rec?.incl,
      lift: rec?.lift,
      cad,
      overBudget: maxCad != null && cad != null && cad > maxCad,
    });
  }

  // Strictly ranked by deck fit / upgrade gain; price NEVER enters sort order.
  items.sort((a, b) => (b.gain ?? b.score) - (a.gain ?? a.score) || a.name.localeCompare(b.name));
  const out = hideOverBudget && maxCad != null ? items.filter((x) => !x.overBudget) : items;
  return out.slice(0, limit);
}

import type { Card, DeckCard } from '../../lib/db';
import { BASICS } from '../../lib/compare';
import { groupOf, isLand, roleOf } from '../../lib/deckstats';
import { norm } from '../../lib/names';
import { toCad } from '../../lib/prices';
import { canLead } from '../../lib/commander';
import { inIdentity } from '../../brain/identity';
import { STEP_LABEL, type Step, type StepPick } from '../../brain/guided';

export const WIZARD_STEPS = [
  'commander',
  'lands',
  'ramp',
  'draw',
  'removal',
  'wipes',
  'plan',
  'rest',
  'review',
] as const;

export type WizardStep = (typeof WIZARD_STEPS)[number];

export const WIZARD_STEP_LABEL: Record<WizardStep, string> = {
  commander: 'Commander',
  lands: STEP_LABEL.lands,
  ramp: STEP_LABEL.ramp,
  draw: STEP_LABEL.draw,
  removal: STEP_LABEL.removal,
  wipes: STEP_LABEL.wipes,
  plan: STEP_LABEL.plan,
  rest: STEP_LABEL.rest,
  review: 'Review & Save',
};

export const WIZARD_STEP_HINTS: Record<WizardStep, string> = {
  commander: 'Pick your commander directly, or start with up to 12 seed cards you want to build around.',
  lands: 'Aim for 35–38 lands. Auto-fill adds basics evenly across your commander colours.',
  ramp: 'Rocks, dorks, and land ramp to cast threats ahead of curve.',
  draw: 'Engines and burst draw so the deck never stalls mid-game.',
  removal: 'Instant-speed spot answers for commanders, artifacts, and enchantments.',
  wipes: 'Board resets when one player runs away with the table.',
  plan: 'Synergy pieces, win conditions, and finishers.',
  rest: 'Utility slots and leftover binder fits to reach 100 cards.',
  review: 'Check land, curve, and role totals, then save straight to My Decks.',
};

export const BASIC_LAND_FOR: Record<'W' | 'U' | 'B' | 'R' | 'G', string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

export const BASIC_NAMES = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'] as const;

export const MAX_SEED_CARDS = 12;

export type TabletopGroupBy = 'categories' | 'type' | 'mv';
export type TabletopPlacement = 'primary' | 'all';
export type TabletopStackStyle = 'compact' | 'art';

export interface CommanderMatch {
  card: Card;
  matchedSeeds: number;
  totalSeeds: number;
  fitsAllSeeds: boolean;
}

/** Wrap a card lookup so basic lands always resolve offline without an IndexedDB hit. */
export function withBasicFallback(
  lookup: (name: string) => Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'usd' | 'img'> | undefined
) {
  return (name: string): Pick<Card, 'type' | 'text' | 'cmc' | 'mana' | 'ci' | 'usd' | 'img'> | undefined => {
    const found = lookup(name);
    if (found) return found;
    if (BASICS.has(norm(name))) {
      return { type: 'Basic Land', text: '', cmc: 0, mana: '', ci: [] };
    }
    return undefined;
  };
}

/**
 * Find commanders in `binder` whose colour identity fits `seedCards`, ranked by how many seed
 * cards match (exact 100% colour-fit first, then smallest tightest colour identity, then name).
 */
export function matchCommandersForCards(
  seedCards: Pick<Card, 'name' | 'ci'>[],
  binder: Card[]
): CommanderMatch[] {
  const leads = binder.filter((c) => c.legal !== false && canLead(c));
  const totalSeeds = seedCards.length;
  return leads
    .map((card) => {
      const matchedSeeds =
        totalSeeds === 0 ? 0 : seedCards.filter((s) => inIdentity(s.ci ?? [], card.ci ?? [])).length;
      return {
        card,
        matchedSeeds,
        totalSeeds,
        fitsAllSeeds: totalSeeds === 0 || matchedSeeds === totalSeeds,
      };
    })
    .filter((m) => totalSeeds === 0 || m.matchedSeeds > 0)
    .sort(
      (a, b) =>
        b.matchedSeeds - a.matchedSeeds ||
        Number(b.fitsAllSeeds) - Number(a.fitsAllSeeds) ||
        (a.card.ci?.length ?? 0) - (b.card.ci?.length ?? 0) ||
        a.card.name.localeCompare(b.card.name)
    );
}

/** Compute total card count in a deck list (respecting quantities). */
export function totalCardsIn(cards: readonly DeckCard[]): number {
  return cards.reduce((sum, c) => sum + c.qty, 0);
}

/** Adjust a single card's quantity by `delta` (removing the entry when qty hits 0). */
export function adjustDeckCard(cards: readonly DeckCard[], name: string, delta: number): DeckCard[] {
  const key = norm(name);
  const idx = cards.findIndex((c) => norm(c.name) === key);
  if (idx === -1) {
    return delta > 0 ? [...cards, { name, qty: delta }] : [...cards];
  }
  const nextQty = cards[idx].qty + delta;
  if (nextQty <= 0) {
    return cards.filter((_, i) => i !== idx);
  }
  return cards.map((c, i) => (i === idx ? { ...c, qty: nextQty } : c));
}

/**
 * Add basic lands evenly across `identity` colours (or Wastes when colourless) until the deck
 * reaches `targetLands` lands or `maxDeckSize` total cards (including commander count if already inside `cards`).
 */
export function autoFillBasics(
  cards: readonly DeckCard[],
  cardOf: (name: string) => Pick<Card, 'type'> | undefined,
  identity: readonly string[],
  targetLands = 37,
  maxDeckSize = 100
): DeckCard[] {
  const resolve = withBasicFallback(cardOf as (name: string) => Card | undefined);
  let next = cards.map((c) => ({ ...c }));
  let currentLands = next.reduce((n, c) => n + (isLand(resolve(c.name)?.type) ? c.qty : 0), 0);
  let total = totalCardsIn(next);

  const basics: string[] = identity
    .filter((c): c is 'W' | 'U' | 'B' | 'R' | 'G' => c in BASIC_LAND_FOR)
    .map((c) => BASIC_LAND_FOR[c]);
  const pool = basics.length > 0 ? basics : ['Wastes'];

  const need = Math.max(0, Math.min(targetLands - currentLands, maxDeckSize - total));
  if (need === 0) return next;

  for (let i = 0; i < need; i++) {
    const landName = pool[i % pool.length];
    next = adjustDeckCard(next, landName, 1);
  }
  return next;
}

export interface TabletopPile {
  id: string;
  label: string;
  cards: DeckCard[];
  count: number;
  target?: [number, number];
}

const ROLE_ORDER: Array<{ key: 'ramp' | 'draw' | 'removal' | 'wipes'; label: string; target: [number, number] }> = [
  { key: 'ramp', label: 'Ramp', target: [9, 12] },
  { key: 'draw', label: 'Card Advantage', target: [9, 12] },
  { key: 'removal', label: 'Removal', target: [7, 10] },
  { key: 'wipes', label: 'Board Wipes', target: [2, 4] },
];

const MV_BUCKETS = ['Commander', 'Lands', '0–1 MV', '2 MV', '3 MV', '4 MV', '5 MV', '6+ MV'] as const;

const TYPE_ORDER = [
  'Commander',
  'Lands',
  'Creatures',
  'Instants',
  'Sorceries',
  'Artifacts',
  'Enchantments',
  'Planeswalkers',
  'Battles',
  'Other',
] as const;

/** Group deck cards into Tabletop piles by Category, Card Type, or Mana Value. */
export function groupForTabletop(
  cards: readonly DeckCard[],
  cardOf: (name: string) => Pick<Card, 'type' | 'text' | 'cmc'> | undefined,
  mode: TabletopGroupBy,
  commander?: string,
  partner?: string,
  placement: TabletopPlacement = 'primary'
): TabletopPile[] {
  const resolve = withBasicFallback(cardOf as (name: string) => Card | undefined);
  const leadSet = new Set([commander, partner].filter(Boolean).map((n) => norm(n!)));
  const buckets = new Map<string, DeckCard[]>();
  const targetById = new Map<string, [number, number] | undefined>();

  const push = (id: string, card: DeckCard) => {
    const list = buckets.get(id);
    if (list) list.push(card);
    else buckets.set(id, [card]);
  };

  if (mode === 'categories') {
    targetById.set('Commander', [1, 2]);
    targetById.set('Lands', [35, 38]);
    for (const r of ROLE_ORDER) targetById.set(r.label, r.target);
    targetById.set('Plan / Synergy', [20, 32]);

    for (const entry of cards) {
      if (leadSet.has(norm(entry.name))) {
        push('Commander', entry);
        continue;
      }
      const meta = resolve(entry.name);
      if (isLand(meta?.type)) {
        push('Lands', entry);
        continue;
      }
      const roles = meta ? roleOf({ name: entry.name, type: meta.type, text: meta.text ?? '' }) : [];
      if (placement === 'all') {
        const matched = ROLE_ORDER.filter((r) => roles.includes(r.key));
        if (matched.length > 0) {
          for (const m of matched) push(m.label, entry);
        } else {
          push('Plan / Synergy', entry);
        }
      } else {
        const primary = ROLE_ORDER.find((r) => roles.includes(r.key));
        push(primary ? primary.label : 'Plan / Synergy', entry);
      }
    }

    const order = ['Commander', 'Lands', ...ROLE_ORDER.map((r) => r.label), 'Plan / Synergy'];
    return order.map((id) => {
      const list = buckets.get(id) ?? [];
      return {
        id,
        label: id,
        cards: list,
        count: totalCardsIn(list),
        target: targetById.get(id),
      };
    });
  }

  if (mode === 'type') {
    for (const entry of cards) {
      if (leadSet.has(norm(entry.name))) {
        push('Commander', entry);
        continue;
      }
      const meta = resolve(entry.name);
      push(groupOf(meta?.type), entry);
    }
    return TYPE_ORDER.map((id) => {
      const list = buckets.get(id) ?? [];
      return { id, label: id, cards: list, count: totalCardsIn(list) };
    }).filter((p) => p.cards.length > 0 || p.id === 'Commander' || p.id === 'Lands');
  }

  // mode === 'mv'
  for (const entry of cards) {
    if (leadSet.has(norm(entry.name))) {
      push('Commander', entry);
      continue;
    }
    const meta = resolve(entry.name);
    if (isLand(meta?.type)) {
      push('Lands', entry);
      continue;
    }
    const mv = Math.max(0, Math.round(meta?.cmc ?? 0));
    const bucket = mv <= 1 ? '0–1 MV' : mv >= 6 ? '6+ MV' : `${mv} MV`;
    push(bucket, entry);
  }
  return MV_BUCKETS.map((id) => {
    const list = buckets.get(id) ?? [];
    return { id, label: id, cards: list, count: totalCardsIn(list) };
  }).filter((p) => p.cards.length > 0 || p.id === 'Commander' || p.id === 'Lands');
}

/**
 * Filter guided picks by a maximum per-card CAD cap. Cards without a cached USD price are kept
 * so offline/uncached binders still populate suggestions.
 */
export function filterByMaxPrice(
  picks: readonly StepPick[],
  cardOf: (name: string) => Pick<Card, 'usd'> | undefined,
  maxCad: number | null
): StepPick[] {
  if (maxCad == null) return [...picks];
  return picks.filter((p) => {
    const card = cardOf(p.name);
    const cadPrice = toCad(card?.usd);
    return cadPrice == null || cadPrice <= maxCad;
  });
}

export function isEngineStep(step: WizardStep): step is Step {
  return step !== 'commander' && step !== 'review';
}

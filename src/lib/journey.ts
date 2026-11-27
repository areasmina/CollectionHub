/**
 * The deckbuilding journey (Guillermo, Nov 27): START (Guided) → EXPLORE (tag graph) → TUNE (the Forge), three linked
 * stops for one deck. Nothing here scores or picks cards; it only says where each stop is and carries the commander's
 * colours from one stop to the next.
 */
export type JourneyStep = 'start' | 'explore' | 'tune';

export const JOURNEY_STEPS: readonly JourneyStep[] = ['start', 'explore', 'tune'];

export const JOURNEY_LABEL: Record<JourneyStep, string> = {
  start: 'START',
  explore: 'EXPLORE',
  tune: 'TUNE',
};

/** One line on what each stop is for, shown as the button's title and to screen readers. */
export const JOURNEY_HINT: Record<JourneyStep, string> = {
  start: 'Guided steps from your commander: lands, ramp, draw, removal and the plan, from your own cards',
  explore: 'The tag graph: every card of yours in an idea (tokens, sacrifice…), in your commander’s colours',
  tune: 'The Forge: Live Suggestions, Theme Chips, Balance to 100, Cut Lab and Bracket Path',
};

/** Mana letters the tag graph understands; anything else (a stray value from old data) is dropped. */
const PIPS = new Set(['W', 'U', 'B', 'R', 'G']);

/** A commander's colour identity as the tag graph's colour filter: WUBRG order, colourless as C. */
export function exploreColours(identity: readonly string[] | undefined): string[] {
  const got = [...new Set((identity ?? []).map((c) => c.toUpperCase()).filter((c) => PIPS.has(c)))];
  if (!got.length) return identity ? ['C'] : [];
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => got.includes(c));
}

/** What EXPLORE opens on: the commander's colours, and the deck that "+ ADD" puts cards into (from a deck's TUNE). */
export interface ExploreTarget {
  colours: string[];
  deckId?: number;
}

// Hand-off to the tag graph, the same pattern as the other nav hand-offs (lib/nav.ts).
const OPEN_EXPLORE = 'ch:journeyexplore';
let pendingExplore: ExploreTarget | null = null;
export function sendToExplore(target: ExploreTarget) {
  pendingExplore = target;
  dispatchEvent(new CustomEvent(OPEN_EXPLORE, { detail: target }));
}
/** Read without clearing: a component's first render may run twice in development. */
export const peekExplore = (): ExploreTarget | null => pendingExplore;
export function takeExplore(): ExploreTarget | null {
  const t = pendingExplore;
  pendingExplore = null;
  return t;
}
export const onExplore = (f: (target: ExploreTarget) => void) => {
  const h = (e: Event) => f((e as CustomEvent<ExploreTarget>).detail);
  addEventListener(OPEN_EXPLORE, h);
  return () => removeEventListener(OPEN_EXPLORE, h);
};

/** "+ ADD" in EXPLORE: a card can go in when it is yours and not in the deck yet (Commander is singleton; basics are
 *  added in the deck itself). */
export function canAddFromExplore(owned: boolean, inDeck: boolean): boolean {
  return owned && !inDeck;
}

/**
 * NEXT tips (journey step 3): what the deck's own Readiness checks already say is short, turned into "go here next".
 * Read-only: the checks and their numbers come from brain/validate `readiness`; nothing is scored here.
 */
export interface NextTip {
  key: string;
  /** What to do, in a few words. */
  text: string;
  /** Why, quoted from the check (or the card count). */
  why: string;
  /** EXPLORE on a tag, or the Balance sheet. */
  go: { step: 'explore'; tag: string } | { step: 'balance' };
}
/** The tag the graph opens on for a short role (Scryfall Tagger labels). */
const ROLE_TAG: Record<string, string> = { ramp: 'ramp', draw: 'draw', removal: 'removal', wipes: 'sweeper' };
const ROLE_WORD: Record<string, string> = { ramp: 'ramp', draw: 'card draw', removal: 'removal', wipes: 'board wipes' };

export function nextTips(
  checks: readonly { key: string; kind: string; ok: boolean; says: string }[],
  totalCards: number,
  max = 2,
): NextTip[] {
  const out: NextTip[] = [];
  // the order a deck usually needs them: answers and fuel before size
  for (const key of ['removal', 'ramp', 'draw', 'wipes']) {
    const c = checks.find((x) => x.key === key && x.kind === 'build');
    if (c && !c.ok) out.push({ key, text: `Find more ${ROLE_WORD[key]} of yours`, why: c.says, go: { step: 'explore', tag: ROLE_TAG[key] } });
  }
  if (totalCards < 100) {
    const n = 100 - totalCards;
    out.push({ key: 'size', text: `Fill ${n} slot${n === 1 ? '' : 's'} with Balance to 100`, why: `${totalCards} of 100 cards.`, go: { step: 'balance' } });
  } else if (totalCards > 100) {
    const n = totalCards - 100;
    out.push({ key: 'size', text: `Cut ${n} card${n === 1 ? '' : 's'} in Cut Lab`, why: `${totalCards} of 100 cards.`, go: { step: 'balance' } });
  }
  return out.slice(0, max);
}

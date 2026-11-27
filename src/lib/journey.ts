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

// Hand-off of the colours to the tag graph, the same pattern as the other nav hand-offs (lib/nav.ts).
const OPEN_EXPLORE = 'ch:journeyexplore';
let pendingColours: string[] | null = null;
export function sendColoursToExplore(colours: string[]) {
  pendingColours = colours;
  dispatchEvent(new CustomEvent(OPEN_EXPLORE, { detail: colours }));
}
/** Read without clearing: a component's first render may run twice in development. */
export const peekPendingColours = (): string[] | null => pendingColours;
export function takePendingColours(): string[] | null {
  const c = pendingColours;
  pendingColours = null;
  return c;
}
export const onPendingColours = (f: (colours: string[]) => void) => {
  const h = (e: Event) => f((e as CustomEvent<string[]>).detail);
  addEventListener(OPEN_EXPLORE, h);
  return () => removeEventListener(OPEN_EXPLORE, h);
};

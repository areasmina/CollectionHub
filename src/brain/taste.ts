/**
 * The player's taste, learned without AI: plain counts of what they do (cut, add, pin, Dead to me) across decks.
 * Every adjustment says why ("you cut Swiftfoot Boots in 4 decks"), can be reset, and travels with the sync code
 * (it lives on the profile). Small on purpose: taste nudges a choice, it never outvotes a deck's real needs.
 */
export type TasteAction = 'cut' | 'add' | 'never' | 'always';
export interface TasteEvent {
  card: string; // norm(name)
  action: TasteAction;
  deck: string; // commander or deck name: counts are per distinct deck
  at: number;
}
export const TASTE_KEEP = 600; // newest events kept on the profile
/** Distinct decks before a habit counts. */
export const TASTE_MIN = 3;
/** Size of a nudge, on the brain's score scale (an EDHREC inclusion share is 0–1). Kept below one role's worth. */
export const TASTE_STEP = 0.05;
export const TASTE_CAP = 0.15;

export function addTaste(events: TasteEvent[], e: TasteEvent): TasteEvent[] {
  return [...events, e].slice(-TASTE_KEEP);
}

export interface TasteNudge {
  delta: number;
  why: string;
}

/** What the player's habits say about one card (key = norm(name), name = display name). */
export function tasteFor(events: TasteEvent[], key: string, name = key): TasteNudge | null {
  const decks = (a: TasteAction) => new Set(events.filter((e) => e.card === key && e.action === a).map((e) => e.deck)).size;
  const cut = decks('cut') + decks('never');
  const kept = decks('add') + decks('always');
  const net = kept - cut;
  if (Math.abs(net) < TASTE_MIN) return null;
  const delta = Math.max(-TASTE_CAP, Math.min(TASTE_CAP, Math.sign(net) * TASTE_STEP * Math.floor(Math.abs(net) / TASTE_MIN)));
  return { delta, why: net < 0 ? `you cut ${name} in ${cut} decks` : `you add ${name} in ${kept} decks` };
}

/** Every habit strong enough to count, strongest first (the "your taste" panel, with a reset button). */
export function tasteSummary(events: TasteEvent[]): { card: string; nudge: TasteNudge }[] {
  const out: { card: string; nudge: TasteNudge }[] = [];
  for (const k of new Set(events.map((e) => e.card))) {
    const n = tasteFor(events, k);
    if (n) out.push({ card: k, nudge: n });
  }
  return out.sort((a, b) => Math.abs(b.nudge.delta) - Math.abs(a.nudge.delta) || a.card.localeCompare(b.card));
}

/** A pin changed for one card on one commander: its old always / never events for that commander go away, and one new
 *  event is kept only if the card is still pinned. So a pin you undo teaches nothing, and nothing is counted twice. */
export function pinTaste(events: TasteEvent[], card: string, deck: string, now: 'in' | 'out' | undefined, at: number): TasteEvent[] {
  const rest = events.filter((e) => !(e.card === card && e.deck === deck && (e.action === 'always' || e.action === 'never')));
  return now ? addTaste(rest, { card, action: now === 'in' ? 'always' : 'never', deck, at }) : rest;
}

/**
 * Swipe-down-to-close for bottom sheets (Guillermo, Nov 28: "add swipe-down-to-close to our existing sheet", no new
 * library). A drag that goes far enough down, or flicks down fast enough, closes the sheet; anything else springs back.
 */

/** How far (px) a drag must travel down before letting go closes the sheet. */
export const SWIPE_CLOSE_PX = 80;
/** A quick flick closes it sooner: this many px per ms, over at least FLICK_MIN_PX. */
export const SWIPE_FLICK_SPEED = 0.6;
export const FLICK_MIN_PX = 24;

/** Should a drag of `dy` px down (negative = up) that took `ms` milliseconds close the sheet? */
export function swipeCloses(dy: number, ms: number): boolean {
  if (!(dy > 0)) return false;
  if (dy >= SWIPE_CLOSE_PX) return true;
  return dy >= FLICK_MIN_PX && ms > 0 && dy / ms >= SWIPE_FLICK_SPEED;
}

/** Where the sheet sits while being dragged: it follows the finger down, and barely moves when pulled up. */
export function swipeOffset(dy: number): number {
  return dy > 0 ? dy : dy / 6;
}

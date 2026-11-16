/** Where the floating island sits. */
export type IslandDock = 'top' | 'bottom' | 'left' | 'right';

/** Near the start of the page (px scrolled) or the end of it (px left to scroll). */
export const ISLAND_START = 80;
export const ISLAND_END = 40;

/**
 * True where the island always shows, whichever way you are scrolling: the place where the page leaves room on the
 * island's own edge. A top or side dock rests at the start of the page, a bottom dock at the end of it
 * (and at the very top, before any scrolling). Everywhere else
 * the island follows the scroll direction (away going down, back going up).
 */
export function islandRests(dock: IslandDock, scrollY: number, viewH: number, pageH: number): boolean {
  // a bottom dock also shows at the very top, so a freshly opened page always has its nav; one small scroll frees the fold
  if (dock === 'bottom') return scrollY <= 0 || scrollY + viewH >= pageH - ISLAND_END;
  return scrollY < ISLAND_START;
}

/** How much of a move up asks for the island back (px). The island's own arrival and departure move the sticky bars
 *  under it, which nudges the view by about a bar's height; a smaller step than this would read that nudge as the
 *  reader scrolling up, and the island would flicker on and off at the end of a page. */
export const ISLAND_BACK = 64;

/** What the island remembers between scroll events. */
export type IslandScroll = { away: boolean; lastY: number; up: number };

/**
 * The island after one scroll event. Where the page leaves room on the island's own edge it always shows. Otherwise it
 * follows the reader: away the moment the page goes down, back once it has been pulled up by ISLAND_BACK in a row.
 * Any downward move starts that count again, so a layout nudge up followed by its own nudge back down changes nothing.
 */
export function islandScroll(dock: IslandDock, s: IslandScroll, y: number, viewH: number, pageH: number): IslandScroll {
  const dy = y - s.lastY;
  if (islandRests(dock, y, viewH, pageH)) return { away: false, lastY: y, up: 0 };
  if (dy > 6) return { away: true, lastY: y, up: 0 };
  if (dy < 0) {
    const up = s.up - dy;
    return up >= ISLAND_BACK ? { away: false, lastY: y, up: 0 } : { ...s, lastY: y, up };
  }
  return { ...s, lastY: y };
}

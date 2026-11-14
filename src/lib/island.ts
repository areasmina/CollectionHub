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

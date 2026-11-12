/** Pop-ups that open under a button (the ⋮ menus, bracket / salt / readiness notes) are anchored to that button, so on a
 *  narrow phone one opened near the right or left edge ran off the screen. This keeps every one of them inside the
 *  screen: after it opens it is slid sideways by exactly as much as it sticks out. One listener covers them all. */
export const GUTTER = 8;
/** The popovers that hang off a <details> button. */
export const POPOVERS = '.popnote, .vpop, .fbody';

/** How far to slide a box (spanning left..right) to sit inside 0..vw with a gutter on each side. 0 when it already fits;
 *  a box wider than the screen is lined up with the left gutter (CSS caps the widths so that should not happen). */
export function clampShift(left: number, right: number, vw: number, gutter = GUTTER): number {
  if (right - left > vw - 2 * gutter) return gutter - left;
  if (left < gutter) return gutter - left;
  if (right > vw - gutter) return vw - gutter - right;
  return 0;
}

/** Slides one open popover back on screen (undoing any earlier slide first so it is measured where it belongs). */
export function keepOnScreen(el: HTMLElement) {
  el.style.removeProperty('translate');
  const r = el.getBoundingClientRect();
  if (r.width === 0) return;
  const dx = clampShift(r.left, r.right, document.documentElement.clientWidth);
  if (dx) el.style.setProperty('translate', `${Math.round(dx)}px 0`);
}

let started = false;
export function startKeepOnScreen() {
  if (started || typeof document === 'undefined') return;
  started = true;
  const fit = (d: Element) => d.querySelectorAll<HTMLElement>(`:scope > ${POPOVERS.split(', ').join(', :scope > ')}`).forEach(keepOnScreen);
  // `toggle` does not bubble, but it can be heard on the way down.
  document.addEventListener('toggle', (e) => e.target instanceof HTMLDetailsElement && e.target.open && requestAnimationFrame(() => fit(e.target as HTMLElement)), true);
  addEventListener('resize', () => document.querySelectorAll('details[open]').forEach(fit));
}

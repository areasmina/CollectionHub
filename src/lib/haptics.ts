/**
 * Haptic feedback for key moments. Android (Chrome) uses the Vibration API with distinct patterns; iOS 18+ Safari
 * has no Vibration API, so a hidden native switch is toggled instead, which gives one light system tick.
 * Off when the user turns it off in the menu (stored per device) or prefers reduced motion.
 */
export type Feel = 'tick' | 'tap' | 'select' | 'open' | 'success' | 'warn' | 'undo';

const PATTERNS: Record<Feel, number | number[]> = {
  tick: 6, // passing a snap point while scrolling
  tap: 10, // small toggles, steppers
  select: 14, // choosing something (a filter, a view, a tab)
  open: [0, 18], // a long-press menu or preview opening
  success: [12, 40, 18], // something saved / set (commander set, swap made)
  warn: [30, 50, 30], // destructive (removed from deck / binder)
  undo: [8, 30, 8],
};
const KEY = 'ch:haptics';

/** Whether this browser can do haptics at all (Chrome / Samsung Internet / Edge on Android; iOS 18+ Safari).
 *  Firefox removed its Vibration API (v129), so it is false there. */
export const hapticsSupported = () =>
  typeof navigator !== 'undefined' && (typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === 'function' || /iP(hone|ad|od)/.test(navigator.userAgent));

export function hapticsOn() {
  try {
    if (localStorage.getItem(KEY) === 'off') return false;
  } catch {
    /* storage blocked: default on */
  }
  return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
}
export function setHaptics(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* per-device convenience only */
  }
  if (on) haptic('success');
}

let iosSwitch: HTMLLabelElement | null = null;
function iosTick() {
  if (!iosSwitch) {
    const label = document.createElement('label');
    label.setAttribute('aria-hidden', 'true');
    label.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none;left:-9px;top:-9px';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    document.body.appendChild(label);
    iosSwitch = label;
  }
  iosSwitch.click();
}

let last = 0;
export function haptic(feel: Feel = 'tap') {
  if (!hapticsOn()) return;
  const now = Date.now();
  if (feel === 'tick' && now - last < 40) return; // don't buzz continuously while flicking
  last = now;
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { vibrate?: Navigator['vibrate'] });
  if (nav?.vibrate) nav.vibrate(PATTERNS[feel]);
  else if (nav && /iP(hone|ad|od)/.test(nav.userAgent)) iosTick();
}

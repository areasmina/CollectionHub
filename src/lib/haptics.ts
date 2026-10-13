/**
 * Haptic feedback for key moments. Android (Chrome) uses the Vibration API with distinct patterns; iOS 18+ Safari
 * has no Vibration API, so a hidden native switch is toggled instead, which gives one light system tick.
 * Off when the user turns it off in the menu (stored per device) or prefers reduced motion.
 */
export type Feel = 'tick' | 'tap' | 'select' | 'open' | 'success' | 'warn' | 'undo';

// Lengths in ms. Many Android motors can't render anything under ~15-20 ms, so even the lightest buzz is at least that.
const PATTERNS: Record<Feel, number | number[]> = {
  tick: 15, // passing a snap point while scrolling
  tap: 25, // small toggles, steppers
  select: 30, // choosing something (a filter, a view, a tab)
  open: [0, 40], // a long-press menu or preview opening
  success: [30, 50, 40], // something saved / set (commander set, swap made)
  warn: [60, 60, 60], // destructive (removed from deck / binder)
  undo: [25, 40, 25],
};
const KEY = 'ch:haptics';

/** Whether this browser can do haptics at all (Chrome / Samsung Internet / Edge on Android; iOS 18+ Safari).
 *  Firefox removed its Vibration API (v129), so it is false there. */
export const hapticsSupported = () =>
  typeof navigator !== 'undefined' && (typeof (navigator as Navigator & { vibrate?: unknown }).vibrate === 'function' || /iP(hone|ad|od)/.test(navigator.userAgent));

const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const stored = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked: default
  }
};
/** Haptics are on unless the person turned them off. Until they choose, reduced motion (Android's "Remove animations",
 *  battery saver) keeps them off by default; once they switch them on themselves, that choice wins. */
export function hapticsOn() {
  const v = stored();
  if (v === 'off') return false;
  if (v === 'on') return true;
  return !reducedMotion();
}
/** What happened to a test buzz: 'sent' (the browser handed it to the phone), 'blocked' (the browser refused it), or
 *  'unsupported' (no Vibration API here). Whether the motor then runs is up to the phone's own vibration settings. */
export type HapticResult = 'sent' | 'blocked' | 'unsupported';
export function setHaptics(on: boolean): HapticResult | 'off' {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off');
  } catch {
    /* per-device convenience only */
  }
  if (!on) return 'off';
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { vibrate?: Navigator['vibrate'] });
  if (!nav?.vibrate) {
    haptic('success'); // iOS: the switch tick
    return 'unsupported';
  }
  return nav.vibrate(PATTERNS.success) ? 'sent' : 'blocked';
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

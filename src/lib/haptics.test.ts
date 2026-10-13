import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('navigator', { vibrate: vi.fn(() => true), userAgent: 'Android' });
});
afterEach(() => vi.unstubAllGlobals());

describe('haptic', () => {
  it('vibrates with the pattern for each moment', async () => {
    const { haptic } = await import('./haptics');
    haptic('warn');
    expect(navigator.vibrate).toHaveBeenCalledWith([60, 60, 60]);
  });
  it('every pattern is long enough for a phone motor to render', async () => {
    const { haptic } = await import('./haptics');
    for (const f of ['tap', 'select', 'open', 'success', 'warn', 'undo'] as const) {
      (navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
      haptic(f);
      const p = (navigator.vibrate as ReturnType<typeof vi.fn>).mock.calls[0][0] as number | number[];
      expect(Math.max(...[p].flat())).toBeGreaterThanOrEqual(15);
    }
  });
  it('stays quiet when turned off', async () => {
    const { haptic, setHaptics } = await import('./haptics');
    expect(setHaptics(false)).toBe('off');
    haptic('select');
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
  it('reduced motion switches it off by default, but turning it on yourself wins', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const { haptic, hapticsOn, setHaptics } = await import('./haptics');
    expect(hapticsOn()).toBe(false);
    haptic('select');
    expect(navigator.vibrate).not.toHaveBeenCalled();
    expect(setHaptics(true)).toBe('sent');
    expect(hapticsOn()).toBe(true);
    (navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
    haptic('select');
    expect(navigator.vibrate).toHaveBeenCalled();
  });
  it('tells you when the browser blocked the test buzz', async () => {
    (navigator.vibrate as ReturnType<typeof vi.fn>).mockReturnValue(false);
    const { setHaptics } = await import('./haptics');
    expect(setHaptics(true)).toBe('blocked');
  });
});

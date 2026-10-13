import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, string>();
beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('navigator', { vibrate: vi.fn(), userAgent: 'Android' });
});
afterEach(() => vi.unstubAllGlobals());

describe('haptic', () => {
  it('vibrates with the pattern for each moment', async () => {
    const { haptic } = await import('./haptics');
    haptic('warn');
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 50, 30]);
  });
  it('stays quiet when turned off or with reduced motion', async () => {
    const { haptic, setHaptics } = await import('./haptics');
    setHaptics(false);
    haptic('select');
    expect(navigator.vibrate).not.toHaveBeenCalled();
    setHaptics(true);
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    (navigator.vibrate as ReturnType<typeof vi.fn>).mockClear();
    haptic('select');
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });
});

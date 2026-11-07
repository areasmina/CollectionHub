import { useEffect, useState } from 'react';

// Persist a {x,y} (or {width,height}) value to localStorage under a stable key.
// Returns [value, setValue] just like useState. The initial value is read from
// storage if available, otherwise `fallback()` runs.
export function usePersistentRect<T extends object>(key: string, fallback: () => T): [T, (next: T) => void] {
  const [value, setValueState] = useState<T>(() => {
    if (typeof window === 'undefined') return fallback();
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback();
      return { ...fallback(), ...JSON.parse(raw) } as T;
    } catch {
      return fallback();
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* swallow quota errors */
    }
  }, [key, value]);

  return [value, setValueState];
}

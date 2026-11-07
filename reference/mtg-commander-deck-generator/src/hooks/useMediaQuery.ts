import { useEffect, useState } from 'react';

// Subscribes to a CSS media query (e.g. `(min-width: 768px)`) and returns
// the current match state. Use to conditionally render — not just hide —
// components based on viewport size. SSR-safe: returns `false` until mounted.
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    setMatches(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [query]);

  return matches;
}

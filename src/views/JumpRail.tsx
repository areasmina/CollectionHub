import { useEffect, useRef, useState } from 'react';
import { haptic } from '../lib/haptics';

/** Short rail label for a section header: the card types get fixed three-letter tags, mana values their number,
 *  anything else (EDHREC's 'High Synergy Cards', 'In Binder 2') the initials of its words, or its first three letters. */
export function jumpLabel(header: string): string {
  const fixed: Record<string, string> = {
    Commander: 'CMD',
    Creatures: 'CRE',
    Planeswalkers: 'PW',
    Battles: 'BTL',
    Instants: 'INS',
    Sorceries: 'SOR',
    Artifacts: 'ART',
    Enchantments: 'ENC',
    Lands: 'LND',
    Other: 'OTH',
    Owned: 'OWN',
    Missing: 'BUY',
    'All cards': 'ALL',
  };
  if (fixed[header]) return fixed[header];
  const mv = /^Mana value (\d+\+?)$/.exec(header);
  if (mv) return mv[1];
  const words = header
    .replace(/\bcards?\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length > 1)
    return words
      .slice(0, 3)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  return (words[0] ?? header).slice(0, 3).toUpperCase();
}

/** The id a section's <details> carries so the rail can find it. */
export const jumpId = (header: string) =>
  `jump-${header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** ManaBox-style jump rail: a slim column of section tags beside a long card list. Tap one to land on that section
 *  (it opens if folded). The tag of the section at the top of the screen is lit. Flat and quiet: it is content
 *  furniture, not frame, so no tape or tilt. Only shown when the list has three sections or more. */
export function JumpRail({ headers }: { headers: string[] }) {
  const [now, setNow] = useState<string | null>(null);
  const [inView, setInView] = useState(true);
  const quietUntil = useRef(0);
  const ref = useRef<HTMLElement>(null);
  const key = headers.join('|');

  useEffect(() => {
    if (headers.length < 3 || typeof IntersectionObserver !== 'function')
      return;
    const els = headers
      .map((h) => document.getElementById(jumpId(h)))
      .filter((e): e is HTMLElement => !!e);
    const seen = new Map<string, boolean>();
    // A section counts as 'here' while it crosses the band just under the sticky tool bar.
    const io = new IntersectionObserver(
      (es) => {
        for (const e of es) seen.set(e.target.id, e.isIntersecting);
        if (Date.now() < quietUntil.current) return; // a tap just chose the section: don't let the scroll overrule it
        const first = headers.find((h) => seen.get(jumpId(h)));
        if (first) setNow(first);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    // On phones the rail is pinned to the screen edge, so it only shows while its list is on screen (the swipe
    // cube can slide the list away sideways).
    const list = ref.current?.closest('.lists');
    const lio = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)));
    if (list) lio.observe(list);
    return () => (io.disconnect(), lio.disconnect());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (headers.length < 3) return null;

  const go = (h: string) => {
    const el = document.getElementById(jumpId(h)) as HTMLDetailsElement | null;
    if (!el) return;
    haptic('select');
    el.open = true;
    // Land just under the sticky tool bar of this list, not behind it.
    const bar = ref.current
      ?.closest('.lists')
      ?.querySelector<HTMLElement>(':scope > .tbar');
    const top = bar
      ? (parseFloat(getComputedStyle(bar).top) || 0) + bar.offsetHeight
      : 0;
    el.style.scrollMarginTop = `${top + 8}px`;
    const calm =
      typeof matchMedia === 'function' &&
      matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ block: 'start', behavior: calm ? 'auto' : 'smooth' });
    quietUntil.current = Date.now() + 1500;
    setNow(h);
  };

  return (
    <div className={`jrail-wrap${inView ? ' on' : ''}`}>
      <nav className='jrail' aria-label='Jump to section' ref={ref}>
        {headers.map((h) => (
          <button
            key={h}
            type='button'
            title={h}
            aria-label={`Jump to ${h}`}
            aria-current={now === h ? 'true' : undefined}
            onClick={() => go(h)}
          >
            {jumpLabel(h)}
          </button>
        ))}
      </nav>
    </div>
  );
}

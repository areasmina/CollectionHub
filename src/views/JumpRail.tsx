import { useEffect, useRef, useState, type ReactNode } from 'react';
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

/**
 * The icon a known section wears on the rail (ManaBox-like, Guillermo, Nov 15): a picture reads faster than CRE / INS /
 * SOR and takes a third of the width, which is width the cards get back. A section we have no icon for (EDHREC's
 * 'High Synergy Cards', a mana value, another binder) keeps its short letters.
 */
export function jumpIcon(header: string): ReactNode {
  const d = ICONS[header];
  if (!d) return null;
  return (
    <svg className='jicon' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
      {d}
    </svg>
  );
}

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const ICONS: Record<string, ReactNode> = {
  // crown: the one card that leads the deck
  Commander: <path {...S} d='M3 18 L2 6 L8 12 L12 4 L16 12 L22 6 L21 18 Z' />,
  // a claw: the creatures
  Creatures: (
    <>
      <path {...S} d='M5 4 C6 9 7 12 9 15' />
      <path {...S} d='M11 3 C11 8 11 12 12 15' />
      <path {...S} d='M17 4 C16 9 15 12 14 15' />
      <path {...S} d='M7 15 C9 21 15 21 16 15' />
    </>
  ),
  // a spark: planeswalkers
  Planeswalkers: <path {...S} d='M12 2 C13 8 16 11 22 12 C16 13 13 16 12 22 C11 16 8 13 2 12 C8 11 11 8 12 2 Z' />,
  // a shield: battles
  Battles: <path {...S} d='M12 2 L20 5 V12 C20 17 16 20 12 22 C8 20 4 17 4 12 V5 Z' />,
  // a bolt: instants, the fast ones
  Instants: <path {...S} d='M13 2 L5 13 H11 L10 22 L19 10 H12 Z' />,
  // a swirl: sorceries
  Sorceries: <path {...S} d='M19 12 A7 7 0 1 1 12 5 A5 5 0 1 0 17 10 A3 3 0 1 1 14 13' />,
  // a gear: artifacts
  Artifacts: (
    <>
      <circle {...S} cx='12' cy='12' r='3.4' />
      <path {...S} d='M12 2.5 V6 M12 18 V21.5 M2.5 12 H6 M18 12 H21.5 M5.2 5.2 L7.7 7.7 M16.3 16.3 L18.8 18.8 M18.8 5.2 L16.3 7.7 M7.7 16.3 L5.2 18.8' />
    </>
  ),
  // two sparkles: enchantments
  Enchantments: (
    <>
      <path {...S} d='M9 2 L10.6 7.4 L16 9 L10.6 10.6 L9 16 L7.4 10.6 L2 9 L7.4 7.4 Z' />
      <path {...S} d='M17.5 14 L18.4 17.1 L21.5 18 L18.4 18.9 L17.5 22 L16.6 18.9 L13.5 18 L16.6 17.1 Z' />
    </>
  ),
  // hills: the lands
  Lands: (
    <>
      <path {...S} d='M2 19 L8 9 L13 19 Z' />
      <path {...S} d='M11 19 L16 11 L22 19 Z' />
    </>
  ),
  // a tick: what you own
  Owned: <path {...S} d='M4 13 L9.5 18.5 L20 6' />,
  // a basket: what is still to buy
  Missing: (
    <>
      <path {...S} d='M3 8 H21 L19 19 H5 Z' />
      <path {...S} d='M8 8 L10 3 M16 8 L14 3' />
    </>
  ),
  Other: (
    <>
      <circle {...S} cx='5.5' cy='12' r='1.4' />
      <circle {...S} cx='12' cy='12' r='1.4' />
      <circle {...S} cx='18.5' cy='12' r='1.4' />
    </>
  ),
};

/** The id a section's <details> carries so the rail can find it. */
export const jumpId = (header: string) =>
  `jump-${header.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

/** ManaBox-style jump rail: a slim column of section tags beside a long card list. Tap one to land on that section
 *  (it opens if folded). The tag of the section at the top of the screen is lit. Flat and quiet: it is content
 *  furniture, not frame, so no tape or tilt. Only shown when the list has three sections or more. */
export function JumpRail({ headers }: { headers: string[] }) {
  const [now, setNow] = useState<string | null>(null);
  const [inView, setInView] = useState(true);
  // Dormant until something moves (Guillermo, Nov 15): the rail fades back once the page is still, so it never sits
  // over the cards for longer than it is useful. Any section crossing the band counts as movement, which works both
  // for the window and for the phone's own swipe-cube scroller.
  const [awake, setAwake] = useState(false);
  const sleep = useRef(0);
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
        setAwake(true);
        clearTimeout(sleep.current);
        sleep.current = window.setTimeout(() => setAwake(false), 1400);
        if (Date.now() < quietUntil.current) return; // a tap just chose the section: don't let the scroll overrule it
        const first = headers.find((h) => seen.get(jumpId(h)));
        if (first) setNow(first);
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    els.forEach((e) => io.observe(e));
    // On phones the rail is pinned to the screen edge, so it only shows while its list is on screen (the swipe
    // cube can slide the list away sideways). It waits until the list reaches the top third of the screen, so it never
    // floats over the deck's header (scores, FORGE) while the list is still further down.
    const list = ref.current?.closest('.lists');
    const lio = new IntersectionObserver((es) => setInView(es.some((e) => e.isIntersecting)), {
      rootMargin: '0px 0px -70% 0px',
    });
    if (list) lio.observe(list);
    return () => (io.disconnect(), lio.disconnect(), clearTimeout(sleep.current));
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
    // The section's cards are still being drawn, and on a slow phone that can move the page out from under the glide
    // and leave the reader nowhere near the section they asked for. Check twice and put it right if it missed.
    const land = () => {
      const r = el.getBoundingClientRect();
      if (r.top < 0 || r.top > innerHeight - 24) el.scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    setTimeout(land, 450);
    setTimeout(land, 1100);
    quietUntil.current = Date.now() + 1500;
    setAwake(true);
    setNow(h);
  };

  return (
    <div className={`jrail-wrap${inView ? ' on' : ''}${awake ? ' awake' : ''}`}>
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
            {jumpIcon(h) ?? <span aria-hidden="true">{jumpLabel(h)}</span>}
            <span className="sr">{jumpLabel(h)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

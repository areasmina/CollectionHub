import { haptic, hapticsOn, hapticsSupported, setHaptics } from './lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CardSpin } from './views/CardSpin';
import { ownedMap } from './lib/compare';
import { db } from './lib/db';
import { Discover } from './views/Discover';
import { authReturn } from './lib/authreturn';
import { canLeave, getBack, onBackChange, onOpenCollection, onOpenDeck, onOpenDeckList } from './lib/nav';
import { codeFromHash } from './lib/synccode';
import { useSyncState, type SyncStatus } from './lib/syncstate';
import { PreviewLayer } from './views/shared';
import { ZineDefs, Logo } from './views/zine';

// Pages other than Discover, and the sync panel, load on first use so the first open is quick.
const Collection = lazy(() => import('./views/Collection').then((m) => ({ default: m.Collection })));
const Decks = lazy(() => import('./views/Decks').then((m) => ({ default: m.Decks })));
const SyncPanel = lazy(() => import('./views/SyncPanel').then((m) => ({ default: m.SyncPanel })));
// Warm the rest once the page is idle (keeps the session fresh and makes tab switches instant).
const SYNC_LABEL: Record<SyncStatus, string> = { off: 'sync off', syncing: 'syncing…', synced: 'up to date', conflict: 'needs you: changed on both sides', offline: 'offline, will sync later', error: 'last sync failed' };
// What the haptics button says after a tap: the browser handed the buzz to the phone (then the phone's own settings decide).
const HAPTIC_NOTE = {
  off: 'Haptics off.',
  sent: 'Buzz sent. Felt nothing? Your phone has vibration off for apps: Android Settings → Sound & vibration → Vibration & haptics, turn on "Touch feedback" / "Touch interactions", and check silent or battery-saver mode.',
  blocked: 'Chrome blocked the buzz. Tap anywhere on the page first, and check Chrome → Settings → Site settings, and the phone is not in silent or battery-saver mode.',
  unsupported: 'This browser has no vibration (Firefox on Android removed it). Chrome, Samsung Internet or Edge do.',
} as const;
const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2500));
idle(() => {
  import('./views/Collection');
  import('./views/Decks');
  import('./lib/autosync').then((m) => m.startAutoSync());
});

type Tab = 'discover' | 'collection' | 'decks';
// Two sections: DISCOVER (commanders you can build) and COLLECTION (your cards, your decks and the Forge).
const NAV: [Tab, string][] = [['discover', 'DISCOVER'], ['collection', 'COLLECTION']];
// Opened with a sync link (…/#sync/<code>): offer to link this device. The code is taken out of the address bar right away.
const incomingCode = typeof location !== 'undefined' ? codeFromHash(location.hash) : '';
if (incomingCode) history.replaceState(null, '', location.pathname + location.search);
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string) => {
    try {
      localStorage.setItem(k, v);
    } catch {
      /* per-device convenience only */
    }
  },
};
const systemDark = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;

export default function App() {
  const [tab, setTab] = useState<Tab>((store.get('ch:tab') as Tab) || 'discover');
  const [profile, setProfile] = useState(Number(store.get('ch:profile')) || 1);
  const theme = 'dark'; // dark only for now (owner's call, Nov 6); light mode comes back later
  const [sync, setSync] = useState(!!authReturn || !!incomingCode);
  const syncSt = useSyncState(); // back from a sign-in redirect: show the result
  const [hubOpen, setHubOpen] = useState(false);
  const [haptOn, setHaptOn] = useState(hapticsOn);
  const [hapNote, setHapNote] = useState('');
  const hubRef = useRef<HTMLDivElement>(null);
  const hubTimer = useRef<number>(undefined);
  const openHub = () => (clearTimeout(hubTimer.current), setHubOpen(true));
  const closeHubSoon = () => (clearTimeout(hubTimer.current), (hubTimer.current = window.setTimeout(() => setHubOpen(false), 450)));
  // A tap outside the drawer closes it.
  useEffect(() => {
    if (!hubOpen) return;
    // (the pill's hub button toggles it itself)
    const off = (e: PointerEvent) => !hubRef.current?.contains(e.target as Node) && !(e.target as Element).closest?.('.pillhub') && setHubOpen(false);
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [hubOpen]);
  // The floating nav slides away while you scroll down and comes back on the way up (or near the top / bottom).
  const [navAway, setNavAway] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const end = y + window.innerHeight >= document.documentElement.scrollHeight - 40;
      if (y < 80 || end) setNavAway(false);
      else if (y > last + 6) setNavAway(true);
      else if (y < last - 6) setNavAway(false);
      if (Math.abs(y - last) > 6) last = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const [backFn, setBackFn] = useState<(() => void) | null>(null);
  useEffect(() => onBackChange(() => setBackFn(() => getBack())), []);
  const [home, setHome] = useState(0); // bumping it remounts Discover: back to the commander list
  const here = (t: Tab) => tab === t || (t === 'collection' && tab === 'decks');
  const goDiscover = () => void canLeave().then((ok) => ok && (setTab('discover'), setHome((h) => h + 1), window.scrollTo(0, 0)));
  const goTab = (t: Tab) => void canLeave().then((ok) => ok && setTab(t));
  const profiles = useLiveQuery(() => db.profiles.toArray(), []) ?? [];
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? [];
  const other = profile === 1 ? 2 : 1;
  // Ownership for Commander: cards Scryfall marks not legal in Commander (tokens, Un-cards, banned) don't count.
  const illegal = useLiveQuery(async () => new Set(await db.cards.filter((c) => !c.legal).primaryKeys()), []) ?? new Set<string>();
  const counts = (p: number) => ownedMap(entries.filter((e) => e.profile === p && !illegal.has(e.cardId)));
  const mine = useMemo(() => counts(profile), [entries, profile, illegal]);
  const theirs = useMemo(() => counts(other), [entries, other, illegal]);
  const nameOf = (id: number) => profiles.find((p) => p.id === id)?.name ?? `Binder ${id}`;
  useEffect(() => void (document.documentElement.dataset.theme = theme), []);
  useEffect(() => store.set('ch:tab', tab), [tab]);
  useEffect(() => onOpenDeck(() => (setTab('decks'), setHubOpen(false), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenDeckList(() => (setTab('decks'), setHubOpen(false), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenCollection(() => (setTab('collection'), setHubOpen(false), window.scrollTo(0, 0))), []);
  useEffect(() => store.set('ch:profile', String(profile)), [profile]);

  const shared = { profile, mine, other: theirs, otherName: nameOf(other), binderName: nameOf(profile) };

  return (
    <div className="stage">
      <ZineDefs />
      {/* The HUB drawer (logo, binder, theme, sync) stays tucked under a red strip until hovered, focused or tapped. */}
      <div className="hubwrap" ref={hubRef} onBlur={(e) => !hubRef.current?.contains(e.relatedTarget as Node) && setHubOpen(false)}>
        <div className="hubstrip" aria-hidden="true" />
        <div className={`hubslide${hubOpen ? ' open' : ''}`}>
          <header id="hub" className="top hubinner" inert={!hubOpen}>
            <button className="logo" onClick={() => (goDiscover(), setHubOpen(false))} aria-label="DeckMage, go to Discover">
              <Logo />
            </button>
            {/* Desktop: the section tabs live in this drawer too (phones keep the bottom bar). */}
            <nav className="tabs hubnav" aria-label="Sections">
              {NAV.map(([t, label]) => (
                <button key={t} aria-current={here(t) ? 'page' : undefined} onClick={() => (haptic('select'), (t === 'discover' ? goDiscover() : goTab(t)), setHubOpen(false))}>
                  {label}
                </button>
              ))}
            </nav>
            <div className="righthead">
              {hapticsSupported() && <button className="iconbtn" aria-label={haptOn ? 'Haptic feedback on (tap to turn off)' : 'Haptic feedback off (tap to turn on)'} aria-pressed={haptOn} title="Haptic feedback" onClick={() => (setHapNote(HAPTIC_NOTE[setHaptics(!haptOn)]), setHaptOn(!haptOn))}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="6" y="2" width="8" height="16" rx="2" />
                  {haptOn ? <path d="M3 6 v8 M1 8 v4 M17 6 v8 M19 8 v4" /> : <path d="M2 2 L18 18" />}
                </svg>
              </button>}
              <button className={`iconbtn syncbtn s-${syncSt.status}`} onClick={() => (haptic('open'), setSync(!sync), setHubOpen(false))} aria-label={`Sync between devices (${SYNC_LABEL[syncSt.status]})`} title={SYNC_LABEL[syncSt.status]} aria-expanded={sync}>
                {/* the familiar two-arrows-in-a-circle sync mark, with its word */}
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16.5 8.5A6.5 6.5 0 0 0 4.6 5.6 M3.5 11.5a6.5 6.5 0 0 0 11.9 2.9" />
                  <path d="M4.2 2.2 L4.6 5.6 L8 5.2 M15.8 17.8 L15.4 14.4 L12 14.8" />
                </svg>
                <span className="synclbl">SYNC</span>
              </button>
            </div>
            {hapNote && (
              <p className="hapnote" role="status">
                {hapNote}
              </p>
            )}
          </header>
        </div>
      </div>
      {/* The pill menu, phones and desktop alike: back (when there's somewhere to go back to), the two sections, and the hub
          (binder, theme, sync). */}
      <nav className={`pillnav${navAway && !hubOpen ? ' away' : ''}`} aria-label="Sections" onFocus={() => setNavAway(false)}>
        <div className="pill">
          {backFn && (
            <button className="pback" aria-label="Back" title="Back" onClick={() => (haptic('tap'), backFn())}>
              <svg width="20" height="20" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M11 2 L4 8 L11 14" fill="none" stroke="currentColor" strokeWidth="3" />
              </svg>
            </button>
          )}
          {NAV.map(([t, label]) => (
            <button key={t} aria-current={here(t) ? 'page' : undefined} onClick={() => (haptic('select'), t === 'discover' ? goDiscover() : goTab(t), setHubOpen(false))}>
              {label}
            </button>
          ))}
        </div>
        <button className={`pillhub${syncSt.status === 'conflict' ? ' alert' : ''}`} aria-expanded={hubOpen} aria-controls="hub" aria-label={hubOpen ? 'Hide the hub menu' : 'Show the hub menu: sync, haptics'} onClick={() => (haptic('tap'), setHubOpen(!hubOpen))}>
          {hubOpen ? '×' : '≡'}
        </button>
      </nav>
      {sync && (
        <Suspense fallback={null}>
          <SyncPanel onClose={() => setSync(false)} incoming={incomingCode} />
        </Suspense>
      )}
      <PreviewLayer />
      {tab === 'discover' && <Discover key={home} {...shared} />}
      <Suspense fallback={<CardSpin page />}>
        {tab === 'collection' && <Collection profile={profile} name={nameOf(profile)} s={shared} onSwitch={() => (haptic('select'), setProfile(other))} />}
        {tab === 'decks' && <Decks {...shared} />}
      </Suspense>
      <footer className="credits">
        card data and images from <a href="https://scryfall.com">Scryfall</a> · deck data from <a href="https://edhrec.com">EDHREC</a> · not affiliated with Wizards of
        the Coast, Scryfall or EDHREC · ≈CA$ estimates
      </footer>
    </div>
  );
}

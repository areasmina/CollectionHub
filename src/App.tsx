import { haptic, hapticsOn, hapticsSupported, setHaptics } from './lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ownedMap } from './lib/compare';
import { db } from './lib/db';
import { Discover } from './views/Discover';
import { authReturn } from './lib/authreturn';
import { canLeave, onOpenCollection, onOpenDeck, onOpenDeckList } from './lib/nav';
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
  const [theme, setTheme] = useState(store.get('ch:theme') || 'system'); // system until a theme button is pressed
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
    const off = (e: PointerEvent) => !hubRef.current?.contains(e.target as Node) && setHubOpen(false);
    document.addEventListener('pointerdown', off);
    return () => document.removeEventListener('pointerdown', off);
  }, [hubOpen]);
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
  const dark = theme === 'system' ? systemDark() : theme === 'dark';

  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    store.set('ch:theme', theme);
  }, [theme]);
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
      <div className="hubwrap" ref={hubRef} onPointerEnter={(e) => e.pointerType === 'mouse' && openHub()} onPointerLeave={(e) => e.pointerType === 'mouse' && closeHubSoon()} onFocus={(e) => (e.target as HTMLElement).matches(':focus-visible') && openHub()} onBlur={(e) => !hubRef.current?.contains(e.relatedTarget as Node) && setHubOpen(false)}>
        <div className="hubstrip" aria-hidden="true" />
        <div className={`hubslide${hubOpen ? ' open' : ''}`}>
          {/* The shadow sits on a wrapper: a clip-path on the button itself would cut its drop-shadow off. */}
          <span className="hubtabwrap">
            <button className={`hubtab${syncSt.status === 'conflict' ? ' alert' : ''}`} aria-expanded={hubOpen} aria-controls="hub" aria-label={hubOpen ? 'Hide the hub menu' : 'Show the hub menu: binder, theme, sync'} onClick={() => (haptic('tap'), setHubOpen(!hubOpen))}>
              {hubOpen ? '×' : '≡'}
            </button>
          </span>
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
              <select className="binder" aria-label="Binder" value={profile} onChange={(e) => (setProfile(Number(e.target.value)), setHubOpen(false))}>
                {[1, 2].map((id) => (
                  <option key={id} value={id}>
                    {nameOf(id)}
                  </option>
                ))}
              </select>
              <div className="themes" role="group" aria-label="Theme">
                <button aria-label="Dark theme" aria-pressed={dark} onClick={() => (setTheme('dark'), setHubOpen(false))}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M14 13.5A7 7 0 0 1 7.5 3 7 7 0 1 0 17 12.5a7 7 0 0 1-3 1z" fill="currentColor" />
                  </svg>
                </button>
                <button aria-label="Light theme" aria-pressed={!dark} onClick={() => (setTheme('light'), setHubOpen(false))}>
                  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
                    <circle cx="10" cy="10" r="4" fill="currentColor" />
                    <path d="M10 1v3M10 16v3M1 10h3M16 10h3M3.6 3.6l2.1 2.1M14.3 14.3l2.1 2.1M3.6 16.4l2.1-2.1M14.3 5.7l2.1-2.1" stroke="currentColor" strokeWidth="2" />
                  </svg>
                </button>
              </div>
              {hapticsSupported() && <button className="iconbtn" aria-label={haptOn ? 'Haptic feedback on (tap to turn off)' : 'Haptic feedback off (tap to turn on)'} aria-pressed={haptOn} title="Haptic feedback" onClick={() => (setHapNote(HAPTIC_NOTE[setHaptics(!haptOn)]), setHaptOn(!haptOn))}>
                <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <rect x="6" y="2" width="8" height="16" rx="2" />
                  {haptOn ? <path d="M3 6 v8 M1 8 v4 M17 6 v8 M19 8 v4" /> : <path d="M2 2 L18 18" />}
                </svg>
              </button>}
              <button className={`iconbtn syncbtn s-${syncSt.status}`} onClick={() => (setSync(!sync), setHubOpen(false))} aria-label={`Sync between devices (${SYNC_LABEL[syncSt.status]})`} title={SYNC_LABEL[syncSt.status]} aria-expanded={sync}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M5 15 V3 M2 6 L5 3 L8 6 M13 3 V15 M10 12 L13 15 L16 12" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
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
      <nav className="tabs navbar" aria-label="Sections">
        {NAV.map(([t, label]) => (
          <button key={t} aria-current={here(t) ? 'page' : undefined} onClick={() => (haptic('select'), t === 'discover' ? goDiscover() : goTab(t))}>
            {label}
          </button>
        ))}
      </nav>
      {sync && (
        <Suspense fallback={null}>
          <SyncPanel onClose={() => setSync(false)} incoming={incomingCode} />
        </Suspense>
      )}
      <PreviewLayer />
      {tab === 'discover' && <Discover key={home} {...shared} />}
      <Suspense fallback={<p className="count pageload">Loading…</p>}>
        {tab === 'collection' && <Collection profile={profile} name={nameOf(profile)} s={shared} />}
        {tab === 'decks' && <Decks {...shared} />}
      </Suspense>
      <footer className="credits">
        card data and images from <a href="https://scryfall.com">Scryfall</a> · deck data from <a href="https://edhrec.com">EDHREC</a> · not affiliated with Wizards of
        the Coast, Scryfall or EDHREC · ≈CA$ estimates
      </footer>
    </div>
  );
}

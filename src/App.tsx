import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ownedMap } from './lib/compare';
import { db } from './lib/db';
import { Collection } from './views/Collection';
import { Decks } from './views/Decks';
import { Discover } from './views/Discover';
import { SyncPanel } from './views/SyncPanel';
import { authReturn } from './lib/sync';
import { PreviewLayer } from './views/shared';
import { ZineDefs, Logo } from './views/zine';

type Tab = 'discover' | 'collection' | 'decks';
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
  const [sync, setSync] = useState(!!authReturn); // back from a sign-in redirect: show the result
  const [hubOpen, setHubOpen] = useState(false);
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
  const goDiscover = () => (setTab('discover'), setHome((h) => h + 1), window.scrollTo(0, 0));
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
            <button className="hubtab" aria-expanded={hubOpen} aria-controls="hub" aria-label={hubOpen ? 'Hide the hub menu' : 'Show the hub menu: binder, theme, sync'} onClick={() => setHubOpen(!hubOpen)}>
              {hubOpen ? '×' : '≡'}
            </button>
          </span>
          <header id="hub" className="top hubinner" inert={!hubOpen}>
            <button className="logo" onClick={() => (goDiscover(), setHubOpen(false))} aria-label="DeckMage, go to Discover">
              <Logo />
            </button>
            {/* Desktop: the section tabs live in this drawer too (phones keep the bottom bar). */}
            <nav className="tabs hubnav" aria-label="Sections">
              {(['discover', 'collection', 'decks'] as Tab[]).map((t) => (
                <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => ((t === 'discover' ? goDiscover() : setTab(t)), setHubOpen(false))}>
                  {t.toUpperCase()}
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
              <button className="iconbtn" onClick={() => (setSync(!sync), setHubOpen(false))} aria-label="Sync between devices" aria-expanded={sync}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                  <path d="M5 15 V3 M2 6 L5 3 L8 6 M13 3 V15 M10 12 L13 15 L16 12" fill="none" stroke="currentColor" strokeWidth="2" />
                </svg>
              </button>
            </div>
          </header>
        </div>
      </div>
      <nav className="tabs navbar" aria-label="Sections">
        {(['discover', 'collection', 'decks'] as Tab[]).map((t) => (
          <button key={t} aria-current={tab === t ? 'page' : undefined} onClick={() => (t === 'discover' ? goDiscover() : setTab(t))}>
            {t.toUpperCase()}
          </button>
        ))}
      </nav>
      {sync && <SyncPanel onClose={() => setSync(false)} />}
      <PreviewLayer />
      {tab === 'discover' && <Discover key={home} {...shared} />}
      {tab === 'collection' && <Collection profile={profile} name={nameOf(profile)} />}
      {tab === 'decks' && <Decks {...shared} />}
      <footer className="credits">
        card data and images from <a href="https://scryfall.com">Scryfall</a> · deck data from <a href="https://edhrec.com">EDHREC</a> · not affiliated with Wizards of
        the Coast, Scryfall or EDHREC · ≈CA$ estimates
      </footer>
    </div>
  );
}

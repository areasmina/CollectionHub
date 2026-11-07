import { haptic } from './lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { CardSpin } from './views/CardSpin';
import { ownedMap } from './lib/compare';
import { db } from './lib/db';
import { Discover } from './views/Discover';
import { authReturn } from './lib/authreturn';
import { canLeave, getBack, onBackChange, onOpenCollection, onOpenDeck, onOpenDeckList } from './lib/nav';
import { codeFromHash } from './lib/synccode';
import { useSyncState, type SyncStatus } from './lib/syncstate';
import { PreviewLayer } from './views/shared';
import { ZineDefs } from './views/zine';
import { loadBrainData, useBrainData } from './brain/data';

// Pages other than Discover, and the sync panel, load on first use so the first open is quick.
const Collection = lazy(() => import('./views/Collection').then((m) => ({ default: m.Collection })));
const Decks = lazy(() => import('./views/Decks').then((m) => ({ default: m.Decks })));
const SyncPanel = lazy(() => import('./views/SyncPanel').then((m) => ({ default: m.SyncPanel })));
// Warm the rest once the page is idle (keeps the session fresh and makes tab switches instant).
const SYNC_LABEL: Record<SyncStatus, string> = { off: 'sync off', syncing: 'syncing…', synced: 'up to date', conflict: 'needs you: changed on both sides', offline: 'offline, will sync later', error: 'last sync failed' };
const idle = (f: () => void) => ('requestIdleCallback' in window ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 2500));
idle(() => {
  import('./views/Commander');
  import('./views/Collection');
  import('./views/Decks');
  import('./lib/autosync').then((m) => m.startAutoSync());
});

type Tab = 'discover' | 'collection' | 'decks';
// Three core sections: DISCOVER (commanders you can build), DECKS (your saved decks and the Forge), and COLLECTION (your binder).
const NAV: [Tab, string][] = [['discover', 'DISCOVER'], ['decks', 'DECKS'], ['collection', 'COLLECTION']];
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
  useBrainData(); // card roles + combo files: re-render every view once they arrive
  useEffect(() => void loadBrainData(), []);
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
  const [deckHome, setDeckHome] = useState(0); // bumping it remounts Decks: back to the deck list
  const here = (t: Tab) => tab === t;
  const goDiscover = () => void canLeave().then((ok) => ok && (setTab('discover'), setHome((h) => h + 1), window.scrollTo(0, 0)));
  const goDecks = () => void canLeave().then((ok) => ok && (setTab('decks'), setDeckHome((h) => h + 1), window.scrollTo(0, 0)));
  const goTab = (t: Tab) => void canLeave().then((ok) => ok && (setTab(t), window.scrollTo(0, 0)));
  const profiles = useLiveQuery(() => db.profiles.toArray(), []) ?? [];
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? [];
  // Binders: one by default, more when you add them (Collection's binder menu). The "other" binder is the next one,
  // for "in Binder 2" marks; with one binder there is none.
  const ids = profiles.map((p) => p.id).sort((a, b) => a - b);
  const other = ids.find((i) => i !== profile) ?? 0;
  useEffect(() => {
    if (ids.length && !ids.includes(profile)) setProfile(ids[0]); // the binder you were on was deleted
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ownership for Commander: cards Scryfall marks not legal in Commander (tokens, Un-cards, banned) don't count.
  const illegal = useLiveQuery(async () => new Set(await db.cards.filter((c) => !c.legal).primaryKeys()), []) ?? new Set<string>();
  const counts = (p: number) => ownedMap(entries.filter((e) => e.profile === p && !illegal.has(e.cardId)));
  const mine = useMemo(() => counts(profile), [entries, profile, illegal]);
  const theirs = useMemo(() => counts(other), [entries, other, illegal]);
  const nameOf = (id: number) => profiles.find((p) => p.id === id)?.name ?? `Binder ${id}`;
  useEffect(() => void (document.documentElement.dataset.theme = theme), []);
  useEffect(() => store.set('ch:tab', tab), [tab]);
  useEffect(() => onOpenDeck(() => (setTab('decks'), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenDeckList(() => (setTab('decks'), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenCollection(() => (setTab('collection'), window.scrollTo(0, 0))), []);
  useEffect(() => store.set('ch:profile', String(profile)), [profile]);

  const shared = { profile, mine, other: theirs, otherName: nameOf(other), binderName: nameOf(profile) };

  return (
    <div className="stage">
      <ZineDefs />
      {/* One nav (THE OVERHAUL, part 1): a 48px top bar on tablets and desktop (logo · DISCOVER DECKS COLLECTION · ⚙),
          a compact floating pill on phones (back + the three sections). Sync, haptics and binders also sit in Collection's
          binder menu; ⚙ opens sync from anywhere on wide screens. */}
      <nav className={`pillnav${navAway ? ' away' : ''}`} aria-label="Sections" onFocus={() => setNavAway(false)}>
        {/* The back arrow shows only when there's somewhere to go back to */}
        {backFn && (
          <button className="pback" aria-label="Back" title="Back" onClick={() => (haptic('tap'), backFn())}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M11 2 L4 8 L11 14" fill="none" stroke="currentColor" strokeWidth="2.5" />
            </svg>
          </button>
        )}
        <button className="ulogo" aria-label="DeckMage home" title="Discover" onClick={() => (haptic('select'), goDiscover())}>
          <img src="/icon.svg" alt="" width={24} height={24} />
          <span>DECKMAGE</span>
        </button>
        <div className="pill">
          {NAV.map(([t, label]) => (
            <button key={t} aria-current={here(t) ? 'page' : undefined} onClick={() => (haptic('select'), t === 'discover' ? goDiscover() : t === 'decks' ? goDecks() : goTab(t))}>
              {label}
            </button>
          ))}
        </div>
        <button className={`ugear${syncSt.status === 'conflict' ? ' alert' : ''}`} aria-label="Sync and settings" title={`Sync: ${SYNC_LABEL[syncSt.status]}`} onClick={() => (haptic('open'), setSync(true))}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.4 7.4 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7.4 7.4 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.4 7.4 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7.4 7.4 0 0 0 1.7-1l2.4 1 2-3.4zM13 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7z" transform="translate(-1 0)" />
          </svg>
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
        {tab === 'collection' && (
          <Collection
            profile={profile}
            name={nameOf(profile)}
            s={shared}
            binders={profiles.map((p) => ({ id: p.id, name: p.name })).sort((a, b) => a.id - b.id)}
            onPick={(id) => (haptic('select'), setProfile(id))}
            sync={{ label: SYNC_LABEL[syncSt.status], alert: syncSt.status === 'conflict', open: () => (haptic('open'), setSync(true)) }}
          />
        )}
        {tab === 'decks' && <Decks key={deckHome} {...shared} />}
      </Suspense>
      <footer className="credits">
        card data and images from <a href="https://scryfall.com">Scryfall</a> · deck data from <a href="https://edhrec.com">EDHREC</a> · not affiliated with Wizards of
        the Coast, Scryfall or EDHREC · ≈CA$ estimates
      </footer>
    </div>
  );
}

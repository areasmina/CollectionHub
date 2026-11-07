import { haptic } from './lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { CardSpin } from './views/CardSpin';
import { ownedMap } from './lib/compare';
import { db, type Card } from './lib/db';
import { norm } from './lib/names';
import { Discover } from './views/Discover';
import { authReturn } from './lib/authreturn';
import { canLeave, getBack, onBackChange, onOpenCollection, onOpenDeck, onOpenDeckList, openDeck } from './lib/nav';
import { codeFromHash } from './lib/synccode';
import { useSyncState, useSyncCode, syncCode, type SyncStatus } from './lib/syncstate';
import { turnOn, turnOff } from './lib/sync';
import { PreviewLayer } from './views/shared';
import { ZineDefs, Pips } from './views/zine';
import { loadBrainData, useBrainData } from './brain/data';
import { IslandSync } from './views/IslandSync';

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
  type IslandDock = 'top' | 'bottom' | 'left' | 'right';
  // Island Dock: default to 'bottom' on phones/mobile (<= 700px), 'top' on desktop. Allows 4-way edge docking.
  const [dock, setDock] = useState<IslandDock>(() => {
    try {
      const saved = localStorage.getItem('ch:island_dock') as IslandDock | null;
      if (saved === 'top' || saved === 'bottom' || saved === 'left' || saved === 'right') return saved;
      return typeof window !== 'undefined' && window.innerWidth <= 700 ? 'bottom' : 'top';
    } catch {
      return typeof window !== 'undefined' && window.innerWidth <= 700 ? 'bottom' : 'top';
    }
  });

  const [islandOpen, setIslandOpen] = useState(false);
  const [islandTab, setIslandTab] = useState<'decks' | 'sync'>('decks');
  const [pullDist, setPullDist] = useState(0); // rubber-band stretch in pixels
  const [isRepositioning, setIsRepositioning] = useState(false); // dragging across screen
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);

  const dragRef = useRef({
    startY: 0,
    startX: 0,
    startTime: 0,
    active: false,
    tab: 'decks' as Tab,
    didDrag: false,
  });

  const onIslandDown = (targetTab?: Tab) => (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.syncpill, .pback')) return;
    dragRef.current = {
      startY: e.clientY,
      startX: e.clientX,
      startTime: Date.now(),
      active: true,
      tab: targetTab ?? 'decks',
      didDrag: false,
    };
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dy = e.clientY - dragRef.current.startY;
      const dx = e.clientX - dragRef.current.startX;
      const dist = Math.hypot(dx, dy);

      if (dist > 18) {
        dragRef.current.didDrag = true;
      }

      // Dragging > 75px detaches the island so user can reposition it to any of 4 edges!
      if (dist > 75) {
        setIsRepositioning(true);
        setDragX(e.clientX);
        setDragY(e.clientY);
        setPullDist(0);
        return;
      }

      if (isRepositioning) {
        setDragX(e.clientX);
        setDragY(e.clientY);
        return;
      }

      // Otherwise calculate elastic pull towards the screen interior based on current dock
      let stretch = 0;
      if (dock === 'top') stretch = dy;
      else if (dock === 'bottom') stretch = -dy;
      else if (dock === 'left') stretch = dx;
      else if (dock === 'right') stretch = -dx;

      if (stretch > 0) {
        // Non-linear organic viscoelastic damping (Melted cheese / Venom goo stretch)
        const damped = Math.min(80, Math.log1p(stretch * 0.12) * 24 + stretch * 0.22);
        setPullDist(damped);
      } else {
        setPullDist(0);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const wasRepositioning = isRepositioning;
      const didDrag = dragRef.current.didDrag;
      const pulled = pullDist;

      dragRef.current.active = false;
      setPullDist(0);
      setIsRepositioning(false);

      if (wasRepositioning) {
        const distTop = e.clientY;
        const distBottom = window.innerHeight - e.clientY;
        const distLeft = e.clientX;
        const distRight = window.innerWidth - e.clientX;
        const minDist = Math.min(distTop, distBottom, distLeft, distRight);

        let newDock: IslandDock = 'top';
        if (minDist === distBottom) newDock = 'bottom';
        else if (minDist === distLeft) newDock = 'left';
        else if (minDist === distRight) newDock = 'right';

        setDock(newDock);
        try {
          localStorage.setItem('ch:island_dock', newDock);
        } catch {
          /* ignore */
        }
        haptic('select');
        return;
      }

      // If dragged enough to open shelf:
      if (didDrag && pulled > 15) {
        setIslandTab('decks');
        setIslandOpen(true);
        haptic('open');
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dock, isRepositioning, pullDist]);

  const currentCode = useSyncCode();
  const handleSyncClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptic('open');
    setIslandTab('sync');
    setIslandOpen((prev) => !prev || islandTab !== 'sync');
  };
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
  const myDecks = useLiveQuery(() => db.decks.where('profile').equals(profile).toArray(), [profile]) ?? [];
  const cmdrCards =
    useLiveQuery(
      async () =>
        new Map(
          (await db.cards.where('key').anyOf(myDecks.map((d) => norm(d.commander ?? '')).filter(Boolean)).toArray()).map((c) => [c.key, c]),
        ),
      [myDecks],
    ) ?? new Map<string, Card>();
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
      {islandOpen && (
        <div className="island-scrim" onClick={() => setIslandOpen(false)} aria-hidden="true" />
      )}
      <nav
        className={`pillnav notch dock-${dock}${navAway ? ' away' : ''}${islandOpen ? ' open' : ''}${pullDist > 0 ? ' stretching' : ''}${isRepositioning ? ' floating' : ''}`}
        aria-label="Sections"
        onFocus={() => setNavAway(false)}
        onPointerDown={onIslandDown()}
        style={{
          transform: isRepositioning
            ? `translate(-50%, -50%)`
            : pullDist > 0
              ? (dock === 'top'
                  ? `translateX(-50%) translateY(${pullDist * 0.4}px)`
                  : dock === 'bottom'
                    ? `translateX(-50%) translateY(${-pullDist * 0.4}px)`
                    : dock === 'left'
                      ? `translateY(-50%) translateX(${pullDist * 0.4}px)`
                      : `translateY(-50%) translateX(${-pullDist * 0.4}px)`)
              : undefined,
          left: isRepositioning ? `${dragX}px` : undefined,
          top: isRepositioning ? `${dragY}px` : undefined,
        }}
      >
        {/* Viscous gooey melted cheese / symbiote tendrils when pulling away from dock edge */}
        {pullDist > 4 && !isRepositioning && (
          <div className={`cheese-tendrils-wrap dock-${dock}`} aria-hidden="true" style={{ height: `${pullDist * 0.45}px` }}>
            <svg className="cheese-tendrils" viewBox={`0 0 360 ${Math.max(1, Math.round(pullDist * 0.45))}`} preserveAspectRatio="none">
              {dock === 'top' ? (
                <>
                  <path d={`M 20 0 Q 30 ${(pullDist * 0.45) * 0.6} 36 ${pullDist * 0.45} L 44 ${pullDist * 0.45} Q 40 ${(pullDist * 0.45) * 0.6} 56 0 Z`} fill="#000000" />
                  <path d={`M 90 0 Q 105 ${(pullDist * 0.45) * 0.7} 110 ${pullDist * 0.45} L 118 ${pullDist * 0.45} Q 124 ${(pullDist * 0.45) * 0.7} 140 0 Z`} fill="#000000" />
                  <path d={`M 170 0 Q 178 ${(pullDist * 0.45) * 0.85} 180 ${pullDist * 0.45} L 184 ${pullDist * 0.45} Q 186 ${(pullDist * 0.45) * 0.85} 195 0 Z`} fill="#000000" />
                  <path d={`M 230 0 Q 242 ${(pullDist * 0.45) * 0.7} 248 ${pullDist * 0.45} L 256 ${pullDist * 0.45} Q 262 ${(pullDist * 0.45) * 0.7} 275 0 Z`} fill="#000000" />
                  <path d={`M 310 0 Q 320 ${(pullDist * 0.45) * 0.6} 326 ${pullDist * 0.45} L 334 ${pullDist * 0.45} Q 338 ${(pullDist * 0.45) * 0.6} 348 0 Z`} fill="#000000" />
                </>
              ) : (
                <>
                  <path d={`M 20 ${pullDist * 0.45} Q 30 ${(pullDist * 0.45) * 0.4} 36 0 L 44 0 Q 40 ${(pullDist * 0.45) * 0.4} 56 ${pullDist * 0.45} Z`} fill="#000000" />
                  <path d={`M 90 ${pullDist * 0.45} Q 105 ${(pullDist * 0.45) * 0.3} 110 0 L 118 0 Q 124 ${(pullDist * 0.45) * 0.3} 140 ${pullDist * 0.45} Z`} fill="#000000" />
                  <path d={`M 170 ${pullDist * 0.45} Q 178 ${(pullDist * 0.45) * 0.15} 180 0 L 184 0 Q 186 ${(pullDist * 0.45) * 0.15} 195 ${pullDist * 0.45} Z`} fill="#000000" />
                  <path d={`M 230 ${pullDist * 0.45} Q 242 ${(pullDist * 0.45) * 0.3} 248 0 L 256 0 Q 262 ${(pullDist * 0.45) * 0.3} 275 ${pullDist * 0.45} Z`} fill="#000000" />
                  <path d={`M 310 ${pullDist * 0.45} Q 320 ${(pullDist * 0.45) * 0.4} 326 0 L 334 0 Q 338 ${(pullDist * 0.45) * 0.4} 348 ${pullDist * 0.45} Z`} fill="#000000" />
                </>
              )}
            </svg>
          </div>
        )}
        {/* Gooey black membrane background layer with volume preservation */}
        <div
          className="island-membrane"
          aria-hidden="true"
          style={{
            transform: pullDist > 0
              ? `scaleY(${1 + pullDist / 38}) scaleX(${1 / Math.sqrt(1 + pullDist / 38)})`
              : undefined,
            transformOrigin: dock === 'top' ? 'top center' : dock === 'bottom' ? 'bottom center' : dock === 'left' ? 'left center' : 'right center',
          }}
        />

        {/* Crisp text content container (never distorted) */}
        <div className="island-content">
          {backFn && (
            <button className="pback" aria-label="Back" title="Back" onClick={() => (haptic('tap'), backFn())}>
              <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M11 2 L4 8 L11 14" fill="none" stroke="currentColor" strokeWidth="2.5" />
              </svg>
            </button>
          )}
          <div className="pill">
            {NAV.map(([t, label]) => (
              <button
                key={t}
                aria-current={here(t) ? 'page' : undefined}
                onPointerDown={onIslandDown(t)}
                onClick={() => {
                  if (dragRef.current.didDrag) return;
                  haptic('select');
                  if (t === 'discover') goDiscover();
                  else if (t === 'decks') goDecks();
                  else goTab(t);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          {/* Sync indicator + Dynamic Island sync trigger (gear removed, Miku green indicator) */}
          <div className={`syncpill ${currentCode ? 'on' : 'off'}`}>
            <button
              type="button"
              className="sync-main"
              aria-label={`Sync: ${currentCode ? syncSt.status : 'off'}. Tap for Sync Settings`}
              title={currentCode ? `Sync is ON (${syncSt.status}). Tap for Dynamic Island Sync settings` : 'Sync is OFF. Tap to turn on sync in Dynamic Island'}
              onClick={handleSyncClick}
            >
              <span className={`sdot ${currentCode ? syncSt.status : 'off'}`} aria-hidden="true" />
              <span>{currentCode ? (syncSt.status === 'syncing' ? 'SYNCING…' : 'SYNC') : 'SYNC'}</span>
            </button>
          </div>
          {/* Gooey venom pull lip at the inner edge of the notch */}
          <button
            type="button"
            className="island-lip"
            aria-expanded={islandOpen}
            aria-label={islandOpen ? "Close Dynamic Island" : "Drag for Dynamic Island decks"}
            title={islandOpen ? "Close Island" : "Drag or tap for Island decks"}
            onClick={() => (haptic('tap'), setIslandOpen(!islandOpen))}
          >
            <span className="lip-bar" aria-hidden="true" />
          </button>
        </div>

        {islandOpen && (
          <div className="island-drawer" role="dialog" aria-label="Dynamic Island">
            <div className="id-tab-switcher" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={islandTab === 'decks'}
                className={`id-tab-btn ${islandTab === 'decks' ? 'active' : ''}`}
                onClick={() => {
                  haptic('select');
                  setIslandTab('decks');
                }}
              >
                <span>SAVED DECKS</span>
                {myDecks.length > 0 && <span className="id-tab-badge">{myDecks.length}</span>}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={islandTab === 'sync'}
                className={`id-tab-btn ${islandTab === 'sync' ? 'active' : ''}`}
                onClick={() => {
                  haptic('select');
                  setIslandTab('sync');
                }}
              >
                <span className={`id-miku-dot ${currentCode ? syncSt.status : 'off'}`} aria-hidden="true" />
                <span>SYNC SETTINGS</span>
              </button>
            </div>

            {islandTab === 'decks' ? (
              myDecks.length > 0 ? (
                <div className="id-decks" role="group" aria-label="Your saved decks">
                  {myDecks.map((d) => {
                    const cCard = d.commander ? cmdrCards.get(norm(d.commander)) : undefined;
                    const ci = cCard?.ci ?? [];
                    return (
                      <button
                        key={d.id ?? d.name}
                        type="button"
                        className="id-deck-card"
                        onClick={() => {
                          haptic('select');
                          setTab('decks');
                          openDeck(d.name);
                          setIslandOpen(false);
                        }}
                      >
                        <div className="id-dinfo">
                          <b className="id-dname">{d.name}</b>
                          <span className="id-dmeta">{d.commander || 'Commander'} · {d.cards?.length ?? 0} cards</span>
                        </div>
                        {ci.length > 0 && <Pips ci={ci} size={18} />}
                        <span className="id-dtag">OPEN ↗</span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="id-empty">No saved decks yet in {nameOf(profile)}.</p>
              )
            ) : (
              <IslandSync onDone={() => setIslandOpen(false)} />
            )}
          </div>
        )}
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

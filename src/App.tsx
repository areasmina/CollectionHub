import { haptic } from './lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CardSpin } from './views/CardSpin';
import { BrandMark } from './views/BrandMark';
import { ownedMap } from './lib/compare';
import { db, type Card } from './lib/db';
import { norm } from './lib/names';
import { Discover } from './views/Discover';
import {
  canLeave,
  getBack,
  getForgeCube,
  getForgeIsland,
  getIslandActivity,
  onBackChange,
  onDiscoverSub,
  onForgeCubeChange,
  onForgeIslandChange,
  onIslandActivityChange,
  onOpenCollection,
  onOpenDeck,
  onOpenDeckList,
  openDeck,
} from './lib/nav';
import { codeFromHash } from './lib/synccode';
import { useSyncState, useSyncCode, syncCode, type SyncStatus } from './lib/syncstate';
import { turnOn, turnOff } from './lib/sync';
import { PreviewLayer } from './views/shared';
import { JumpBar } from './features/jumpbar/JumpBar';
import { ZineDefs, Pips } from './views/zine';
import { loadBrainData, useBrainData } from './brain/data';
import { IslandSync } from './views/IslandSync';
import { islandScroll, type IslandScroll } from './lib/island';
import { UNASSIGNED_NAME, UNASSIGNED_PROFILE } from './lib/deckedit';
import { savedProfile } from './lib/ownership';
import { startKeepOnScreen } from './lib/onscreen';
import { startAutoSync } from './lib/autosync';
startKeepOnScreen(); // pop-ups under buttons never run off the screen

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
  startAutoSync();
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
  const [profile, setProfile] = useState(() => savedProfile(store.get('ch:profile')));
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

  // Detach and attach glide (Guillermo, Nov 13: "the detaching and attaching animation can be better"). The island
  // used to jump between its edge and the finger. Now it is measured just before it leaves (or lands) and slides from
  // there to its new place on one soft spring, growing or shrinking into its new shape (a FLIP animation).
  const flipFrom = useRef<DOMRect | null>(null);
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
        if (!isRepositioning) flipFrom.current = navRef.current?.getBoundingClientRect() ?? null;
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
        flipFrom.current = navRef.current?.getBoundingClientRect() ?? null;
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
  const [islandCollapsed, setIslandCollapsed] = useState(() => {
    try {
      return localStorage.getItem('ch:island:collapsed') === '1';
    } catch {
      return false;
    }
  });
  const lightPressTimer = useRef<number | null>(null);
  const lightDidLongPress = useRef(false);

  const handleLightDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    lightDidLongPress.current = false;
    lightPressTimer.current = window.setTimeout(() => {
      lightDidLongPress.current = true;
      haptic('tap');
      setIslandCollapsed((c) => {
        const next = !c;
        try {
          localStorage.setItem('ch:island:collapsed', next ? '1' : '0');
        } catch {}
        return next;
      });
    }, 2000);
  };

  const handleLightUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (lightPressTimer.current) {
      clearTimeout(lightPressTimer.current);
      lightPressTimer.current = null;
    }
    if (!lightDidLongPress.current) {
      if (islandCollapsed) {
        setIslandCollapsed(false);
        try {
          localStorage.setItem('ch:island:collapsed', '0');
        } catch {}
      } else {
        haptic('open');
        setIslandOpen((prev) => !prev);
      }
    }
  };

  const [sync, setSync] = useState(!!incomingCode);
  const [jumpSignal, setJumpSignal] = useState(0);
  const syncSt = useSyncState();
  useBrainData(); // card roles + combo files: re-render every view once they arrive
  useEffect(() => void loadBrainData(), []);
  // The floating nav slides away while you scroll down and comes back on the way up (or near the top / bottom).
  // It rests only where the page leaves room on its own edge: the page start for a top or side dock, the page end for a
  // bottom dock. (It used to come back at both ends on every dock, so a top-docked island landed on the content at the
  // end of a page, e.g. on Collection's + DECK and IMPORT.)
  const [navAway, setNavAway] = useState(false);
  useEffect(() => {
    let st: IslandScroll = { away: false, lastY: window.scrollY, up: 0 };
    // While the page moves, the island turns see-through (html.scrolling) so the cards it passes over stay visible.
    const root = document.documentElement;
    let still = 0;
    const onScroll = () => {
      root.classList.add('scrolling');
      clearTimeout(still);
      still = window.setTimeout(() => root.classList.remove('scrolling'), 450);
      st = islandScroll(dock, st, window.scrollY, window.innerHeight, document.documentElement.scrollHeight);
      setNavAway(st.away);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => (window.removeEventListener('scroll', onScroll), clearTimeout(still), root.classList.remove('scrolling'));
  }, [dock]);
  const [backFn, setBackFn] = useState<(() => void) | null>(null);
  useEffect(() => onBackChange(() => setBackFn(() => getBack())), []);
  const [forgeState, setForgeState] = useState(() => getForgeIsland());
  const [forgeCube, setForgeCube] = useState(() => getForgeCube());
  const [islandActivity, setIslandActivityState] = useState(() => getIslandActivity());
  const [syncFlash, setSyncFlash] = useState<'synced' | null>(null);
  const prevSyncRef = useRef<SyncStatus>(syncSt.status);
  const [forgeNavMode, setForgeNavMode] = useState(false);
  const [forgeActionsOpen, setForgeActionsOpen] = useState(true);
  useEffect(() => onForgeIslandChange(() => {
    const next = getForgeIsland();
    setForgeState(next);
    if (!next) {
      setForgeNavMode(false);
      setForgeActionsOpen(true);
    }
  }), []);
  useEffect(() => onForgeCubeChange(() => setForgeCube(getForgeCube())), []);
  useEffect(() => onIslandActivityChange(() => setIslandActivityState(getIslandActivity())), []);
  useEffect(() => {
    const prev = prevSyncRef.current;
    prevSyncRef.current = syncSt.status;
    if (prev === 'syncing' && syncSt.status === 'synced') {
      setSyncFlash('synced');
      const t = window.setTimeout(() => setSyncFlash(null), 2600);
      return () => clearTimeout(t);
    }
  }, [syncSt.status]);
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
    if (ids.length && profile !== UNASSIGNED_PROFILE && !ids.includes(profile)) setProfile(ids[0]); // the binder you were on was deleted
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  // Ownership for Commander: cards Scryfall marks not legal in Commander (tokens, Un-cards, banned) don't count.
  const illegal = useLiveQuery(async () => new Set(await db.cards.filter((c) => !c.legal).primaryKeys()), []) ?? new Set<string>();
  const counts = (p: number) => ownedMap(entries.filter((e) => e.profile === p && !illegal.has(e.cardId)));
  const mine = useMemo(() => counts(profile), [entries, profile, illegal]);
  const theirs = useMemo(() => counts(other), [entries, other, illegal]);
  const nameOf = (id: number) => {
    if (id === UNASSIGNED_PROFILE) return UNASSIGNED_NAME;
    return profiles.find((p) => p.id === id)?.name ?? `Binder ${id}`;
  };
  useEffect(() => void (document.documentElement.dataset.theme = theme), []);
  useEffect(() => store.set('ch:tab', tab), [tab]);
  useEffect(() => onOpenDeck(() => (setTab('decks'), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenDeckList(() => (setTab('decks'), window.scrollTo(0, 0))), []);
  useEffect(() => onOpenCollection(() => (setTab('collection'), window.scrollTo(0, 0))), []);
  useEffect(() => onDiscoverSub(() => (setTab('discover'), window.scrollTo(0, 0))), []);
  useEffect(() => store.set('ch:profile', String(profile)), [profile]);

  // The clear lane (phase 4 step 2): a side-docked island keeps a strip of the page free, as wide as the island itself.
  const navRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    // --island-h lets the page clear a top-docked island by exactly its height (no guessed 116px gaps).
    const put = () => (root.style.setProperty('--island-w', `${nav.offsetWidth}px`), root.style.setProperty('--island-h', `${nav.offsetHeight}px`));
    put();
    const ro = new ResizeObserver(put);
    ro.observe(nav);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const from = flipFrom.current;
    const nav = navRef.current;
    flipFrom.current = null;
    if (!from || !nav || typeof nav.animate !== 'function') return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // measure the new place without the CSS slide in between (the glide below replaces it)
    nav.style.setProperty('transition', 'none', 'important');
    const to = nav.getBoundingClientRect();
    requestAnimationFrame(() => nav.style.removeProperty('transition'));
    if (!to.width || !to.height) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const sx = Math.min(3, Math.max(0.3, from.width / to.width));
    const sy = Math.min(3, Math.max(0.3, from.height / to.height));
    nav.animate(
      [
        { translate: `${dx}px ${dy}px`, scale: `${sx} ${sy}` },
        { translate: '0px 0px', scale: '1 1' },
      ],
      { duration: isRepositioning ? 260 : 520, easing: 'cubic-bezier(0.32, 0.72, 0, 1)' },
    );
  }, [dock, isRepositioning]);

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
        ref={navRef}
        className={`pillnav notch dock-${dock}${navAway && !forgeState ? ' away' : ''}${islandOpen ? ' open' : ''}${pullDist > 0 ? ' stretching' : ''}${isRepositioning ? ' floating' : ''}${islandCollapsed ? ' collapsed' : ''}${forgeState && !forgeNavMode ? ' forging-island' : ''}`}
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
          ...(isRepositioning ? { '--fx': `${dragX}px`, '--fy': `${dragY}px` } : {}),
        } as React.CSSProperties}
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
              ? (dock === 'left' || dock === 'right'
                  ? `scaleX(${1 + pullDist / 38}) scaleY(${1 / Math.sqrt(1 + pullDist / 38)})`
                  : `scaleY(${1 + pullDist / 38}) scaleX(${1 / Math.sqrt(1 + pullDist / 38)})`)
              : undefined,
            transformOrigin: dock === 'top' ? 'top center' : dock === 'bottom' ? 'bottom center' : dock === 'left' ? 'left center' : 'right center',
          }}
        >
          {islandActivity?.done !== undefined && islandActivity.total && islandActivity.total > 0 && !islandCollapsed && (
            <span
              className={`island-progress ${islandActivity.tone ?? 'busy'}`}
              style={{ width: `${Math.min(100, Math.round((islandActivity.done / islandActivity.total) * 100))}%` }}
            />
          )}
        </div>

        {/* Crisp text content container (never distorted) */}
        <div className="island-content">
          {forgeState && !forgeNavMode ? (
            <div className="forge-island-wrap">
              <div className="forgetop" role="toolbar" aria-label={`Forge: ${forgeState.label}`}>
                <button
                  type="button"
                  className="fstamp"
                  onClick={() => (haptic('tap'), setForgeActionsOpen((o) => !o))}
                  title={forgeActionsOpen ? 'Collapse Forge controls' : 'Expand Forge controls'}
                  aria-expanded={forgeActionsOpen}
                >
                  <span className="forge-card-icon" aria-hidden="true">
                    <BrandMark fire size={22} />
                  </span>
                  FORGE
                </button>
                {forgeActionsOpen && (
                  <>
                    {forgeState.sub && (
                      <span className="ftitle">
                        <small>{forgeState.sub}</small>
                      </span>
                    )}
                    {forgeState.undo && (
                      <button className="u-btn ghost fundo" onClick={() => (haptic('undo'), forgeState.undo?.run())} title="Undo (Ctrl+Z)">
                        ↺ UNDO
                      </button>
                    )}
                    {forgeState.onSave && (
                      <button className="u-btn primary forge" onClick={forgeState.onSave} disabled={forgeState.saving}>
                        SAVE
                      </button>
                    )}
                    <button className="u-btn ghost fleave" onClick={() => (haptic('tap'), forgeState.onLeave())} title="Leave the Forge (Esc)">
                      ✕ LEAVE
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="pjump forge-nav-btn"
                  aria-label="Sections menu"
                  title="Switch sections"
                  onClick={() => (haptic('tap'), setForgeNavMode(true))}
                >
                  ☰
                </button>
              </div>
              {forgeCube && (
                <div className="fcube" role="tablist" aria-label="Deck faces: swipe sideways">
                  {(['CARDS', 'ANALYSIS', 'TO BUY'] as const).map((lbl, i) => (
                    <button key={lbl} type="button" role="tab" aria-selected={forgeCube.face === i} onClick={() => forgeCube.onFace(i)}>
                      {lbl}
                      {lbl === 'TO BUY' && forgeCube.buyCount ? <small>{forgeCube.buyCount}</small> : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <>
              {forgeState && (
                <button
                  type="button"
                  className="pback forge-back-pill"
                  aria-label="Back to Forge controls"
                  title="Back to Forge controls"
                  onClick={() => (haptic('tap'), setForgeNavMode(false))}
                >
                  <span className="forge-card-icon" aria-hidden="true">
                    <BrandMark fire size={26} />
                  </span>
                </button>
              )}
              {!forgeState && !backFn && (
                <span className="pbrand" aria-hidden="true">
                  <BrandMark size={24} />
                </span>
              )}
              {!forgeState && backFn && (
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
              <button
                type="button"
                className="pjump"
                aria-label="Quick Jump (Ctrl+K)"
                title="Quick Jump (Ctrl+K / Cmd+K)"
                onClick={(e) => {
                  e.stopPropagation();
                  if (dragRef.current.didDrag) return;
                  haptic('open');
                  setJumpSignal((n) => n + 1);
                }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="6.8" cy="6.8" r="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M10.2 10.2 L14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </>
          )}
          {/* Sync indicator + Dynamic Island live activity: only tapping the light opens sync; holding 2s collapses */}
          {(() => {
            const actTone = islandActivity?.tone ?? (syncFlash === 'synced' ? 'ok' : currentCode && (syncSt.status === 'error' || syncSt.status === 'conflict') ? 'err' : currentCode && syncSt.status === 'syncing' ? 'busy' : '');
            const actPct = islandActivity?.done !== undefined && islandActivity.total && islandActivity.total > 0
              ? ` ${Math.min(100, Math.round((islandActivity.done / islandActivity.total) * 100))}%`
              : '';
            const syncLabel = islandActivity
              ? `${islandActivity.label}${actPct}`
              : syncFlash === 'synced'
                ? 'SYNCED'
                : currentCode
                  ? syncSt.status === 'syncing'
                    ? 'SYNCING…'
                    : syncSt.status === 'conflict' || syncSt.status === 'error'
                      ? 'SYNC ERR'
                      : 'SYNC'
                  : 'SYNC';
            const dotClass = islandActivity
              ? islandActivity.tone === 'ok'
                ? 'synced'
                : islandActivity.tone === 'err'
                  ? 'error'
                  : 'syncing'
              : currentCode
                ? syncSt.status
                : 'off';
            return (
              <div
                className={`syncpill ${currentCode ? 'on' : 'off'}${actTone ? ` act-${actTone}` : ''}`}
                onClick={(e) => {
                  if ((e.target as HTMLElement).classList.contains('sdot')) return;
                  haptic('open');
                  setIslandOpen((prev) => !prev);
                }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  className={`sdot ${dotClass}`}
                  aria-label={`Sync light: ${currentCode ? syncSt.status : 'off'}. Tap light for sync settings, hold 2s to collapse`}
                  title="Tap light for Sync settings, hold 2s to collapse island"
                  onPointerDown={handleLightDown}
                  onPointerUp={handleLightUp}
                  onPointerCancel={() => {
                    if (lightPressTimer.current) {
                      clearTimeout(lightPressTimer.current);
                      lightPressTimer.current = null;
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      haptic('open');
                      setIslandOpen((prev) => !prev);
                    }
                  }}
                />
                <span className="sync-lbl">{syncLabel}</span>
              </div>
            );
          })()}
          {/* Visual dock lip/grip handle (does not open menus) */}
          <div className="island-lip" aria-hidden="true">
            <span className="lip-bar" />
          </div>
        </div>

        {islandOpen && (
          <div className="island-drawer" role="dialog" aria-label="Dynamic Island Sync">
            <IslandSync onDone={() => setIslandOpen(false)} />
          </div>
        )}
      </nav>
      {sync && (
        <Suspense fallback={null}>
          <SyncPanel onClose={() => setSync(false)} incoming={incomingCode} />
        </Suspense>
      )}
      <PreviewLayer />
      <JumpBar profile={profile} mine={mine} onSwitchTab={(t) => setTab(t)} openSignal={jumpSignal} />
      {tab === 'discover' && <Discover key={home} {...shared} />}
      <Suspense fallback={<CardSpin page />}>
        {tab === 'collection' && (
          <Collection
            profile={profile}
            name={nameOf(profile)}
            s={shared}
            binders={[
              ...(!profiles.some((p) => p.id === UNASSIGNED_PROFILE) ? [{ id: UNASSIGNED_PROFILE, name: UNASSIGNED_NAME }] : []),
              ...profiles.map((p) => ({ id: p.id, name: p.name })),
            ].sort((a, b) => a.id - b.id)}
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

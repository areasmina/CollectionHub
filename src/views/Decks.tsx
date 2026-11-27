import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { commanderThemes, themeOf, type Theme } from '../brain/themes';
import { deckRules, rulesLabel } from '../brain/validate';
import { pairIdentity } from '../lib/commander';
import { summarize } from '../lib/compare';
import { shortfalls } from '../lib/copies';
import { db, type Card, type Cheap, type Deck } from '../lib/db';
import { deckColour } from '../lib/deckcolor';
import { formatRecord } from '../lib/deckedit';
import { deckShares } from '../lib/deckshare';
import { bracketOf, deckStats, isLand } from '../lib/deckstats';
import { cachedPages, fetchPage, pagePath, type EdhPage } from '../lib/edhrec';
import { haptic } from '../lib/haptics';
import { norm, slug } from '../lib/names';
import { onOpenDeck, openCollection, openDiscoverSub, setBack, setDecksIslandFilter, setIslandDeckFocus, takeDeck } from '../lib/nav';
import { cad, PRICE_METHOD, toCad } from '../lib/prices';
import { cheapest, gameChangers, warmMemCards, warmMemCheap, withCheapest } from '../lib/scryfall';
import { DeckCompare } from './DeckCompare';
import { Meter } from './parts';
import { DeckLight, SearchIcon, ShortAlert, priced as atFinish, priceSum, type Shared } from './shared';
import { PageDecor, Title } from './zine';
import { DeckFolderBar } from '../features/decks/DeckFolderBar';
import { DeckMenu, type MenuAt } from '../features/decks/DeckMenu';
import { DeckView } from '../features/decks/DeckView';
import { HistoryDrawer } from '../features/decks/HistoryDrawer';
import { DeckTile, ImportDeckPop } from '../features/decks/ImportDeckPop';
import {
  assignDeckFolder,
  filterDecksByFolder,
  folderOfDeck,
  loadDeckFolders,
  saveDeckFolders,
  type DeckFolderStore,
  type FolderFilter,
} from '../features/decks/deckOrg';
import '../features/decks/Decks.css';

const PasteCheck = lazy(() => import('../features/check/PasteCheck').then((m) => ({ default: m.PasteCheck })));

const clampDeg = (v: number, lim: number) => Math.max(-lim, Math.min(lim, v));
const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Interactive CSS 3D extruded 100-card deck pile: responds to mouse, finger drag-tilt, and phone gyroscope. */
function DeckStack3D({ img, totalCards }: { img?: string; totalCards: number }) {
  const stageRef = useRef<HTMLSpanElement>(null);
  const touch0 = useRef<{ x: number; y: number } | null>(null);
  const peekTimer = useRef(0);
  const raf = useRef(0);

  useEffect(() => () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  const setTilt = (rx: number | null, ry: number | null, gx = 35, gy = 25, active = false) => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const pile = stageRef.current?.querySelector<HTMLElement>('.dstack-pile');
      if (!pile) return;
      pile.classList.toggle('interacting', active);
      if (rx === null || ry === null) {
        pile.style.removeProperty('--rx');
        pile.style.removeProperty('--ry');
        pile.style.removeProperty('--gx');
        pile.style.removeProperty('--gy');
      } else {
        pile.style.setProperty('--rx', `${rx.toFixed(2)}deg`);
        pile.style.setProperty('--ry', `${ry.toFixed(2)}deg`);
        pile.style.setProperty('--gx', `${gx.toFixed(1)}%`);
        pile.style.setProperty('--gy', `${gy.toFixed(1)}%`);
      }
    });
  };

  const triggerPeek = () => {
    const tile = stageRef.current?.closest<HTMLElement>('.dtile');
    if (!tile) return;
    tile.setAttribute('data-peek', 'true');
    if (peekTimer.current) clearTimeout(peekTimer.current);
    peekTimer.current = window.setTimeout(() => tile.removeAttribute('data-peek'), 2200);
  };

  return (
    <span
      ref={stageRef}
      className="cart dstack-stage"
      aria-hidden="true"
      onPointerMove={(e) => {
        if (e.pointerType !== 'mouse' || reducedMotion() || !stageRef.current) return;
        const r = stageRef.current.getBoundingClientRect();
        if (!r.width || !r.height) return;
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        setTilt(clampDeg(-ny * 32, 16), clampDeg(nx * 40, 20), (nx + 0.5) * 100, (ny + 0.5) * 100, true);
      }}
      onPointerLeave={() => setTilt(null, null)}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) touch0.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchMove={(e) => {
        if (reducedMotion() || !touch0.current || !e.touches[0]) return;
        const dx = e.touches[0].clientX - touch0.current.x;
        const dy = e.touches[0].clientY - touch0.current.y;
        if (Math.abs(dx) <= 8) return;
        setTilt(
          clampDeg(8 - dy * 0.22, 18),
          clampDeg(-10 + dx * 0.28, 22),
          clampDeg(50 + dx * 0.4, 90),
          clampDeg(35 - dy * 0.3, 80),
          true,
        );
        triggerPeek();
      }}
      onTouchEnd={() => {
        touch0.current = null;
        setTilt(null, null);
      }}
      onTouchCancel={() => {
        touch0.current = null;
        setTilt(null, null);
      }}
    >
      <span className="dstack-pile">
        <span className="dstack-base" />
        <span className="dstack-mid dstack-mid-1" />
        <span className="dstack-mid dstack-mid-2" />
        <span className="dstack-edge dstack-edge-right" />
        <span className="dstack-edge dstack-edge-left" />
        <span className="dstack-edge dstack-edge-bottom" />
        <span className="dstack-top">
          {img ? <img src={img.replace('/small/', '/normal/')} alt="" loading="lazy" /> : <span className="dstack-blank">{totalCards || 100}</span>}
          <span className="dstack-glare" />
        </span>
      </span>
    </span>
  );
}

export function Decks(s: Shared) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const cmdrs =
    useLiveQuery(async () => {
      const list = await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? '')).filter(Boolean)).toArray();
      warmMemCards(list);
      return new Map(list.map((c) => [c.key, c]));
    }, [decks]) ?? new Map<string, Card>();
  // A deck's themes: the commander's rules text first; when that names none, EDHREC's top tags for the commander (from pages already cached here).
  const edhNames = [...new Set(decks.map((d) => d.commander ?? '').filter(Boolean))];
  const edhKey = edhNames.join('|');
  const [edhTop, setEdhTop] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    let live = true;
    const names = edhKey ? edhKey.split('|') : [];
    if (!names.length) return;
    const paths = names.map((n) => pagePath('commander', slug(n)));
    const put = (pages: Map<string, EdhPage>) => {
      if (live) setEdhTop(new Map(names.map((n, i) => [norm(n), (pages.get(paths[i])?.tags ?? []).slice(0, 2).map((t) => t.value)])));
    };
    cachedPages(paths)
      .then(async (hits) => {
        const known = new Map([...hits].map(([k, v]) => [k, v.page] as const));
        put(known);
        // Commanders not seen yet: fetch their EDHREC page once (a day's cache, like Discover).
        for (const p of paths.filter((p) => !known.has(p))) {
          if (!live) return;
          const page = await fetchPage(p).catch(() => undefined);
          if (page) known.set(p, page);
          put(known);
        }
      })
      .catch(() => {});
    return () => void (live = false);
  }, [edhKey]);
  // Only the themes this deck actively has: at least two of its cards support the theme (a lone card is not a theme).
  const themesOf = (d: Deck): Theme[] => {
    const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
    const fromText = lead ? commanderThemes(lead) : [];
    const candidates = fromText.length ? fromText : (edhTop.get(norm(d.commander ?? '')) ?? []).map((v) => themeOf(v));
    if (!candidates.length) return [];
    const cardsInDeck = [lead, ...d.cards.map((c) => priced.get(norm(c.name)))].filter((c): c is Card => !!c);
    return candidates.filter((t) => cardsInDeck.filter((c) => t.test(c)).length >= 2);
  };
  // Deck prices from cards already cached here (a deck opened once has them all).
  const allNames = decks.flatMap((d) => d.cards.map((c) => norm(c.name)));
  const priced =
    useLiveQuery(async () => {
      const [cs, ch] = await Promise.all([db.cards.where('key').anyOf(allNames).toArray(), db.cheap.bulkGet(allNames)]);
      warmMemCards(cs);
      const cheapArr = ch.filter((c): c is Cheap => !!c);
      warmMemCheap(cheapArr);
      const cheap = new Map(cheapArr.map((c) => [c.key, c]));
      // Same printing choice as the deck page (newest fetched wins).
      return new Map(cs.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, withCheapest(c, cheap)!]));
    }, [decks]) ?? new Map<string, Card>();
  // The same bracket call as the deck page: with the Game Changers list (without it a deck can never reach IV here).
  const [gcAll, setGcAll] = useState<Set<string> | null>(null);
  useEffect(() => void gameChangers().then(setGcAll), []);
  const listBracket = (d: { cards: { name: string }[] }) => bracketOf(d.cards.map((c) => ({ name: c.name, card: priced.get(norm(c.name)) })), gcAll).bracket;
  const [open, setOpen] = useState<number | null>(null);
  const [listMenu, setListMenu] = useState<{ id: number; at: MenuAt } | null>(null);
  const menuDeck = listMenu && decks.find((d) => d.id === listMenu.id);
  // Opened from elsewhere (a deck name on another screen): wait for the decks to load, then open it.
  const [navTick, setNavTick] = useState(0);
  useEffect(() => onOpenDeck(() => setNavTick((n) => n + 1)), []);
  useEffect(() => {
    const name = takeDeck((n) => decks.some((d) => d.name === n));
    const d = name && decks.find((x) => x.name === name);
    if (d) (setOpen(d.id!), scrollTo(0, 0));
  }, [decks, navTick]);

  // Deck Arsenal Overview Stats
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  const shares = deckShares(decks, s.mine);
  const shareById = new Map(decks.map((d, i) => [d.id, shares[i]]));
  const readyDecks = shares.filter((x) => x.pct === 100).length;
  const uniqueCardsInDecks = new Set(decks.flatMap((d) => d.cards.map((c) => norm(c.name)))).size;
  const colorCounts: Record<string, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  for (const d of decks) {
    const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
    const ci = lead?.ci ?? [];
    for (const c of ci) {
      if (colorCounts[c] !== undefined) colorCounts[c]++;
    }
  }
  const bracketsWithScores = decks
    .map((d) => listBracket(d))
    .filter((b) => b > 0);
  const avgBracket = bracketsWithScores.length ? Math.round(bracketsWithScores.reduce<number>((a, b) => a + b, 0) / bracketsWithScores.length) : 3;

  // Decks Workbench: Search, Sorting, Status and Tag filtering
  const [dq, setDq] = useState('');
  const [dsort, setDsort] = useState<'updated-desc' | 'name-asc' | 'name-desc' | 'match-desc' | 'power-desc' | 'power-asc' | 'cards-desc'>('updated-desc');
  const [dstatus, setDstatus] = useState<'all' | 'ready' | 'in-progress' | 'active'>('all');
  const [dtag, setDtag] = useState<string>('all');
  const [folderStore, setFolderStore] = useState<DeckFolderStore>(() => loadDeckFolders(s.profile));
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [historyDeck, setHistoryDeck] = useState<Deck | null>(null);
  useEffect(() => {
    setFolderStore(loadDeckFolders(s.profile));
    setFolderFilter('all');
  }, [s.profile]);
  const updateFolderStore = (next: DeckFolderStore) => {
    setFolderStore(next);
    saveDeckFolders(s.profile, next);
  };
  // Phones (Nov 19): the theme and tag badges on a deck tile are plain labels. They were 18px buttons, too small for a
  // thumb, and the TAGS row above the decks already filters by the same names, so a tap on the tile just opens the deck.
  const [phone, setPhone] = useState(() => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 700px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  // DECKS | STATS, the same two faces as Collection's CARDS | ANALYTICS (Guillermo, Nov 19: "make the two sections look
  // cohesive"). The page always opens on the decks, so the stat tiles start out of the way every time, like Collection's.
  // COMPARE (Nov 24) puts two of your decks side by side; it shows from two decks up and saves nothing.
  const [dtabPick, setDtab] = useState<'decks' | 'stats' | 'compare' | 'check'>('decks');
  const dtab = dtabPick === 'compare' && decks.length < 2 ? 'decks' : dtabPick; // a deck deleted down to one: back to DECKS
  // Card size for the deck grid (S = three across on phones; the same S / M / L as the Collection).
  const [dzoom, setDzoomState] = useState<'s' | 'm' | 'l'>(() => {
    try {
      const v = localStorage.getItem('ch:deckzoom');
      if (v === 's' || v === 'm' || v === 'l') return v;
    } catch {}
    return narrow ? 's' : 'm';
  });
  const setDzoom = (v: 's' | 'm' | 'l') => {
    setDzoomState(v);
    try {
      localStorage.setItem('ch:deckzoom', v);
    } catch {}
  };
  const [importing, setImporting] = useState(false);
  const gridRef = useRef<HTMLUListElement>(null);
  const gyroPermAsked = useRef(false);

  useEffect(() => {
    if (reducedMotion() || typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
    let base: { b: number; g: number } | null = null;
    let raf = 0;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      if (!base) base = { b: e.beta, g: e.gamma };
      const rx = clampDeg(-(e.beta - base.b) * 0.35, 14);
      const ry = clampDeg((e.gamma - base.g) * 0.45, 14);
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        gridRef.current?.style.setProperty('--gyro-rx', `${rx.toFixed(2)}deg`);
        gridRef.current?.style.setProperty('--gyro-ry', `${ry.toFixed(2)}deg`);
      });
    };
    window.addEventListener('deviceorientation', onOrient, { passive: true });
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const askGyroOnce = () => {
    if (gyroPermAsked.current || typeof window === 'undefined') return;
    gyroPermAsked.current = true;
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    DOE?.requestPermission?.().catch(() => {});
  };

  const short = shortfalls(decks, s.mine);
  const deck = decks.find((d) => d.id === open);
  const deckThemeNames = (d: Deck) => themesOf(d).map((t) => t.label);
  const allTags = [...new Set(decks.flatMap((d) => [...(d.tags ?? []), ...deckThemeNames(d)]))].filter(Boolean);
  // The list page sits under Collection: the pill's back arrow goes there (the deck page sets its own).
  useEffect(() => {
    if (!deck) setBack(openCollection);
    return () => void setBack(null);
  }, [!!deck]);
  useEffect(() => {
    if (deck || dtab !== 'decks') {
      setDecksIslandFilter(null);
      setIslandDeckFocus(null);
      return;
    }
    const activeCount = (dstatus !== 'all' ? 1 : 0) + (dtag !== 'all' ? 1 : 0) + (folderFilter !== 'all' ? 1 : 0);
    setDecksIslandFilter({
      status: dstatus,
      setStatus: setDstatus,
      tag: dtag,
      setTag: setDtag,
      allTags,
      zoom: dzoom,
      cycleZoom: () => (haptic('select'), setDzoom(dzoom === 's' ? 'm' : dzoom === 'm' ? 'l' : 's')),
      activeCount,
      renderFolders: () => (
        <DeckFolderBar
          decks={decks}
          store={folderStore}
          active={folderFilter}
          onChangeStore={updateFolderStore}
          onSelect={setFolderFilter}
        />
      ),
    });
  }, [deck, dtab, dstatus, dtag, folderFilter, dzoom, allTags.join('|'), decks, folderStore]);
  useEffect(() => () => {
    setDecksIslandFilter(null);
    setIslandDeckFocus(null);
  }, []);
  if (deck) return <DeckView deck={deck} s={s} short={short} onBack={() => setOpen(null)} onOpen={setOpen} />;

  const filteredDecks = filterDecksByFolder(decks, folderStore, folderFilter)
    .filter((d) => {
      if (dq.trim()) {
        const q = dq.toLowerCase().trim();
        const matchName = d.name.toLowerCase().includes(q);
        const matchCmdr = d.commander?.toLowerCase().includes(q);
        const matchTag = [...(d.tags ?? []), ...deckThemeNames(d)].some((t) => t.toLowerCase().includes(q));
        if (!matchName && !matchCmdr && !matchTag) return false;
      }
      if (dstatus === 'ready') {
        if (shareById.get(d.id)?.pct !== 100) return false;
      } else if (dstatus === 'in-progress') {
        if (shareById.get(d.id)?.pct === 100) return false;
      } else if (dstatus === 'active') {
        if (d.inactive) return false;
      }
      if (dtag !== 'all') {
        if (!d.tags?.includes(dtag) && !deckThemeNames(d).includes(dtag)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (dsort === 'name-asc') return a.name.localeCompare(b.name);
      if (dsort === 'name-desc') return b.name.localeCompare(a.name);
      if (dsort === 'match-desc') {
        const pa = shareById.get(a.id)?.pct ?? 0; // the % the tile shows
        const pb = shareById.get(b.id)?.pct ?? 0;
        return pb - pa;
      }
      if (dsort === 'power-desc') {
        const ba = listBracket(a);
        const bb = listBracket(b);
        return bb - ba;
      }
      if (dsort === 'power-asc') {
        const ba = listBracket(a);
        const bb = listBracket(b);
        return ba - bb;
      }
      if (dsort === 'cards-desc') {
        const na = a.cards.reduce((n, c) => n + c.qty, 0);
        const nb = b.cards.reduce((n, c) => n + c.qty, 0);
        return nb - na;
      }
      return (b.updated ?? 0) - (a.updated ?? 0);
    });

  async function createBlankDeck() {
    const raw = prompt('Name your new deck:', 'New Brew')?.trim();
    if (!raw) return;
    haptic('open');
    const id = await db.decks.add({
      profile: s.profile,
      name: raw,
      cards: [{ name: 'Sol Ring', qty: 1 }],
      updated: Date.now(),
    });
    setOpen(id);
    scrollTo(0, 0);
  }


  const dtabrow = (
    <>
      <div className="ctabset" role="tablist" aria-label="My decks view">
        {([['decks', 'DECKS'], ['stats', 'STATS'], ['compare', 'COMPARE'], ['check', 'CHECK LIST']] as const)
          .filter(([v]) => v === 'decks' || v === 'check' || decks.length > (v === 'compare' ? 1 : 0))
          .map(([v, label]) => (
            <button
              key={v}
              type="button"
              role="tab"
              id={`dtab-${v}`}
              aria-selected={dtab === v}
              aria-controls={`dpane-${v}`}
              className={`ctab${dtab === v ? ' on' : ''}`}
              onClick={() => (haptic('select'), setDtab(v))}
            >
              {label}
              {v === 'decks' && <span className="ctab-n">{decks.length}</span>}
            </button>
          ))}
      </div>
      <div className="ctab-acts decksactions">
        <button type="button" className="slip-btn deck" onClick={() => (haptic('open'), openDiscoverSub('guided'))} title="Build step-by-step in Guided Deckbuilder + Tabletop">
          + GUIDED
        </button>
        <button type="button" className="slip-btn deck" onClick={createBlankDeck} title="Start a fresh deck from scratch in The Forge">
          + NEW DECK
        </button>
        <button type="button" className="slip-btn import" onClick={() => (haptic('open'), setImporting(true))} title="Import a deck from a list or a CSV file">
          IMPORT
        </button>
      </div>
    </>
  );

  return (
    <>
      <PageDecor seed={333} rays="24% 20%" sheet={{ side: 'left', top: 320, rot: -4 }} />
      <main className="dpage dlist">
        {/* THE OVERHAUL, my decks: loud title → one ribbon of facts → flat deck tiles → the add form. */}
        {/* The title band carries the page's two faces and its two actions, exactly as Collection's does: tabs on the
            left, + NEW DECK (ink) and IMPORT (red) on the right. A phone has no room beside the ransom letters, so there
            the same row sits on its own lane under the title, again exactly as Collection's does. */}
        <div className="decksbar">
          <Title text="MY DECKS" label="My decks" size={narrow ? 26 : 56} seed={33} after={!narrow ? <span className="titleacts">{dtabrow}</span> : undefined} />
        </div>
        {narrow && <nav className="ctabs dtabs" aria-label="My decks view">{dtabrow}</nav>}
        <ShortAlert items={short} />
        {dtab === 'stats' && decks.length > 0 && (
          <div className="dribbonwrap" id="dpane-stats" role="tabpanel" aria-labelledby="dtab-stats">
            {/* The same tiles as the Collection header (Guillermo, Nov 11): one look, one feel. */}
            <div className="dribbon" role="region" aria-label="Deck collection overview">
              <section className="stats dstats">
                <div className="stat">
                  <span className="spray" aria-hidden="true" />
                  <b>{decks.length}</b> <span>{decks.length === 1 ? 'deck' : 'decks'} in {s.binderName}</span>
                </div>
                <div className="stat">
                  <span className="spray" aria-hidden="true" />
                  <b>{readyDecks}</b> <span>all owned</span>
                </div>
                <div className="stat">
                  <span className="spray" aria-hidden="true" />
                  <b>{uniqueCardsInDecks}</b> <span>unique cards in play</span>
                </div>
                <div className="stat red">
                  <span className="spray" aria-hidden="true" />
                  <b>B{avgBracket}</b> <span>avg power</span>
                </div>
                {(['W', 'U', 'B', 'R', 'G'] as const).some((c) => colorCounts[c]) && (
                  <div className="stat dcols" title="How many decks use each colour">
                    {(['W', 'U', 'B', 'R', 'G'] as const)
                      .filter((c) => colorCounts[c])
                      .map((c) => (
                        <span key={c} className={`ov-pip pip-${c.toLowerCase()}`} title={`${colorCounts[c]} decks include ${c}`}>
                          {c} <b>{colorCounts[c]}</b>
                        </span>
                      ))}
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
        {dtab === 'compare' && decks.length > 1 && <DeckCompare decks={decks} priced={priced} gc={gcAll} shareById={shareById} />}
        {dtab === 'check' && (
          <div id="dpane-check" role="tabpanel" aria-labelledby="dtab-check">
            <Suspense fallback={null}>
              <PasteCheck mine={s.mine} other={s.other} binderName={s.binderName} otherName={s.otherName} />
            </Suspense>
          </div>
        )}
        {dtab === 'decks' && (
        <>
        {/* Decks Workbench Toolbar (ManaBox-style, Nov 14): row 1 is the search and the sort, row 2 one sliding row of
            status and tag chips. Two slim rows that stay pinned while the deck tiles scroll under them. */}
        <div className="decktoolbar" role="search" aria-label="Deck filters and tools">
          <div className="dsearchrow">
            <label className="dsearchbox">
              <SearchIcon />
              <input
                type="search"
                placeholder="search decks_"
                title="Search decks by name, commander, or tag"
                value={dq}
                onChange={(e) => setDq(e.target.value)}
                aria-label="Search decks"
                enterKeyHint="search"
                autoComplete="off"
              />
            </label>
            <label className="dsortpick">
              <span>SORT:</span>
              <select value={dsort} onChange={(e) => setDsort(e.target.value as any)} aria-label="Sort decks">
                <option value="updated-desc">RECENTLY UPDATED</option>
                <option value="name-asc">NAME (A → Z)</option>
                <option value="name-desc">NAME (Z → A)</option>
                <option value="match-desc">MATCH % (HIGH → LOW)</option>
                <option value="power-desc">POWER (HIGH → LOW)</option>
                <option value="power-asc">POWER (LOW → HIGH)</option>
                <option value="cards-desc">CARD COUNT</option>
              </select>
            </label>
          </div>
          <div className="dfilters">
            <div className="dstatuspick" role="group" aria-label="Show decks">
              {(['all', 'ready', 'in-progress', 'active'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  className={`u-chip ${dstatus === st ? 'active' : ''}`}
                  aria-pressed={dstatus === st}
                  onClick={() => setDstatus(st)}
                >
                  {st === 'all' ? 'ALL' : st === 'ready' ? 'ALL OWNED' : st === 'in-progress' ? 'IN PROGRESS' : 'ACTIVE'}
                </button>
              ))}
            </div>
            {/* SIZE joins the filters row (Guillermo, Nov 15): it used to float alone over the decks */}
            {decks.length > 0 && (
              <button
                type="button"
                className="u-btn ghost qzoom-btn dsize"
                title={dzoom === 's' ? 'Size: Small (3 across on phones). Tap for Medium' : dzoom === 'm' ? 'Size: Medium. Tap for Large' : 'Size: Large. Tap for Small'}
                aria-label={`Deck size ${dzoom.toUpperCase()}: tap to cycle size`}
                onClick={() => (haptic('select'), setDzoom(dzoom === 's' ? 'm' : dzoom === 'm' ? 'l' : 's'))}
              >
                SIZE {dzoom.toUpperCase()}
              </button>
            )}
          </div>
          {(dtag !== 'all' || folderFilter !== 'all') && (
            <div className="dactive-chips" role="group" aria-label="Active deck filters">
              {dtag !== 'all' && (
                <button type="button" className="u-chip active" onClick={() => (haptic('select'), setDtag('all'))} title={`Clear #${dtag} filter`}>
                  #{dtag} ×
                </button>
              )}
              {folderFilter !== 'all' && (
                <button type="button" className="u-chip active" onClick={() => (haptic('select'), setFolderFilter('all'))} title="Clear folder filter">
                  Folder: {folderFilter === 'unfiled' ? 'Unfiled' : folderFilter} ×
                </button>
              )}
            </div>
          )}
        </div>
        {menuDeck && listMenu && (
          <DeckMenu
            deck={menuDeck}
            at={listMenu.at}
            onClose={() => setListMenu(null)}
            onOpen={(id) => (setListMenu(null), setOpen(id))}
            onHistory={() => setHistoryDeck(menuDeck)}
            folders={folderStore.folders}
            currentFolder={folderOfDeck(folderStore, menuDeck.id)}
            onFolderChange={(folder) => menuDeck.id && updateFolderStore(assignDeckFolder(folderStore, menuDeck.id, folder))}
          />
        )}
        {historyDeck && historyDeck.id && <HistoryDrawer deck={historyDeck} onClose={() => setHistoryDeck(null)} />}
        <ul
          ref={gridRef}
          className="dgrid cgrid"
          data-zoom={dzoom}
          id="dpane-decks"
          role="tabpanel"
          aria-labelledby="dtab-decks"
          onTouchStart={askGyroOnce}
        >
          {filteredDecks.map((d) => {
            const sum = { ...summarize(d.cards.map((c) => c.name), s.mine, s.other), ...shareById.get(d.id) };
            const totalCards = d.cards.reduce((n, x) => n + x.qty, 0);
            // No commander set: show the deck's most expensive card instead of a blank tile.
            const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
            const autoThemes = themesOf(d);
            const c = lead ?? d.cards.map((x) => priced.get(norm(x.name))).reduce<Card | undefined>((best, x) => (x?.img && Number(x.usd ?? 0) > Number(best?.usd ?? -1) ? x : best), undefined);
            // The same rules the deck page checks (100 cards, banned, colours, singleton), once the card data is in:
            // an imported or hand-edited deck that can't be played yet says so on its tile.
            const partnerCard = d.partner ? priced.get(norm(d.partner)) : undefined;
            const broken = priced.size
              ? rulesLabel(deckRules({ deck: d.cards, cardOf: (n) => priced.get(norm(n)), commander: d.commander, partner: d.partner, identity: lead ? pairIdentity(lead.ci, partnerCard?.ci) : [], skipIdentity: !lead }))
              : undefined;
            return (
              <li
                key={d.id}
                className={`dtile${d.inactive ? ' off' : ''}`}
                style={{ '--dc': deckColour(d), '--deck-cards': totalCards } as React.CSSProperties}
                onMouseEnter={() => {
                  if (!d.id) return;
                  setIslandDeckFocus({
                    id: d.id,
                    name: d.name,
                    color: deckColour(d),
                    active: !d.inactive,
                    tags: [...(d.tags ?? []), ...autoThemes.map((t) => t.label)].slice(0, 3),
                    onToggleActive: () => {
                      const nextInactive = !d.inactive;
                      haptic(nextInactive ? 'tap' : 'success');
                      void db.decks.update(d.id!, { inactive: nextInactive ? true : undefined });
                    },
                  });
                }}
                onFocus={() => {
                  if (!d.id) return;
                  setIslandDeckFocus({
                    id: d.id,
                    name: d.name,
                    color: deckColour(d),
                    active: !d.inactive,
                    tags: [...(d.tags ?? []), ...autoThemes.map((t) => t.label)].slice(0, 3),
                    onToggleActive: () => {
                      const nextInactive = !d.inactive;
                      haptic(nextInactive ? 'tap' : 'success');
                      void db.decks.update(d.id!, { inactive: nextInactive ? true : undefined });
                    },
                  });
                }}
                onTouchStart={() => {
                  if (!d.id) return;
                  setIslandDeckFocus({
                    id: d.id,
                    name: d.name,
                    color: deckColour(d),
                    active: !d.inactive,
                    tags: [...(d.tags ?? []), ...autoThemes.map((t) => t.label)].slice(0, 3),
                    onToggleActive: () => {
                      const nextInactive = !d.inactive;
                      haptic(nextInactive ? 'tap' : 'success');
                      void db.decks.update(d.id!, { inactive: nextInactive ? true : undefined });
                    },
                  });
                }}
              >
                <DeckTile onClick={() => setOpen(d.id!)} onMenu={(x, y) => setListMenu({ id: d.id!, at: { x, y } })} label={d.name}>
                  <DeckStack3D img={c?.img} totalCards={totalCards} />
                  <span className="cinfo">
                    <span className="nm">
                      <b>{d.name}</b>
                    </span>
                    <span className="cmatch">
                      <b>{sum.pct}%</b>
                      <Meter pct={sum.pct} label={`${sum.pct}% owned`} tone="deck" />
                    </span>
                    <span className="cinfo-more">
                      {(d.tags?.length || autoThemes.length > 0) ? (
                        <span className={`dtags${phone ? ' plain' : ''}`} onClick={phone ? undefined : (e) => e.stopPropagation()}>
                          {phone && autoThemes.map((th) => <span key={th.label} className="themebadge">{th.label}</span>)}
                          {phone && d.tags?.map((t) => <span key={t} className="tagbadge">#{t}</span>)}
                          {!phone && autoThemes.map((th) => (
                            <span
                              key={th.label}
                              role="button"
                              tabIndex={0}
                              className={`themebadge ${dtag === th.label ? 'active' : ''}`}
                              title={`Theme: ${th.label}. Tap to filter`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDtag(dtag === th.label ? 'all' : th.label);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDtag(dtag === th.label ? 'all' : th.label);
                                }
                              }}
                            >
                              {th.label}
                            </span>
                          ))}
                          {!phone && d.tags?.map((t) => (
                            <span
                              key={t}
                              role="button"
                              tabIndex={0}
                              className={`tagbadge ${dtag === t ? 'active' : ''}`}
                              title={`Filter by #${t}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDtag(dtag === t ? 'all' : t);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setDtag(dtag === t ? 'all' : t);
                                }
                              }}
                            >
                              #{t}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      {!d.commander && <span className="nocmdr">no commander set: open the deck to pick one</span>}
                      <span className="cfoot">
                        <span>
                          {totalCards} cards
                          {priced.size > 0 && <> · ≈{cad(priceSum(d.cards.map((x) => ({ card: x.foil ? atFinish(priced.get(norm(x.name)), true) : priced.get(norm(x.name)), qty: x.qty }))))}</>}
                        </span>
                        {(d.wins ?? 0) + (d.losses ?? 0) > 0 && (
                          <span className={`drec-badge${(d.wins ?? 0) >= (d.losses ?? 0) ? ' hot' : ''}`} title="Pod win–loss record">
                            {formatRecord(d.wins, d.losses)}
                          </span>
                        )}
                        <span className={`cstate${sum.pct === 100 ? ' ready' : ''}`}>{sum.missing === 0 && sum.total > 0 ? 'ALL OWNED' : `${sum.missing} MISSING`}</span>
                      </span>
                    </span>
                    {broken && (
                      <span className="dlegal" title={broken.says}>
                        <span aria-hidden="true">
                          <i>NOT LEGAL</i> <i>· {broken.label}</i>
                        </span>
                        <span className="vh">{broken.says}</span>
                      </span>
                    )}
                  </span>
                </DeckTile>
                <DeckLight deck={d} />
              </li>
            );
          })}
          {decks.length === 0 && <li className="dempty">No decks yet. Save one from a commander page, or paste a list below.</li>}
        </ul>
        </>
        )}
        {importing && <ImportDeckPop profile={s.profile} onClose={() => setImporting(false)} onDone={(id) => (setImporting(false), setOpen(id))} />}


      </main>
    </>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { worthOf } from '../../lib/analytics';
import { saveCardListSoon } from '../../lib/cardlist';
import { applyFilter, filterCount, noFilter, type CollFilter } from '../../lib/collfilter';
import { inUse } from '../../lib/copies';
import { db, type Card } from '../../lib/db';
import { deckPicUrls } from '../../lib/deckpics';
import { collectionCsv, collectionText, download } from '../../lib/export';
import { activeNeed, allFolders, applyFolderPlan, childPath, depthOf, folderStats, leafOf, MAX_DEPTH, parentOf, planAddFolder, planDeleteFolder, planMoveFolder, planRenameFolder, rowsWithin, showPath } from '../../lib/folders';
import { haptic, haptic as buzz } from '../../lib/haptics';
import { norm } from '../../lib/names';
import { openDeckList } from '../../lib/nav';
import { saveAheadSoon } from '../../lib/offlinepics';
import { cad, fetchedNote, PRICE_METHOD } from '../../lib/prices';
import { snapshot } from '../../lib/pricewatch';
import { cardsByIds } from '../../lib/scryfall';
import { searchByText } from '../../lib/search';
import { logWorth } from '../../lib/worthlog';
import { CardsView } from '../../views/CardsView';
import { isCommander } from '../../views/Discover';
import { ActiveChips, FilterButton } from '../../views/FilterSheet';
import { EmptyState, priced, priceSum, type Shared } from '../../views/shared';
import { Doodles, PageDecor, Title } from '../../views/zine';
import { BinderMenu, type SyncItem } from './BinderMenu';
import { ImportModal } from './ImportModal';
import { TopWidget } from './TopWidget';

const Analytics = lazy(() => import('../../views/Analytics'));

export function Collection({
  profile,
  name,
  s,
  binders = [],
  onPick,
  sync,
}: {
  profile: number;
  name: string;
  s: Shared;
  binders?: { id: number; name: string }[];
  onPick?: (id: number) => void;
  sync?: SyncItem;
}) {
  const list = useLiveQuery(() => db.entries.where('profile').equals(profile).sortBy('name'), [profile]);
  const entries = list ?? [];
  const [importOpen, setImportOpen] = useState<boolean>(false);
  const [ctab, setCtab] = useState<'cards' | 'analytics'>('cards');
  const [phone, setPhone] = useState(() => (typeof matchMedia === 'function' ? matchMedia('(max-width: 700px)').matches : window.innerWidth <= 700));
  const page = useRef<HTMLElement>(null);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('ch:collswipe')) return;
    } catch {
      return;
    }
    const t = setTimeout(() => setHint(true), 700);
    const off = setTimeout(() => setHint(false), 3400);
    return () => (clearTimeout(t), clearTimeout(off));
  }, []);

  const seenSwipe = () => {
    setHint(false);
    try {
      localStorage.setItem('ch:collswipe', '1');
    } catch {
      /* ignore storage errors */
    }
  };

  useEffect(() => {
    const el = page.current;
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    let id = -1;
    const skip = (t: EventTarget | null) => !!(t as Element)?.closest?.('input, select, textarea, button, a, details, .list-tabs, .tquick, .agrid, .cwheel, [role="dialog"]');
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || skip(e.target)) return;
      x0 = e.clientX;
      y0 = e.clientY;
      id = e.pointerId;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = -1;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
      const next = dx < 0 ? 'analytics' : 'cards';
      seenSwipe();
      if (next === ctab) return;
      haptic('select');
      setCtab(next);
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
  }, [ctab]);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const mq = matchMedia('(max-width: 700px)');
    const on = () => setPhone(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    if (list !== undefined && list.length === 0) setImportOpen(true);
  }, [list?.length]);

  useEffect(() => {
    if (!importOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setImportOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [importOpen]);

  const deckRows = useLiveQuery(() => db.decks.where('profile').equals(profile).toArray(), [profile]) ?? [];
  const [filter, setFilter] = useState<CollFilter>(noFilter);
  const [q, setQ] = useState('');
  const [activeList, setActiveList] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'price-desc' | 'mv-asc' | 'added-desc'>('name-asc');
  const [addingListInline, setAddingListInline] = useState(false);
  const [newListNameInline, setNewListNameInline] = useState('');

  const currentProf = useLiveQuery(() => db.profiles.get(profile), [profile]);
  const customLists = currentProf?.lists ?? [];
  const folderTree = useMemo(() => allFolders(customLists), [customLists]);
  const [addingSubTo, setAddingSubTo] = useState<string | null>(null);
  const [folderAction, setFolderAction] = useState<null | { mode: 'rename' | 'move'; value: string }>(null);
  useEffect(() => {
    setFolderAction(null);
  }, [activeList]);

  const cards = useLiveQuery(async () => new Map((await db.cards.bulkGet([...new Set(entries.map((e) => e.cardId))])).filter(Boolean).map((c) => [c!.id, c!])), [entries]) ?? new Map<string, Card>();
  const copies = (rows: { qty: number }[]) => rows.reduce((n, e) => n + e.qty, 0);
  const total = copies(entries);
  const value = priceSum(entries.map((e) => ({ card: priced(cards.get(e.cardId), e.foil), qty: e.qty })));

  useEffect(() => {
    if (entries.length)
      cardsByIds(entries.map((e) => e.cardId), 864e5)
        .then((m) => {
          void saveAheadSoon(deckPicUrls);
          saveCardListSoon();
          void logWorth(profile, worthOf(entries, m)).catch(() => {});
          return snapshot(entries, m);
        })
        .catch(() => {});
  }, [entries.length]);

  const dq = useDeferredValue(q);
  const usedIn = useMemo(() => inUse(deckRows), [deckRows]);
  const need = useMemo(() => activeNeed(deckRows), [deckRows]);
  const { inTab, shown } = useMemo(() => {
    const inTab =
      activeList === 'all'
        ? entries
        : activeList === 'unlisted'
          ? entries.filter((e) => !e.list)
          : rowsWithin(entries, activeList);
    const listFiltered = applyFilter(inTab, filter, { cardOf: (e) => cards.get(e.cardId), inDeck: (n) => usedIn.has(norm(n)), isCommander: (c) => !!c.legal && isCommander(c.type, c.text) });
    const sorted = [...listFiltered].sort((a, b) => {
      if (sortOrder === 'name-desc') return b.name.localeCompare(a.name);
      if (sortOrder === 'price-desc') {
        const pa = Number(priced(cards.get(a.cardId), a.foil)?.usd ?? 0);
        const pb = Number(priced(cards.get(b.cardId), b.foil)?.usd ?? 0);
        return pb - pa || a.name.localeCompare(b.name);
      }
      if (sortOrder === 'mv-asc') {
        const ca = cards.get(a.cardId)?.cmc ?? 0;
        const cb = cards.get(b.cardId)?.cmc ?? 0;
        return ca - cb || a.name.localeCompare(b.name);
      }
      if (sortOrder === 'added-desc') {
        return (b.added ?? 0) - (a.added ?? 0) || a.name.localeCompare(b.name);
      }
      return a.name.localeCompare(b.name);
    });
    const shown = searchByText(sorted, dq, (e) => ({ name: e.name, type: cards.get(e.cardId)?.type, text: cards.get(e.cardId)?.text }));
    return { inTab, shown };
  }, [entries, activeList, filter, cards, usedIn, sortOrder, dq]);

  const activeFolderStats = useMemo(
    () => (activeList !== 'all' && activeList !== 'unlisted' ? folderStats(inTab, entries, need, cards) : null),
    [activeList, inTab, entries, need, cards],
  );
  const hasChildren = activeList !== 'all' && activeList !== 'unlisted' && folderTree.some((p) => p !== activeList && p.startsWith(`${activeList}/`));
  const moveTargets = useMemo(() => {
    if (activeList === 'all' || activeList === 'unlisted') return [];
    const opts: { value: string; label: string }[] = [];
    if (parentOf(activeList)) opts.push({ value: '', label: 'Top level' });
    if (!hasChildren) {
      for (const f of folderTree) {
        if (depthOf(f) === 1 && f !== activeList && f !== parentOf(activeList)) {
          opts.push({ value: f, label: showPath(f) });
        }
      }
    }
    return opts;
  }, [activeList, folderTree, hasChildren]);

  const file = (ext: string) => `${name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const unique = new Set(entries.map((e) => cards.get(e.cardId)?.key ?? e.name.toLowerCase())).size;
  const illegal = entries.reduce((n, e) => n + (cards.get(e.cardId)?.legal === false ? e.qty : 0), 0);
  const commanders = new Set([...cards.values()].filter((c) => c.legal && isCommander(c.type, c.text)).map((c) => c.key)).size;

  const tabset = (
    <div className="ctabset" role="tablist" aria-label="Collection view">
      {([['cards', 'CARDS'], ['analytics', 'ANALYTICS']] as const).map(([v, label]) => (
        <button
          key={v}
          type="button"
          role="tab"
          id={`ctab-${v}`}
          aria-selected={ctab === v}
          aria-controls={`cpane-${v}`}
          className={`ctab${ctab === v ? ' on' : ''}`}
          onClick={() => (haptic('select'), seenSwipe(), setCtab(v))}
        >
          {label}
          {v === 'cards' && <span className="ctab-n">{total.toLocaleString()}</span>}
        </button>
      ))}
    </div>
  );
  const collacts = (
    <div className="ctab-acts">
      <button type="button" className="slip-btn deck" onClick={() => (haptic('open'), openDeckList())} title="View and build decks in this binder">
        + DECK
      </button>
      <button type="button" className="slip-btn import" onClick={() => (haptic('open'), setImportOpen(true))} title="Import cards into this binder">
        IMPORT
      </button>
    </div>
  );

  return (
    <>
      <PageDecor seed={821} rays="18% 18%" sheet={{ side: 'right', top: 140, rot: 6 }} />
      <main className={`dpage coll${hint ? ' swipehint' : ''}`} ref={page}>
        <section className="chead2">
          <Title
            text="COLLECTION"
            label="Collection"
            size={phone ? 24 : 60}
            seed={21}
            after={
              <>
                <BinderMenu profile={profile} name={name} count={total} binders={binders} onPick={onPick} sync={sync} />
                {!phone && (
                  <span className="titleacts">
                    {tabset}
                    {hint && (
                      <span className="ctab-hint" role="status">
                        swipe ⇄
                      </span>
                    )}
                    {collacts}
                  </span>
                )}
              </>
            }
          />
        </section>

        {phone && (
          <nav className="ctabs" aria-label="Collection view">
            {tabset}
            {hint && (
              <span className="ctab-hint" role="status">
                swipe ⇄
              </span>
            )}
            {collacts}
          </nav>
        )}

        {ctab === 'analytics' && (
          <section className="stats" id="cpane-analytics" role="tabpanel" aria-labelledby="ctab-analytics">
            <div className="stat gbox" style={{ transform: 'rotate(-0.8deg)' }}>
              <span className="worn" aria-hidden="true" />
              <span className="spray" aria-hidden="true" />
              <b>{total.toLocaleString()}</b>
              <span>cards</span>
              <Doodles n={377} count={1} spots={[[70, -24]]} />
            </div>
            <div className="stat" style={{ transform: 'rotate(0.6deg)' }}>
              <span className="worn" aria-hidden="true" />
              <span className="spray" aria-hidden="true" />
              <b>{unique.toLocaleString()}</b>
              <span>unique cards</span>
            </div>
            <div className="stat red gbox" style={{ transform: 'rotate(-1.2deg)' }}>
              <span className="worn" aria-hidden="true" />
              <span className="spray" aria-hidden="true" />
              <b>{commanders.toLocaleString()}</b>
              <span>commanders</span>
              <svg className="crown" viewBox="0 0 64 44" aria-hidden="true">
                <path d="M6 36 L4 10 L18 24 L30 4 L40 22 L58 8 L56 36 Z" />
                <path d="M5 40 C20 37 42 42 58 38" />
                <circle cx="30" cy="4" r="2.6" />
                <circle cx="4" cy="10" r="2.2" />
                <circle cx="58" cy="8" r="2.2" />
              </svg>
            </div>
            <div className="slip" style={{ transform: 'rotate(-0.5deg)' }}>
              <span className="warn">warning</span>
              <div className="slip-top">
                <div className="slip-val">
                  <span className="se">worth about</span>
                  <b>{value > 0 ? cad(value) : 'CA$—'}</b>
                  <span className="se small" title={PRICE_METHOD}>
                    est. · your printings and finishes · {fetchedNote(entries.map((e) => cards.get(e.cardId)?.at))}
                  </span>
                </div>
              </div>
              {value > 0 && <span className="stamp">APPRAISED</span>}
            </div>
            <TopWidget entries={entries} cards={cards} />
          </section>
        )}

        {ctab === 'analytics' && (
          <Suspense fallback={<p className="small">Working out your numbers…</p>}>
            <Analytics entries={entries} cards={cards} decks={deckRows} binder={name} profile={profile} />
          </Suspense>
        )}

        {importOpen && <ImportModal profile={profile} name={name} entriesCount={entries.length} onClose={() => setImportOpen(false)} />}

        {illegal > 0 && (
          <p className="count">
            {illegal} {illegal === 1 ? 'card is' : 'cards are'} not legal in Commander (tokens, Un-cards, banned): kept in the binder, not counted as owned for decks.
          </p>
        )}

        {ctab === 'cards' && (
          <section className="coll-listbar" aria-label="Binder lists navigation">
            <div className="list-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={activeList === 'all'} className={`list-tab${activeList === 'all' ? ' active' : ''}`} onClick={() => (buzz('select'), setActiveList('all'))}>
                ALL <span className="tab-count">{copies(entries).toLocaleString()}</span>
              </button>
              <button type="button" role="tab" aria-selected={activeList === 'unlisted'} className={`list-tab${activeList === 'unlisted' ? ' active' : ''}`} onClick={() => (buzz('select'), setActiveList('unlisted'))}>
                UNLISTED <span className="tab-count">{copies(entries.filter((e) => !e.list)).toLocaleString()}</span>
              </button>
              {folderTree.map((l) => {
                const count = copies(rowsWithin(entries, l)).toLocaleString();
                const isSub = depthOf(l) > 1;
                return (
                  <span key={l} className="list-tab-wrap">
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeList === l}
                      className={`list-tab${activeList === l ? ' active' : ''}`}
                      title={showPath(l)}
                      onClick={() => (buzz('select'), setActiveList(l))}
                    >
                      {isSub ? `↳ ${showPath(l).toUpperCase()}` : showPath(l).toUpperCase()} <span className="tab-count">{count}</span>
                    </button>
                    <button
                      type="button"
                      className="list-del-btn"
                      title={`Delete folder ${showPath(l)}`}
                      aria-label={`Delete folder ${showPath(l)}`}
                      onClick={async (ev) => {
                        ev.stopPropagation();
                        const parent = parentOf(l);
                        if (!confirm(`Delete folder "${showPath(l)}"? Cards will move to ${parent ? showPath(parent) : 'Unlisted'}.`)) return;
                        buzz('warn');
                        const plan = planDeleteFolder(customLists, entries, l);
                        if (!plan.ok) return;
                        if (activeList === l || activeList.startsWith(`${l}/`)) setActiveList(parent ?? 'all');
                        await applyFolderPlan(profile, plan);
                      }}
                    >
                      ✕
                    </button>
                  </span>
                );
              })}
              {!addingListInline ? (
                <>
                  {activeList !== 'all' && activeList !== 'unlisted' && depthOf(activeList) < MAX_DEPTH && (
                    <button
                      type="button"
                      className="list-tab add-btn"
                      title={`Create subfolder inside ${showPath(activeList)}`}
                      onClick={() => {
                        buzz('open');
                        setAddingSubTo(activeList);
                        setAddingListInline(true);
                      }}
                    >
                      + SUBFOLDER
                    </button>
                  )}
                  <button
                    type="button"
                    className="list-tab add-btn"
                    onClick={() => {
                      buzz('open');
                      setAddingSubTo(null);
                      setAddingListInline(true);
                    }}
                  >
                    + NEW FOLDER
                  </button>
                </>
              ) : (
                <span className="list-new-inline">
                  <input
                    type="text"
                    value={newListNameInline}
                    onChange={(e) => setNewListNameInline(e.target.value)}
                    placeholder={addingSubTo ? `Inside ${showPath(addingSubTo)}…` : 'New folder name…'}
                    autoFocus
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter' && newListNameInline.trim()) {
                        e.preventDefault();
                        const plan = planAddFolder(customLists, addingSubTo, newListNameInline.trim());
                        if (!plan.ok) return alert(plan.why);
                        await applyFolderPlan(profile, plan);
                        buzz('success');
                        setActiveList(plan.lists.at(-1) ?? 'all');
                        setNewListNameInline('');
                        setAddingSubTo(null);
                        setAddingListInline(false);
                      } else if (e.key === 'Escape') {
                        setAddingSubTo(null);
                        setAddingListInline(false);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="u-btn primary"
                    disabled={!newListNameInline.trim()}
                    onClick={async () => {
                      const plan = planAddFolder(customLists, addingSubTo, newListNameInline.trim());
                      if (!plan.ok) return alert(plan.why);
                      await applyFolderPlan(profile, plan);
                      buzz('success');
                      setActiveList(plan.lists.at(-1) ?? 'all');
                      setNewListNameInline('');
                      setAddingSubTo(null);
                      setAddingListInline(false);
                    }}
                  >
                    ADD
                  </button>
                  <button
                    type="button"
                    className="u-btn ghost"
                    onClick={() => {
                      setAddingSubTo(null);
                      setAddingListInline(false);
                    }}
                  >
                    ✕
                  </button>
                </span>
              )}
            </div>
            {activeFolderStats && activeList !== 'all' && activeList !== 'unlisted' && (
              <div className="folder-meta-bar" aria-label={`Folder summary for ${showPath(activeList)}`}>
                <span className="folder-meta-facts">
                  <strong>{showPath(activeList)}</strong> · {activeFolderStats.copies.toLocaleString()} {activeFolderStats.copies === 1 ? 'copy' : 'copies'} · {activeFolderStats.unique.toLocaleString()} unique ·{' '}
                  {activeFolderStats.usd > 0 ? `≈${cad(activeFolderStats.usd)}` : 'CA$—'} ·{' '}
                  <strong>{activeFolderStats.spare.toLocaleString()} spare</strong> (free from active decks)
                </span>
                <span className="folder-meta-acts">
                  {folderAction === null ? (
                    <>
                      <button
                        type="button"
                        className="u-btn ghost"
                        onClick={() => (buzz('open'), setFolderAction({ mode: 'rename', value: leafOf(activeList) }))}
                      >
                        RENAME
                      </button>
                      {moveTargets.length > 0 && (
                        <button
                          type="button"
                          className="u-btn ghost"
                          onClick={() => (buzz('open'), setFolderAction({ mode: 'move', value: moveTargets[0].value }))}
                        >
                          MOVE
                        </button>
                      )}
                    </>
                  ) : folderAction.mode === 'rename' ? (
                    <span className="list-new-inline">
                      <input
                        type="text"
                        aria-label="Rename folder"
                        value={folderAction.value}
                        onChange={(e) => setFolderAction({ mode: 'rename', value: e.target.value })}
                        autoFocus
                        onKeyDown={async (e) => {
                          if (e.key === 'Enter' && folderAction.value.trim()) {
                            e.preventDefault();
                            const plan = planRenameFolder(customLists, entries, activeList, folderAction.value);
                            if (!plan.ok) return alert(plan.why);
                            const nextPath = childPath(parentOf(activeList), folderAction.value.replace(/\s+/g, ' ').trim());
                            await applyFolderPlan(profile, plan);
                            buzz('success');
                            setFolderAction(null);
                            setActiveList(nextPath);
                          } else if (e.key === 'Escape') {
                            setFolderAction(null);
                          }
                        }}
                      />
                      <button
                        type="button"
                        className="u-btn primary"
                        disabled={!folderAction.value.trim()}
                        onClick={async () => {
                          const plan = planRenameFolder(customLists, entries, activeList, folderAction.value);
                          if (!plan.ok) return alert(plan.why);
                          const nextPath = childPath(parentOf(activeList), folderAction.value.replace(/\s+/g, ' ').trim());
                          await applyFolderPlan(profile, plan);
                          buzz('success');
                          setFolderAction(null);
                          setActiveList(nextPath);
                        }}
                      >
                        SAVE
                      </button>
                      <button type="button" className="u-btn ghost" onClick={() => setFolderAction(null)}>
                        ✕
                      </button>
                    </span>
                  ) : (
                    <span className="list-new-inline">
                      <select
                        aria-label="Move folder destination"
                        className="coll-sort-select"
                        value={folderAction.value}
                        onChange={(e) => setFolderAction({ mode: 'move', value: e.target.value })}
                      >
                        {moveTargets.map((t) => (
                          <option key={t.value || '__top'} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="u-btn primary"
                        onClick={async () => {
                          const targetParent = folderAction.value || null;
                          const plan = planMoveFolder(customLists, entries, activeList, targetParent);
                          if (!plan.ok) return alert(plan.why);
                          const nextPath = childPath(targetParent, leafOf(activeList));
                          await applyFolderPlan(profile, plan);
                          buzz('success');
                          setFolderAction(null);
                          setActiveList(nextPath);
                        }}
                      >
                        APPLY
                      </button>
                      <button type="button" className="u-btn ghost" onClick={() => setFolderAction(null)}>
                        ✕
                      </button>
                    </span>
                  )}
                </span>
              </div>
            )}
          </section>
        )}

        {ctab === 'cards' && (
          <section id="cpane-cards" role="tabpanel" aria-labelledby="ctab-cards">
            <CardsView
              entries={shown}
              cards={cards}
              profile={profile}
              binderName={name}
              q={q}
              setQ={setQ}
              strip={
                <>
                  <FilterButton filter={filter} setFilter={setFilter} shown={shown.reduce((n, e) => n + e.qty, 0)} total={inTab.reduce((n, e) => n + e.qty, 0)} />
                  <label className="sortsel">
                    <select
                      id="coll-sort-select"
                      aria-label="Sort cards"
                      value={sortOrder}
                      onChange={(e) => {
                        buzz('select');
                        setSortOrder(e.target.value as typeof sortOrder);
                      }}
                    >
                      <option value="name-asc">Name A–Z</option>
                      <option value="name-desc">Name Z–A</option>
                      <option value="price-desc">Price, high first</option>
                      <option value="mv-asc">Mana value, low first</option>
                      <option value="added-desc">Recently added</option>
                    </select>
                  </label>
                </>
              }
              chips={<ActiveChips filter={filter} setFilter={setFilter} shown={shown.reduce((n, e) => n + e.qty, 0)} total={inTab.reduce((n, e) => n + e.qty, 0)} />}
              empty={
                entries.length > 0 ? (
                  <EmptyState
                    title="No cards match"
                    action={
                      <button
                        type="button"
                        className="u-btn"
                        onClick={() => {
                          haptic('select');
                          setQ('');
                          setFilter(noFilter());
                        }}
                      >
                        CLEAR SEARCH AND FILTERS
                      </button>
                    }
                  >
                    {q.trim() ? `Nothing in ${activeList === 'all' ? name : 'this list'} matches “${q.trim()}”${filterCount(filter) ? ' with these filters' : ''}.` : filterCount(filter) ? 'No card passes these filters.' : 'This list has no cards yet.'}
                  </EmptyState>
                ) : undefined
              }
              more={
                <>
                  <button className="u-chip" disabled={!entries.length} onClick={() => download(file('csv'), collectionCsv(entries), 'text/csv')}>
                    EXPORT CSV
                  </button>
                  <button className="u-chip" disabled={!entries.length} onClick={() => download(file('txt'), collectionText(entries))}>
                    EXPORT TEXT
                  </button>
                </>
              }
            />
          </section>
        )}
      </main>
    </>
  );
}

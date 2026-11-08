import { haptic } from '../lib/haptics';
import { searchByText } from '../lib/search';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { importCollection, importDeck, resetProfile, type ImportResult } from '../lib/actions';
import { parseImport } from '../lib/importers';
import { haptic as buzz, HAPTIC_NOTE, hapticsOn, hapticsSupported, setHaptics } from '../lib/haptics';
import { useRef } from 'react';
import { db, type Card } from '../lib/db';
import { collectionCsv, collectionText, download } from '../lib/export';
import { cad } from '../lib/prices';
import { CardsView } from './CardsView';
import { freeDeckName, openDeck, openDeckList } from '../lib/nav';
import type { Shared } from './shared';
import { isCommander } from './Discover';
import { fetchedNote, PRICE_METHOD } from '../lib/prices';
import { cardsByIds } from '../lib/scryfall';
import { snapshot } from '../lib/pricewatch';
import { priced, priceSum, Progress } from './shared';
import { Doodles, Title } from './zine';
import { manageBinderLists, UNASSIGNED_NAME, UNASSIGNED_PROFILE } from '../lib/deckedit';

export function ImportReport({ r, deck }: { r: ImportResult; deck?: boolean }) {
  return (
    <div className="report" role="status">
      <p>
        {deck ? (
          <>
            Saved deck ({r.added} cards in deck — none added to your collection).
          </>
        ) : (
          <>
            Read as <b>{r.format === 'manabox' ? 'ManaBox CSV' : r.format === 'csv' ? 'CSV' : 'text list'}</b>: {r.added} cards added.
          </>
        )}
      </p>
      {!!r.failed?.length && (
        <p className="error">
          Scryfall stopped answering, so {r.failed.length} {r.failed.length === 1 ? 'card was' : 'cards were'} not looked up yet. The rest are saved. The box now holds
          just those cards: add them again in a minute.
        </p>
      )}
      {r.unmatched.length > 0 && (
        <details>
          <summary className="error">{r.unmatched.length} {r.unmatched.length === 1 ? 'name' : 'names'} Scryfall couldn't find (not added)</summary>
          <ul>
            {r.unmatched.map((u, i) => (
              <li key={i}>
                {u.qty} {u.name}
                {u.set && ` (${u.set}${u.cn ? ' ' + u.cn : ''})`}
              </li>
            ))}
          </ul>
        </details>
      )}
      {r.errors.length > 0 && (
        <details>
          <summary className="error">{r.errors.length} lines skipped</summary>
          <ul>
            {r.errors.map((e) => (
              <li key={e.line}>
                Line {e.line}: {e.reason} — <code>{e.text}</code>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function Collection({ profile, name, s, binders = [], onPick, sync }: { profile: number; name: string; s: Shared; binders?: { id: number; name: string }[]; onPick?: (id: number) => void; sync?: SyncItem }) {
  const list = useLiveQuery(() => db.entries.where('profile').equals(profile).sortBy('name'), [profile]);
  const entries = list ?? [];
  // Import modal pop-up: opens by itself for an empty binder (and stays open while an import runs).
  const [importOpen, setImportOpen] = useState<boolean>(false);
  useEffect(() => {
    if (list !== undefined && list.length === 0) setImportOpen(true);
  }, [list?.length]);

  useEffect(() => {
    if (!importOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setImportOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [importOpen]);

  const [dashPick, setDashPick] = useState<boolean | null>(() => {
    try {
      const v = localStorage.getItem('ch:dash');
      return v === null ? null : v === '1';
    } catch {
      return null;
    }
  });
  const setDash = (o: boolean) => {
    setDashPick(o);
    try {
      localStorage.setItem('ch:dash', o ? '1' : '0');
    } catch {}
  };
  const decks = useLiveQuery(() => db.decks.where('profile').equals(profile).count(), [profile]) ?? 0;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const [activeList, setActiveList] = useState<string>('all');
  const [sortOrder, setSortOrder] = useState<'name-asc' | 'name-desc' | 'price-desc' | 'mv-asc' | 'added-desc'>('name-asc');
  const [addingListInline, setAddingListInline] = useState(false);
  const [newListNameInline, setNewListNameInline] = useState('');

  const currentProf = useLiveQuery(() => db.profiles.get(profile), [profile]);
  const customLists = currentProf?.lists ?? [];

  async function run(input: string, replace: boolean) {
    if (replace && entries.length && !confirm(`Replace all ${entries.length} entries in ${name}?`)) return;
    setError('');
    setResult(null);
    setBusy({ done: 0, total: 0 });
    try {
      const r = await importCollection(profile, input, replace, (done, total) => setBusy({ done, total }));
      setResult(r);
      // only the cards Scryfall never answered for stay in the box, so adding again doesn't count the saved ones twice
      setText((r.failed ?? []).map((f) => `${f.qty} ${f.name}${f.set && f.cn ? ` (${f.set.toUpperCase()}) ${f.cn}` : ''}${f.foil ? ' *F*' : ''}`).join('\n'));
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}. Nothing was lost; try again.`);
    }
    setBusy(null);
  }

  // Detect when a pasted list has deck sections (Commander / Deck / Sideboard) so the user doesn't accidentally dump a deck into their collection binder.
  const deckLike = (() => {
    if (!text.trim()) return false;
    const p = parseImport(text);
    return p.format === 'text' && p.rows.some((r) => /^(commanders?|companion|deck|main|mainboard|maindeck|sideboard|side|maybe|maybeboard|considering)$/i.test(r.section ?? ''));
  })();

  async function saveAsDeckInstead() {
    setError('');
    setResult(null);
    setBusy({ done: 0, total: 0 });
    try {
      const p = parseImport(text);
      const cmdrRow = p.rows.find((r) => /commander/i.test(r.section ?? '')) ?? p.rows[0];
      const baseName = cmdrRow ? `${cmdrRow.name.split(' // ')[0]} deck` : 'Imported deck';
      const deckName = await freeDeckName(profile, baseName);
      const r = await importDeck(profile, deckName, text, (done, total) => setBusy({ done, total }));
      setText('');
      haptic('success');
      openDeck(r.deck.name);
    } catch (e) {
      setError(`Deck import failed: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  const cards = useLiveQuery(async () => new Map((await db.cards.bulkGet([...new Set(entries.map((e) => e.cardId))])).filter(Boolean).map((c) => [c!.id, c!])), [entries]) ?? new Map<string, Card>();
  const total = entries.reduce((n, e) => n + e.qty, 0);
  const value = priceSum(entries.map((e) => ({ card: priced(cards.get(e.cardId), e.foil), qty: e.qty })));
  // Prices older than a week are fetched again (only those).
  // Collection prices refresh daily (Scryfall updates once a day), then today's prices are saved for the movers.
  useEffect(() => {
    if (entries.length)
      cardsByIds(entries.map((e) => e.cardId), 864e5)
        .then((m) => snapshot(entries, m))
        .catch(() => {});
  }, [entries.length]);
  // Filter by active list tab: 'all' = everything, 'unlisted' = no list tag, else specific list name
  const listFiltered = entries.filter((e) => {
    if (activeList === 'all') return true;
    if (activeList === 'unlisted') return !e.list;
    return e.list === activeList;
  });

  // Sort according to chosen sortOrder
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

  // name or rules text (Oracle + reminder text) or type line
  const shown = searchByText(sorted, q, (e) => ({ name: e.name, type: cards.get(e.cardId)?.type, text: cards.get(e.cardId)?.text }));
  const file = (ext: string) => `${name.replace(/[^\w-]+/g, '_')}.${ext}`;

  const unique = new Set(entries.map((e) => cards.get(e.cardId)?.key ?? e.name.toLowerCase())).size;
  const illegal = entries.reduce((n, e) => n + (cards.get(e.cardId)?.legal === false ? e.qty : 0), 0);
  const commanders = new Set([...cards.values()].filter((c) => c.legal && isCommander(c.type, c.text)).map((c) => c.key)).size;
  // opens by itself for an empty binder and while an import runs or reports
  const dashOpen = !!busy || !!result || (dashPick ?? (list !== undefined && list.length === 0));
  const upload = (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path d="M3 12 V15 H15 V12 M9 3 V11 M5 7 L9 3 L13 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );

  // One ribbon says the binder's facts once (owner's Overhaul: "N cards · N commanders · CA$X · N decks").
  const facts: [string, string, string?][] = [
    [total.toLocaleString(), total === 1 ? 'card' : 'cards'],
    [unique.toLocaleString(), 'unique'],
    [commanders.toLocaleString(), commanders === 1 ? 'commander' : 'commanders'],
    ...(value > 0 ? [[`≈${cad(value)}`, '', `${PRICE_METHOD} · ${fetchedNote(entries.map((e) => cards.get(e.cardId)?.at))}`] as [string, string, string]] : []),
    ...(decks > 0 ? [[String(decks), decks === 1 ? 'deck' : 'decks'] as [string, string]] : []),
  ];

  // THE OVERHAUL, Collection: the loud frame (ransom title + binder tag) → one ribbon of facts and actions → the cards with
  // their one toolbar. Your decks and the import fold open under the ribbon.
  return (
    <main className="dpage coll">
      <section className="chead2">
        {/* The binder's name is part of the title (owner's call, Nov 6): a tag under the letters opens the one binder
            control (switch, add, rename, reset, delete, plus sync and haptics). */}
        <Title text="COLLECTION" label="Collection" size={60} seed={21} after={<BinderMenu profile={profile} name={name} count={entries.length} binders={binders} onPick={onPick} sync={sync} />} />
      </section>

      <details className="dash" open={dashOpen} onToggle={(e) => setDash(e.currentTarget.open)}>
        <summary aria-label={`Binder overview: ${total} cards, ${commanders} commanders${decks ? `, ${decks} decks` : ''}`}>
          <span className="dacts2">
            <span role="button" tabIndex={0} className="u-btn ghost ddeck" onClick={(e) => (e.preventDefault(), e.stopPropagation(), haptic('open'), openDeckList())}>
              + DECK
            </span>
            <span role="button" tabIndex={0} className="u-btn primary dimp" onClick={(e) => (e.preventDefault(), e.stopPropagation(), haptic('open'), setImportOpen(true))}>
              IMPORT
            </span>
            <span className="chev" aria-hidden="true">
              ▾
            </span>
          </span>
        </summary>

        {/* Zine Soul Stats: orderly composition with punk texture, doodles, crown and appraised ticket */}
        <section className="stats">
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
            <span className="se">worth about</span>
            <b>{value > 0 ? cad(value) : 'CA$—'}</b>
            <span className="se small" title={PRICE_METHOD}>
              est. · your printings and finishes · {fetchedNote(entries.map((e) => cards.get(e.cardId)?.at))}
            </span>
            {value > 0 && <span className="stamp">APPRAISED</span>}
          </div>
        </section>
      </details>

      {/* Pop-up modal for import cards */}
      {importOpen && (
        <>
          <div className="backdrop" onClick={() => setImportOpen(false)} />
          <div className="importbox-pop note-pop" role="dialog" aria-modal="true" aria-label="Import cards" onClick={(e) => e.stopPropagation()}>
            <div className="nh">
              <span>IMPORT <mark>CARDS</mark></span>
              <button type="button" className="close" onClick={() => setImportOpen(false)} aria-label="Close dialog">✕</button>
            </div>
            <section className="importbox importrow">
              <p className="ihelp">
                Add cards you own to <b>{name}</b>: ManaBox CSV, a CSV with name/quantity columns, or a card list ("1 Sol Ring"). To add a deck without adding its cards to your collection, use <b>+ DECK</b>.
              </p>
              <label className="u-btn file">
                {upload}
                CHOOSE A FILE
                <input
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  disabled={!!busy}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) setText(await f.text());
                  }}
                />
              </label>
              <label className="ipaste">
                <span>…or paste cards you own</span>
                <textarea rows={6} placeholder={'1 Sol Ring\n1x Arcane Signet (CMM) 375_'} value={text} onChange={(e) => setText(e.target.value)} autoFocus />
              </label>
              {deckLike && (
                <div className="deckwarn" role="status">
                  <span>
                    <b>▲ Looks like a deck list.</b> Adding here puts every card into your <b>{name}</b> collection. Decks never add cards to your collection:
                  </span>
                  <button type="button" className="u-btn" disabled={!!busy} onClick={() => void saveAsDeckInstead()}>
                    SAVE AS A DECK INSTEAD →
                  </button>
                </div>
              )}
              <div className="ibtns">
                <button className="u-btn primary" disabled={!text.trim() || !!busy} onClick={() => run(text, false)}>
                  + ADD
                </button>
                <button className="u-btn" disabled={!text.trim() || !!busy} onClick={() => run(text, true)} title={`Replace every card in ${name} with this list`}>
                  REPLACE
                </button>
                <button type="button" className="u-btn ghost" onClick={() => setImportOpen(false)}>
                  CANCEL
                </button>
              </div>
              {busy && <Progress {...busy} />}
              {error && <p className="error">{error}</p>}
              {result && <ImportReport r={result} />}
            </section>
          </div>
        </>
      )}

      {illegal > 0 && (
        <p className="count">
          {illegal} {illegal === 1 ? 'card is' : 'cards are'} not legal in Commander (tokens, Un-cards, banned): kept in the binder, not counted as owned for decks.
        </p>
      )}

      {/* Binders and Lists Ribbon */}
      <section className="coll-listbar" aria-label="Binder lists navigation">
        <div className="list-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeList === 'all'}
            className={`list-tab${activeList === 'all' ? ' active' : ''}`}
            onClick={() => (buzz('select'), setActiveList('all'))}
          >
            ALL <span className="tab-count">{entries.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeList === 'unlisted'}
            className={`list-tab${activeList === 'unlisted' ? ' active' : ''}`}
            onClick={() => (buzz('select'), setActiveList('unlisted'))}
          >
            UNLISTED <span className="tab-count">{entries.filter((e) => !e.list).length}</span>
          </button>
          {customLists.map((l) => {
            const count = entries.filter((e) => e.list === l).length;
            return (
              <span key={l} className="list-tab-wrap">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeList === l}
                  className={`list-tab${activeList === l ? ' active' : ''}`}
                  onClick={() => (buzz('select'), setActiveList(l))}
                >
                  {l.toUpperCase()} <span className="tab-count">{count}</span>
                </button>
                <button
                  type="button"
                  className="list-del-btn"
                  title={`Delete list ${l}`}
                  aria-label={`Delete list ${l}`}
                  onClick={async (ev) => {
                    ev.stopPropagation();
                    if (!confirm(`Delete list "${l}"? Cards on this list will become unlisted.`)) return;
                    buzz('warn');
                    if (activeList === l) setActiveList('all');
                    await manageBinderLists(profile, 'remove', l);
                  }}
                >
                  ✕
                </button>
              </span>
            );
          })}
          {!addingListInline ? (
            <button
              type="button"
              className="list-tab add-btn"
              onClick={() => {
                buzz('open');
                setAddingListInline(true);
              }}
            >
              + NEW LIST
            </button>
          ) : (
            <span className="list-new-inline">
              <input
                type="text"
                value={newListNameInline}
                onChange={(e) => setNewListNameInline(e.target.value)}
                placeholder="New list name…"
                autoFocus
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && newListNameInline.trim()) {
                    e.preventDefault();
                    const trimmed = newListNameInline.trim();
                    await manageBinderLists(profile, 'add', trimmed);
                    buzz('success');
                    setActiveList(trimmed);
                    setNewListNameInline('');
                    setAddingListInline(false);
                  } else if (e.key === 'Escape') {
                    setAddingListInline(false);
                  }
                }}
              />
              <button
                type="button"
                className="u-btn primary"
                disabled={!newListNameInline.trim()}
                onClick={async () => {
                  const trimmed = newListNameInline.trim();
                  if (!trimmed) return;
                  await manageBinderLists(profile, 'add', trimmed);
                  buzz('success');
                  setActiveList(trimmed);
                  setNewListNameInline('');
                  setAddingListInline(false);
                }}
              >
                ADD
              </button>
              <button type="button" className="u-btn ghost" onClick={() => setAddingListInline(false)}>
                ✕
              </button>
            </span>
          )}
        </div>

        {/* Sort picker */}
        <div className="coll-sort-wrap">
          <label htmlFor="coll-sort-select" className="coll-sort-label">ORDER:</label>
          <select
            id="coll-sort-select"
            className="coll-sort-select"
            value={sortOrder}
            onChange={(e) => {
              buzz('select');
              setSortOrder(e.target.value as any);
            }}
          >
            <option value="name-asc">NAME (A-Z)</option>
            <option value="name-desc">NAME (Z-A)</option>
            <option value="price-desc">PRICE (HIGH-LOW)</option>
            <option value="mv-asc">MANA VALUE (LOW-HIGH)</option>
            <option value="added-desc">RECENTLY ADDED</option>
          </select>
        </div>
      </section>

      <section>
        <CardsView
          entries={shown}
          cards={cards}
          profile={profile}
          binderName={name}
          q={q}
          setQ={setQ}
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
    </main>
  );
}

type SyncItem = { label: string; alert: boolean; open: () => void };

/**
 * The binder control: the binder's name with ▾. Its menu switches binders, adds a new one, renames, empties (RESET,
 * with a confirm) or deletes one (never the last), and holds SYNC and the haptics switch (the old hamburger's items).
 */
function BinderMenu({ profile, name, count, binders, onPick, sync }: { profile: number; name: string; count: number; binders: { id: number; name: string }[]; onPick?: (id: number) => void; sync?: SyncItem }) {
  const [open, setOpen] = useState(false);
  const [hapt, setHapt] = useState(hapticsOn);
  const [note, setNote] = useState('');
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => (removeEventListener('pointerdown', out), removeEventListener('keydown', esc));
  }, [open]);
  const act = (f: () => unknown) => () => (setOpen(false), f());
  async function add() {
    const id = Math.max(0, ...binders.map((b) => b.id)) + 1;
    const nm = prompt('Name the new binder', `Binder ${id}`)?.trim();
    if (!nm) return;
    await db.profiles.add({ id, name: nm });
    buzz('success');
    onPick?.(id);
  }
  async function rename() {
    const nm = prompt('Rename this binder', name)?.trim();
    if (nm && nm !== name) await db.profiles.update(profile, { name: nm });
  }
  async function remove() {
    const decks = await db.decks.where('profile').equals(profile).count();
    if (!confirm(`Delete ${name}? Its ${count} card entries${decks ? ` and ${decks} deck${decks === 1 ? '' : 's'}` : ''} go with it. This can't be undone.`)) return;
    buzz('warn');
    await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
      await db.entries.where('profile').equals(profile).delete();
      await db.decks.where('profile').equals(profile).delete();
      await db.profiles.delete(profile);
    });
    onPick?.(binders.find((b) => b.id !== profile)!.id);
  }
  return (
    <div className="bindermenu" ref={box}>
      <button className={`bmbtn${sync?.alert ? ' alert' : ''}`} aria-expanded={open} aria-haspopup="menu" onClick={() => (buzz('open'), setOpen(!open))}>
        <span className="lbl">BINDER</span>
        <b>{name}</b>
        <span className="chev" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="bmenu" role="menu" aria-label="Binders">
          {/* Unassigned Cards option if not already in binders list */}
          {!binders.some((b) => b.id === UNASSIGNED_PROFILE) && (
            <button role="menuitemradio" aria-checked={profile === UNASSIGNED_PROFILE} onClick={act(() => profile !== UNASSIGNED_PROFILE && onPick?.(UNASSIGNED_PROFILE))}>
              {profile === UNASSIGNED_PROFILE ? '● ' : '○ '}
              {UNASSIGNED_NAME}
            </button>
          )}
          {binders.map((b) => (
            <button key={b.id} role="menuitemradio" aria-checked={b.id === profile} onClick={act(() => b.id !== profile && onPick?.(b.id))}>
              {b.id === profile ? '● ' : '○ '}
              {b.name}
            </button>
          ))}
          <button role="menuitem" onClick={act(add)}>
            + NEW BINDER
          </button>
          <button role="menuitem" onClick={act(rename)}>
            RENAME BINDER
          </button>
          <hr />
          {sync && (
            <button role="menuitem" className={sync.alert ? 'alert' : ''} onClick={act(sync.open)}>
              SYNC <small>{sync.label}</small>
            </button>
          )}
          {hapticsSupported() && (
            <button role="menuitemcheckbox" aria-checked={hapt} onClick={() => (setNote(HAPTIC_NOTE[setHaptics(!hapt)]), setHapt(!hapt))}>
              {hapt ? '◉' : '○'} Haptics {hapt ? 'on' : 'off'}
            </button>
          )}
          {note && (
            <p className="small hapnote" role="status">
              {note}
            </p>
          )}
          <hr />
          <button role="menuitem" className="danger" disabled={!count} onClick={act(() => confirm(`Delete all cards in ${name}? Decks stay.`) && resetProfile(profile))}>
            RESET (EMPTY BINDER)
          </button>
          {binders.length > 1 && profile !== UNASSIGNED_PROFILE && (
            <button role="menuitem" className="danger" onClick={act(remove)}>
              DELETE THIS BINDER
            </button>
          )}
        </div>
      )}
    </div>
  );
}

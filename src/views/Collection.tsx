import { haptic } from '../lib/haptics';
import { searchByText } from '../lib/search';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { importCollection, resetProfile, type ImportResult } from '../lib/actions';
import { haptic as buzz, HAPTIC_NOTE, hapticsOn, hapticsSupported, setHaptics } from '../lib/haptics';
import { useRef } from 'react';
import { db, type Card } from '../lib/db';
import { collectionCsv, collectionText, download } from '../lib/export';
import { cad } from '../lib/prices';
import { CardsView } from './CardsView';
import { MyDecks } from './MyDecks';
import type { Shared } from './shared';
import { isCommander } from './Discover';
import { fetchedNote, PRICE_METHOD } from '../lib/prices';
import { cardsByIds } from '../lib/scryfall';
import { snapshot } from '../lib/pricewatch';
import { priced, priceSum, Progress } from './shared';
import { Doodles, PageDecor, Ransom, Tape, Title } from './zine';

export function ImportReport({ r }: { r: ImportResult }) {
  return (
    <div className="report" role="status">
      <p>
        Read as <b>{r.format === 'manabox' ? 'ManaBox CSV' : r.format === 'csv' ? 'CSV' : 'text list'}</b>: {r.added} cards added.
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
  // Import folds away; it opens by itself for an empty binder (and stays open while an import runs).
  const [importOpen, setImportOpen] = useState<boolean | null>(null);
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
  // name or rules text (Oracle + reminder text) or type line
  const shown = searchByText(entries, q, (e) => ({ name: e.name, type: cards.get(e.cardId)?.type, text: cards.get(e.cardId)?.text }));
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

  return (
    <>
      <PageDecor seed={821} rays="18% 18%" sheet={{ side: 'right', top: 120, rot: 7 }} />
      <main>
        <section className="chead2">
          {/* The binder's name is part of the title (owner's call, Nov 6): a tag under the letters opens the one binder
              control (switch, add, rename, reset, delete, plus sync and haptics). */}
          <Title text="COLLECTION" label="Collection" size={60} seed={21} after={<BinderMenu profile={profile} name={name} count={entries.length} binders={binders} onPick={onPick} sync={sync} />} />
        </section>

        {/* Dashboard fold (owner's call, Nov 6): counts, worth, your decks and import live together, closed by default,
            so the collection comes first. The closed fold still says the numbers in one line. */}
        <details className="dash" open={dashOpen} onToggle={(e) => setDash(e.currentTarget.open)}>
          <summary aria-label={`Binder overview: ${total} cards, ${commanders} commanders${decks ? `, ${decks} decks` : ''}`}>
            {dashOpen ? (
              <span className="dsum dhide">HIDE THE OVERVIEW</span>
            ) : (
            <span className="dsum">
              <span>
                <b>{total.toLocaleString()}</b> cards
              </span>
              <span>
                <b>{commanders.toLocaleString()}</b> {commanders === 1 ? 'commander' : 'commanders'}
              </span>
              {value > 0 && (
                <span>
                  <b>{cad(value).replace(/\.\d\d$/, '')}</b>
                </span>
              )}
              {decks > 0 && (
                <span>
                  <b>{decks}</b> {decks === 1 ? 'deck' : 'decks'}
                </span>
              )}
            </span>
            )}
            {!dashOpen && (
              <span className="dimp" onClick={() => setImportOpen(true)}>
                IMPORT
              </span>
            )}
            <span className="chev" aria-hidden="true">
              ▾
            </span>
          </summary>
          <section className="stats">
            <div className="stat gbox" style={{ transform: 'rotate(-1deg)' }}>
              <span className="worn" aria-hidden="true" />
              <span className="spray" aria-hidden="true" />
              <b>{total.toLocaleString()}</b>
              <span>cards</span>
              <Doodles n={377} count={1} spots={[[70, -24]]} />
            </div>
            <div className="stat" style={{ transform: 'rotate(.8deg)' }}>
              <span className="worn" aria-hidden="true" />
              <span className="spray" aria-hidden="true" />
              <b>{unique.toLocaleString()}</b>
              <span>unique cards</span>
            </div>
            <div className="stat red gbox" style={{ transform: 'rotate(-1.4deg)' }}>
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
            <div className="slip">
              <span className="se">worth about</span>
              <b>{value > 0 ? cad(value) : 'CA$—'}</b>
              <span className="se small" title={PRICE_METHOD}>
                est. · your printings and finishes · {fetchedNote(entries.map((e) => cards.get(e.cardId)?.at))}
              </span>
              <span className="warn">warning</span>
              {value > 0 && <span className="stamp">APPRAISED</span>}
            </div>
          </section>

          {/* Import lives in the MY DECKS bar (owner's call, Nov 6): adding cards and decks in one place */}
          <MyDecks
            s={s}
            action={
          <details className="importbox" open={!!busy || !!result || (importOpen ?? (list !== undefined && list.length === 0))} onToggle={(e) => setImportOpen(e.currentTarget.open)}>
            <summary>
              <span className="stripe" aria-hidden="true" />
              <b>+ IMPORT CARDS</b>
              <span className="chev" aria-hidden="true">
                ▾
              </span>
            </summary>
          <section className="importrow">
            <div className="flyer gbox">
              <Doodles n={433} count={1} spots={[[70, 60]]} paper />
              <Tape style={{ top: -12, left: 30, width: 80, height: 24, transform: 'rotate(-8deg)' }} />
              <p>ManaBox CSV, a CSV with name/quantity columns, or a text list (Moxfield, Archidekt, "1 Sol Ring").</p>
              <label className="btn ink file">
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
            </div>
            <div className="pastecol">
              <label className="notebook">
                <span>…or paste here</span>
                <textarea className="ruled" rows={4} placeholder={'1 Sol Ring\n1x Arcane Signet (CMM) 375_'} value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <div className="btnrow slimbtns">
                <button className="btn" disabled={!text.trim() || !!busy} onClick={() => run(text, false)}>
                  + ADD
                </button>
                <button className="btn secondary" disabled={!text.trim() || !!busy} onClick={() => run(text, true)} title={`Replace every card in ${name} with this list`}>
                  REPLACE
                </button>
              </div>

              {busy && <Progress {...busy} />}
              {error && <p className="error">{error}</p>}
              {result && <ImportReport r={result} />}
            </div>
          </section>
          </details>
            }
          />

          {illegal > 0 && (
            <p className="count">
              {illegal} {illegal === 1 ? 'card is' : 'cards are'} not legal in Commander (tokens, Un-cards, banned): kept in the binder, not counted as owned for decks.
            </p>
          )}

          </details>

        <section>
          <CardsView
            title={
              <h2 aria-label="Card collection" className="colltitle">
                <Ransom text="CARD COLLECTION" size={30} seed={5} />
              </h2>
            }
            entries={shown}
            cards={cards}
            profile={profile}
            binderName={name}
            q={q}
            setQ={setQ}
            more={
              <>
                <button className="sticker" disabled={!entries.length} onClick={() => download(file('csv'), collectionCsv(entries), 'text/csv')}>
                  EXPORT CSV
                </button>
                <button className="sticker" disabled={!entries.length} onClick={() => download(file('txt'), collectionText(entries))}>
                  EXPORT TEXT
                </button>
              </>
            }
          />
        </section>
      </main>
    </>
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
          {binders.length > 1 &&
            binders.map((b) => (
              <button key={b.id} role="menuitemradio" aria-checked={b.id === profile} onClick={act(() => b.id !== profile && onPick?.(b.id))}>
                {b.id === profile ? '● ' : '○ '}
                {b.name}
              </button>
            ))}
          <button role="menuitem" onClick={act(add)}>
            + New binder
          </button>
          <button role="menuitem" onClick={act(rename)}>
            ✎ Rename
          </button>
          <hr />
          {sync && (
            <button role="menuitem" className={sync.alert ? 'alert' : ''} onClick={act(sync.open)}>
              ⟳ SYNC <small>{sync.label}</small>
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
            ⚠ Reset (empty this binder)
          </button>
          {binders.length > 1 && (
            <button role="menuitem" className="danger" onClick={act(remove)}>
              ✕ Delete this binder
            </button>
          )}
        </div>
      )}
    </div>
  );
}

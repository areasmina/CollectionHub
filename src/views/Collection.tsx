import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { importCollection, resetProfile, type ImportResult } from '../lib/actions';
import { db, type Card, type Entry } from '../lib/db';
import { collectionCsv, collectionText, download } from '../lib/export';
import { cad, toCad } from '../lib/prices';
import { CardsView } from './CardsView';
import { MyDecks } from './MyDecks';
import type { Shared } from './shared';
import { isCommander } from './Discover';
import { fetchedNote, PRICE_METHOD } from '../lib/prices';
import { cardsByIds } from '../lib/scryfall';
import { movers, snapshot, snapshotFrom, type Move } from '../lib/pricewatch';
import { PriceLink, priced, priceSum, Progress, Thumb } from './shared';
import { Doodles, PageDecor, Ransom, Tape, Title } from './zine';

export function ImportReport({ r }: { r: ImportResult }) {
  return (
    <div className="report" role="status">
      <p>
        Read as <b>{r.format === 'manabox' ? 'ManaBox CSV' : r.format === 'csv' ? 'CSV' : 'text list'}</b>: {r.added} cards added.
      </p>
      {r.unmatched.length > 0 && (
        <details>
          <summary className="error">{r.unmatched.length} names Scryfall couldn't find (not added)</summary>
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

type Panel = { key: string; title: string; sub: string; rows: { e: Entry; card: Card; label: string; tone?: 'up' | 'down'; why?: string }[]; empty?: string };

/** Rotating "top 3" widget: most valuable, highest total, 3-day risers, 3-day fallers. Every 4 s; hover pauses,
 *  a click (not on a card) goes to the next one. */
function TopWidget({ entries, cards }: { entries: Entry[]; cards: Map<string, Card> }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [past, setPast] = useState<Awaited<ReturnType<typeof snapshotFrom>>>(null);
  useEffect(() => void snapshotFrom(3).then(setPast), [entries.length, cards.size]);
  const unit = (e: Entry) => Number(priced(cards.get(e.cardId), e.foil)?.usd ?? 0);
  const uniq = (xs: Entry[]) => xs.filter((x, j, a) => a.findIndex((y) => cards.get(y.cardId)?.key === cards.get(x.cardId)?.key) === j);
  const owned = entries.filter((e) => cards.get(e.cardId) && unit(e) > 0);
  const byUnit = uniq([...owned].sort((a, b) => unit(b) - unit(a))).slice(0, 3);
  const byTotal = uniq([...owned].sort((a, b) => unit(b) * b.qty - unit(a) * a.qty)).slice(0, 3);
  const since = past ? new Date(past.day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const moveRows = (ms: Move[], tone: 'up' | 'down') =>
    ms.map((m) => ({ e: m.entry, card: cards.get(m.entry.cardId)!, tone, label: `${m.diff > 0 ? '▲' : '▼'} ${cad(Math.abs(toCad(String(m.diff)) ?? 0))}`, why: `${m.diff > 0 ? '+' : '−'}${Math.round((Math.abs(m.diff) / m.was) * 100)}%: ${cad(toCad(String(m.was)) ?? 0)} → ${cad(toCad(String(m.now)) ?? 0)}` }));
  const panels: Panel[] = [
    { key: 'unit', title: 'MOST VALUABLE', sub: 'per copy', rows: byUnit.map((e) => ({ e, card: cards.get(e.cardId)!, label: cad(toCad(String(unit(e))) ?? 0) })) },
    { key: 'total', title: 'BIGGEST HOLDINGS', sub: 'price × copies', rows: byTotal.map((e) => ({ e, card: cards.get(e.cardId)!, label: `${e.qty}× · ${cad(toCad(String(unit(e) * e.qty)) ?? 0)}` })) },
    { key: 'up', title: 'RISING', sub: past ? `since ${since}` : 'last 3 days', rows: past ? moveRows(movers(entries, cards, past.prices, 'up'), 'up') : [], empty: past ? 'Nothing went up.' : 'Collecting prices: risers show up after a day or two.' },
    { key: 'down', title: 'FALLING', sub: past ? `since ${since}` : 'last 3 days', rows: past ? moveRows(movers(entries, cards, past.prices, 'down'), 'down') : [], empty: past ? 'Nothing went down.' : 'Collecting prices: fallers show up after a day or two.' },
  ];
  useEffect(() => {
    if (hold || matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setI((x) => (x + 1) % panels.length), 4000);
    return () => clearInterval(t);
  }, [hold]);
  if (!owned.length) return null;
  const p = panels[i % panels.length];
  return (
    <div
      className="topwidget"
      role="region"
      aria-roledescription="carousel"
      aria-label="Collection highlights"
      onMouseEnter={() => setHold(true)}
      onMouseLeave={() => setHold(false)}
      onClick={() => (haptic('tap'), setI((x) => (x + 1) % panels.length))}
    >
      <span className="pen" aria-hidden="true" />
      <div className="twhead">
        <span className={`tlabel ${p.key}`}>
          TOP 3 · {p.title}
        </span>
        <small>{p.sub}</small>
        <span className="twdots" aria-hidden="true">
          {panels.map((x, j) => (
            <i key={x.key} className={j === i % panels.length ? 'on' : ''} />
          ))}
        </span>
      </div>
      <ul key={p.key} aria-live="polite">
        {p.rows.length ? (
          p.rows.map(({ e, card, label, tone, why }, j) => (
            <li key={e.id} style={{ '--i': j - (p.rows.length - 1) / 2 } as React.CSSProperties} onClick={(ev) => ev.stopPropagation()}>
              <Thumb src={card.img?.replace('/small/', '/normal/')} className={`thand xart owned${e.foil ? ' foil' : ''}`} name={e.name} />
              <span className={`tw price tapey y${j} t${j}${tone ? ' ' + tone : ''}`} title={why}>
                {label}
              </span>
            </li>
          ))
        ) : (
          <li className="twempty">{p.empty}</li>
        )}
      </ul>
    </div>
  );
}

export function Collection({ profile, name, s }: { profile: number; name: string; s: Shared }) {
  const list = useLiveQuery(() => db.entries.where('profile').equals(profile).sortBy('name'), [profile]);
  const entries = list ?? [];
  // Import folds away; it opens by itself for an empty binder (and stays open while an import runs).
  const [importOpen, setImportOpen] = useState<boolean | null>(null);
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
      setResult(await importCollection(profile, input, replace, (done, total) => setBusy({ done, total })));
      setText('');
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
  const shown = entries.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const file = (ext: string) => `${name.replace(/[^\w-]+/g, '_')}.${ext}`;

  const unique = new Set(entries.map((e) => cards.get(e.cardId)?.key ?? e.name.toLowerCase())).size;
  const illegal = entries.reduce((n, e) => n + (cards.get(e.cardId)?.legal === false ? e.qty : 0), 0);
  const commanders = new Set([...cards.values()].filter((c) => c.legal && isCommander(c.type, c.text)).map((c) => c.key)).size;
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
          <Title text="COLLECTION" label="Collection" size={60} seed={21} />
          <label className="kraft">
            binder name
            <input defaultValue={name} key={name} onBlur={(e) => e.target.value.trim() && db.profiles.update(profile, { name: e.target.value.trim() })} />
          </label>
        </section>

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
          <TopWidget entries={entries} cards={cards} />
        </section>

        {illegal > 0 && (
          <p className="count">
            {illegal} {illegal === 1 ? 'card is' : 'cards are'} not legal in Commander (tokens, Un-cards, banned): kept in the binder, not counted as owned for decks.
          </p>
        )}

        {/* Import sits right under the counts: it's used the most */}
        <details className="importbox" open={!!busy || !!result || (importOpen ?? (list !== undefined && list.length === 0))} onToggle={(e) => setImportOpen(e.currentTarget.open)}>
          <summary>
            <span className="stripe" aria-hidden="true" />
            <b>IMPORT CARDS</b>
            <small>ManaBox CSV, CSV or a text list · add to or replace {name}</small>
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
            <div className="btnrow">
              <button className="btn" disabled={!text.trim() || !!busy} onClick={() => run(text, false)}>
                ADD TO BINDER
              </button>
              <button className="btn secondary" disabled={!text.trim() || !!busy} onClick={() => run(text, true)}>
                REPLACE BINDER
              </button>
            </div>
            {/* Emptying the binder lives with the other whole-binder actions (folded away), not above the card search. */}
            <button style={{ marginTop: 12 }} className="stencil" disabled={!entries.length} onClick={() => confirm(`Delete all cards in ${name}? Decks stay.`) && resetProfile(profile)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1 L15 14 H1 Z M8 6 V9.5 M8 11.5 V12" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              RESET BINDER
            </button>

            {busy && <Progress {...busy} />}
            {error && <p className="error">{error}</p>}
            {result && <ImportReport r={result} />}
          </div>
        </section>
        </details>

        <MyDecks s={s} />

        <section>
          <div className="cardshead">
            <h2 aria-label="Cards">
              <Ransom text="CARDS" size={40} seed={5} />
            </h2>
            <div className="rule" aria-hidden="true" />
          </div>

          <CardsView
            entries={shown}
            cards={cards}
            profile={profile}
            binderName={name}
            search={
              <label className="sbox dark">
                <span className="tab">SEARCH</span>
                <input type="search" placeholder="card name_" value={q} onChange={(e) => setQ(e.target.value)} />
                <span aria-hidden="true" className="fade" />
              </label>
            }
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

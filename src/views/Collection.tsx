import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { importCollection, resetProfile, type ImportResult } from '../lib/actions';
import { db, type Card } from '../lib/db';
import { collectionCsv, collectionText, download } from '../lib/export';
import { cad } from '../lib/prices';
import { CardsView } from './CardsView';
import { isCommander } from './Discover';
import { PriceLink, priceSum, Progress, Thumb } from './shared';
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

export function Collection({ profile, name }: { profile: number; name: string }) {
  const entries = useLiveQuery(() => db.entries.where('profile').equals(profile).sortBy('name'), [profile]) ?? [];
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
  const value = priceSum(entries.map((e) => ({ card: cards.get(e.cardId), qty: e.qty })));
  const shown = entries.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()));
  const file = (ext: string) => `${name.replace(/[^\w-]+/g, '_')}.${ext}`;

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
          <div className="stat" style={{ transform: 'rotate(-1deg)' }}>
            <span className="worn" aria-hidden="true" />
            <b>{total.toLocaleString()}</b>
            <span>cards</span>
          </div>
          <div className="stat" style={{ transform: 'rotate(.8deg)' }}>
            <span className="worn" aria-hidden="true" />
            <b>{entries.length.toLocaleString()}</b>
            <span>entries</span>
          </div>
          <div className="stat red gbox" style={{ transform: 'rotate(-1.4deg)' }}>
            <span className="worn" aria-hidden="true" />
            <b>{commanders.toLocaleString()}</b>
            <span>commanders</span>
            <Doodles n={377} count={1} spots={[[70, -20]]} />
          </div>
          <div className="slip">
            <span className="se">worth about</span>
            <b>{value > 0 ? cad(value) : 'CA$—'}</b>
            <span className="se small">est. · Scryfall prices of your printings</span>
            <span className="warn">warning</span>
            {value > 0 && <span className="stamp">APPRAISED</span>}
          </div>
        </section>

        <section className="importrow">
          <div className="flyer gbox">
            <Doodles n={433} count={1} spots={[[70, 60]]} paper />
            <Tape style={{ top: -12, left: 30, width: 80, height: 24, transform: 'rotate(-8deg)' }} />
            <div className="hd">
              <div className="stripe" aria-hidden="true" />
              <h2>IMPORT</h2>
            </div>
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
              <textarea className="ruled" rows={6} placeholder={'1 Sol Ring\n1x Arcane Signet (CMM) 375_'} value={text} onChange={(e) => setText(e.target.value)} />
            </label>
            <div className="btnrow">
              <button className="btn" disabled={!text.trim() || !!busy} onClick={() => run(text, false)}>
                ADD TO BINDER
              </button>
              <button className="btn secondary" disabled={!text.trim() || !!busy} onClick={() => run(text, true)}>
                REPLACE BINDER
              </button>
            </div>
            {busy && <Progress {...busy} />}
            {error && <p className="error">{error}</p>}
            {result && <ImportReport r={result} />}
          </div>
        </section>

        <section>
          <div className="cardshead">
            <h2 aria-label="Cards">
              <Ransom text="CARDS" size={40} seed={5} />
            </h2>
            <div className="rule" aria-hidden="true" />
            <button className="sticker" style={{ transform: 'rotate(-2deg)' }} disabled={!entries.length} onClick={() => download(file('csv'), collectionCsv(entries), 'text/csv')}>
              EXPORT CSV
            </button>
            <button className="sticker" style={{ transform: 'rotate(1.5deg)' }} disabled={!entries.length} onClick={() => download(file('txt'), collectionText(entries))}>
              EXPORT TEXT
            </button>
            <button className="stencil" disabled={!entries.length} onClick={() => confirm(`Delete all cards in ${name}? Decks stay.`) && resetProfile(profile)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1 L15 14 H1 Z M8 6 V9.5 M8 11.5 V12" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
              RESET BINDER
            </button>
          </div>

          <label className="sbox dark" style={{ marginTop: 18 }}>
            <span className="tab">SEARCH</span>
            <input type="search" placeholder="card name_" value={q} onChange={(e) => setQ(e.target.value)} />
            <span aria-hidden="true" className="fade" />
          </label>

          <CardsView entries={shown} cards={cards} />
        </section>
      </main>
    </>
  );
}

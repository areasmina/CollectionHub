import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { importCollection, resetProfile, type ImportResult } from '../lib/actions';
import { db, type Card } from '../lib/db';
import { collectionCsv, collectionText, download } from '../lib/export';
import { money, priceSum, Progress, Thumb, usd } from './shared';

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

  return (
    <section>
      <h1>Collection</h1>
      <div className="row">
        <label className="grow">
          Binder name{' '}
          <input defaultValue={name} key={name} onBlur={(e) => e.target.value.trim() && db.profiles.put({ id: profile, name: e.target.value.trim() })} />
        </label>
      </div>
      <p className="muted">
        {total.toLocaleString()} cards ({entries.length.toLocaleString()} entries){value > 0 && ` · worth about ${money(value)} (Scryfall prices of your printings)`}.
      </p>

      <h2>Import</h2>
      <p className="muted">ManaBox CSV, a CSV with name/quantity columns, or a text list (Moxfield, Archidekt, "1 Sol Ring").</p>
      <label className="file">
        Choose a file
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
      <textarea rows={5} placeholder={'…or paste here\n1 Sol Ring\n1x Arcane Signet (CMM) 375'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Cards to import" />
      <div className="row">
        <button disabled={!text.trim() || !!busy} onClick={() => run(text, false)}>
          Add to binder
        </button>
        <button disabled={!text.trim() || !!busy} onClick={() => run(text, true)}>
          Replace binder
        </button>
      </div>
      {busy && <Progress {...busy} />}
      {error && <p className="error">{error}</p>}
      {result && <ImportReport r={result} />}

      <h2>Cards</h2>
      <div className="row">
        <button disabled={!entries.length} onClick={() => download(file('csv'), collectionCsv(entries), 'text/csv')}>
          Export CSV
        </button>
        <button disabled={!entries.length} onClick={() => download(file('txt'), collectionText(entries))}>
          Export text
        </button>
        <button className="danger" disabled={!entries.length} onClick={() => confirm(`Delete all cards in ${name}? Decks stay.`) && resetProfile(profile)}>
          Reset binder
        </button>
      </div>
      <input type="search" placeholder="Search cards" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search cards" />
      <ul className="cards">
        {shown.slice(0, limit).map((e) => (
          <li key={e.id} className="card owned">
            <span className="qty">{e.qty}</span>
            <Thumb src={cards.get(e.cardId)?.img} />
            <span className="cname">
              {e.name} <small className="muted">{[e.set?.toUpperCase(), e.cn, e.foil && 'foil'].filter(Boolean).join(' ')}</small>
            </span>
            <small className="right">{usd(cards.get(e.cardId))}</small>
            <button className="icon" aria-label={`Remove ${e.name}`} onClick={() => db.entries.delete(e.id!)}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      {shown.length > limit && <button onClick={() => setLimit(limit + 200)}>Show more ({shown.length - limit} left)</button>}
    </section>
  );
}

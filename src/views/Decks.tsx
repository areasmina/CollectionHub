import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { cheapest, resolveRows, withCheapest } from '../lib/scryfall';
import { importDeck, type ImportResult } from '../lib/actions';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card, type Cheap, type Deck } from '../lib/db';
import { norm } from '../lib/names';
import { deckCsv, deckText, download } from '../lib/export';
import { ImportReport } from './Collection';
import { CardLine, money, priceSum, Progress, type Shared } from './shared';

function DeckView({ deck, s, onBack }: { deck: Deck; s: Shared; onBack: () => void }) {
  const sum = summarize(deck.cards.map((c) => c.name), s.mine, s.other);
  const byKey = useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(deck.cards.map((c) => norm(c.name))).sortBy('key')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, c])), [deck]) ?? new Map<string, Card>();
  const cheap = useLiveQuery(async () => new Map((await db.cheap.bulkGet(deck.cards.map((c) => norm(c.name)))).filter(Boolean).map((c) => [c!.key, c!])), [deck]) ?? new Map<string, Cheap>();
  const cardOf = (name: string) => withCheapest(byKey.get(norm(name)), cheap);
  // Decks saved from EDHREC hold names only: look up any card not cached yet (images), then cheapest prices.
  useEffect(() => {
    resolveRows(deck.cards.map((c) => ({ name: c.name, qty: c.qty })), () => {})
      .then(() => cheapest(deck.cards.map((c) => c.name)))
      .catch(() => {});
  }, [deck.id]);
  const missingCost = priceSum(deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ card: cardOf(c.name), qty: c.qty })));
  const file = (ext: string) => `${deck.name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const cards = [...deck.cards].sort((a, b) => Number(b.name === deck.commander) - Number(a.name === deck.commander));
  return (
    <section>
      <button className="link" onClick={onBack}>
        ← Decks
      </button>
      <h1>{deck.name}</h1>
      {deck.commander && <p className="muted">Commander: {deck.commander}</p>}
      <div className="summary">
        <strong>{sum.pct}%</strong> owned · {sum.missing + sum.other} missing{sum.other > 0 && ` (${sum.other} in ${s.otherName})`}
        {byKey.size > 0 && ` · missing cards ≈ ${money(missingCost)}`}
      </div>
      <div className="row">
        <button onClick={() => download(file('txt'), deckText(deck))}>Export text</button>
        <button onClick={() => download(file('csv'), deckCsv(deck), 'text/csv')}>Export CSV</button>
        <button
          className="danger"
          onClick={async () => {
            if (confirm(`Delete deck "${deck.name}"?`)) {
              await db.decks.delete(deck.id!);
              onBack();
            }
          }}
        >
          Delete
        </button>
      </div>
      <ul className="cards">
        {cards.map((c) => (
          <CardLine key={c.name} name={c.name} card={cardOf(c.name)} s={s} right={c.qty > 1 ? `×${c.qty}` : c.name === deck.commander ? 'Commander' : undefined} />
        ))}
      </ul>
    </section>
  );
}

export function Decks(s: Shared) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const deck = decks.find((d) => d.id === open);
  if (deck) return <DeckView deck={deck} s={s} onBack={() => setOpen(null)} />;

  async function add() {
    setError('');
    setBusy({ done: 0, total: 0 });
    try {
      const r = await importDeck(s.profile, name.trim(), text, (done, total) => setBusy({ done, total }));
      setResult({ format: 'text', added: r.deck.cards.reduce((n, c) => n + c.qty, 0), unmatched: r.unmatched, errors: r.errors });
      setName('');
      setText('');
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  return (
    <section>
      <h1>Decks</h1>
      {decks.length === 0 && <p className="muted">No decks in this binder yet.</p>}
      <ul className="decks">
        {decks.map((d) => {
          const sum = summarize(d.cards.map((c) => c.name), s.mine, s.other);
          return (
            <li key={d.id}>
              <button onClick={() => setOpen(d.id!)}>
                <span>{d.name}</span>
                <small className="muted">
                  {d.cards.reduce((n, c) => n + c.qty, 0)} cards · {sum.pct}% owned
                </small>
              </button>
            </li>
          );
        })}
      </ul>
      <h2>Add a deck</h2>
      <input placeholder="Deck name" value={name} onChange={(e) => setName(e.target.value)} aria-label="Deck name" />
      <label className="file">
        Choose a file
        <input
          type="file"
          accept=".txt,.csv,text/plain,text/csv"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setText(await f.text());
            if (!name) setName(f.name.replace(/\.\w+$/, ''));
          }}
        />
      </label>
      <textarea rows={6} placeholder={'Commander\n1 Atraxa, Praetors\' Voice\n\nDeck\n1 Sol Ring'} value={text} onChange={(e) => setText(e.target.value)} aria-label="Decklist" />
      <button disabled={!name.trim() || !text.trim() || !!busy} onClick={add}>
        Save deck
      </button>
      {busy && <Progress {...busy} />}
      {error && <p className="error">{error}</p>}
      {result && <ImportReport r={result} />}
    </section>
  );
}

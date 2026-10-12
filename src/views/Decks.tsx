import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { importDeck, type ImportResult } from '../lib/actions';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card, type Cheap, type Deck } from '../lib/db';
import { deckCsv, deckText, download } from '../lib/export';
import { norm } from '../lib/names';
import { cad } from '../lib/prices';
import { cheapest, resolveRows, withCheapest } from '../lib/scryfall';
import { ImportReport } from './Collection';
import { CardLine, priceSum, Progress, type Shared } from './shared';
import { Doodles, PageDecor, Pips, Tape, Title, Xgrain } from './zine';

function DeckView({ deck, s, onBack }: { deck: Deck; s: Shared; onBack: () => void }) {
  const sum = summarize(deck.cards.map((c) => c.name), s.mine, s.other);
  const byKey =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(deck.cards.map((c) => norm(c.name))).sortBy('key')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, c])), [deck]) ??
    new Map<string, Card>();
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
    <>
      <PageDecor seed={902} rays="80% 14%" sheet={{ side: 'left', top: 700, rot: 8 }} />
      <main>
        <button className="backlink" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11 2 L4 8 L11 14" fill="none" stroke="#E60012" strokeWidth="3" />
          </svg>
          DECKS
        </button>
        <Title text={deck.name.toUpperCase().slice(0, 40)} label={deck.name} size={deck.name.length > 24 ? 34 : 46} seed={33} />
        {deck.commander && <p className="count">Commander: {deck.commander}</p>}
        <section className="strip" aria-label="Deck totals">
          <div className="cell wide">
            <span className="lbl">COLLECTION MATCH</span>
            <div className="match" role="img" aria-label={`${sum.pct}% owned in ${s.binderName}`}>
              <span className="burst" aria-hidden="true" />
              <span className="num">{sum.pct}%</span>
              <span className="meter">
                <span className="cells10" aria-hidden="true">
                  {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} className={(i + 1) * 10 <= sum.pct + 5 ? 'on' : ''} />
                  ))}
                </span>
                <small>
                  {sum.missing + sum.other} missing{sum.other > 0 ? ` (${sum.other} in ${s.otherName})` : ''}
                </small>
              </span>
            </div>
          </div>
          <div className="cell">
            <span className="lbl">MISSING</span>
            <div className="plate" role="img" aria-label={`Missing cards cost about ${cad(missingCost)}`}>
              <span className="wedge" aria-hidden="true">
                <svg width="24" height="22" viewBox="0 0 24 22">
                  <path d="M12 1 L23 21 H1 Z" fill="#FFCC00" />
                  <path d="M12 8 V14 M12 16.5 V18" stroke="#0A0A0A" strokeWidth="2.6" strokeLinecap="square" />
                </svg>
              </span>
              <span className="amt">
                <small>≈</small>
                {byKey.size ? cad(missingCost) : 'CA$—'}
              </span>
            </div>
          </div>
          <div className="cell">
            <span className="lbl">EXPORT</span>
            <div className="btnrow">
              <button className="sticker" onClick={() => download(file('txt'), deckText(deck))}>
                TEXT
              </button>
              <button className="sticker" onClick={() => download(file('csv'), deckCsv(deck), 'text/csv')}>
                CSV
              </button>
            </div>
          </div>
          <div className="cell">
            <span className="lbl">DELETE</span>
            <button
              className="stencil"
              onClick={async () => {
                if (confirm(`Delete deck "${deck.name}"?`)) {
                  await db.decks.delete(deck.id!);
                  onBack();
                }
              }}
            >
              DELETE DECK
            </button>
          </div>
        </section>
        <div className="deckgrid">
          <div className="lists">
            <div className="cat">
              <ul className="zlist">
                {cards.map((c) => (
                  <CardLine key={c.name} name={c.name} card={cardOf(c.name)} s={s} note={c.qty > 1 ? `×${c.qty}` : c.name === deck.commander ? 'Commander' : ''} />
                ))}
              </ul>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

export function Decks(s: Shared) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const cmdrs =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? '')).filter(Boolean)).toArray()).map((c) => [c.key, c])), [decks]) ?? new Map<string, Card>();
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
    <>
      <PageDecor seed={902} rays="80% 14%" sheet={{ side: 'left', top: 700, rot: 8 }} />
      <main>
        <section style={{ display: 'inline-block', marginTop: 24 }}>
          <Title text="DECKS" label="Decks" size={72} seed={33} />
        </section>
        <p className="count" style={{ color: 'var(--text)' }}>
          {decks.length} {decks.length === 1 ? 'deck' : 'decks'} in {s.binderName}
          <span className="cur">_</span>
        </p>
        <ul className="dgrid">
          {decks.map((d, i) => {
            const sum = summarize(d.cards.map((c) => c.name), s.mine, s.other);
            const c = cmdrs.get(norm(d.commander ?? ''));
            return (
              <li key={d.id}>
                <button className="dcard gbox" onClick={() => setOpen(d.id!)}>
                  {i === 0 && <Doodles n={433} count={2} spots={[[64, 50], [70, -8]]} paper />}
                  <span className="rule" aria-hidden="true" />
                  <span className="ytape" aria-hidden="true" />
                  <span className={statusOf(d.commander ?? '', s.mine) === 'owned' ? 'xart owned' : 'xart'} aria-hidden="true">
                    {c?.img && <img src={c.img.replace('/small/', '/normal/')} alt="" loading="lazy" />}
                    {statusOf(d.commander ?? '', s.mine) !== 'owned' && <Xgrain />}
                  </span>
                  <span className="t">
                    <b>{d.name}</b>
                    <span>
                      {d.cards.reduce((n, x) => n + x.qty, 0)} cards · {sum.pct}% owned
                    </span>
                    {c && <Pips ci={c.ci} size={24} />}
                  </span>
                  {sum.pct === 100 && <span className="stamp">READY TO SLEEVE!</span>}
                </button>
              </li>
            );
          })}
          <li className="dempty">
            your next deck goes here.
            <br />
            save one from a commander page
            <br />
            or paste a list below ↓
          </li>
        </ul>

        <section className="addpage graph gbox">
          <Doodles n={477} count={2} spots={[[70, 4], [78, 60]]} paper />
          <span className="holes" aria-hidden="true" />
          <Tape style={{ top: -10, right: 50, width: 100, height: 24, transform: 'rotate(6deg)' }} />
          <div className="hd">
            <div className="stripe" aria-hidden="true" />
            <h2>ADD A DECK</h2>
          </div>
          <label>
            deck name
            <input placeholder="e.g. Atraxa superfriends_" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="btn ink file">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 12 V15 H15 V12 M9 3 V11 M5 7 L9 3 L13 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            CHOOSE A FILE
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
          <label>
            …or paste the list
            <textarea className="graph" rows={7} placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring_"} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button className="btn save" disabled={!name.trim() || !text.trim() || !!busy} onClick={add}>
            SAVE DECK
          </button>
          {busy && <Progress {...busy} />}
          {error && <p className="error">{error}</p>}
          {result && <ImportReport r={result} />}
        </section>
      </main>
    </>
  );
}

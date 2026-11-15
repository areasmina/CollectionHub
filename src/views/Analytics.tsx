import { useEffect, useMemo, useState } from 'react';
import { allSnapshots, analyse, type Slice } from '../lib/analytics';
import type { Card, Deck, Entry } from '../lib/db';
import { haptic } from '../lib/haptics';
import { cad, toCad } from '../lib/prices';

/**
 * Collection analytics (roadmap P2.5): what your binder is made of, and what it has been worth.
 * It reads what the app already keeps — your cards, your decks and the daily price snapshots — and saves nothing.
 * The history starts at your first snapshot and covers two weeks, which is as long as those are kept.
 */
const money = (usd: number) => cad(toCad(usd) ?? 0);
const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** One bar of a chart: a torn strip whose length is its share, with the count and value on it. */
function Bar({ s, of, tone }: { s: Slice; of: number; tone?: string }) {
  return (
    <li className={`abar${tone ? ` ${tone}` : ''}`} style={{ '--w': `${pct(s.cards, of)}%` } as React.CSSProperties}>
      <span className="alabel">{s.label}</span>
      <span className="atrack" aria-hidden="true">
        <span className="afill" />
      </span>
      <span className="acount">{s.cards.toLocaleString()}</span>
      {s.usd > 0 && <span className="avalue">{money(s.usd)}</span>}
    </li>
  );
}

function Chart({ title, note, slices, tone }: { title: string; note?: string; slices: Slice[]; tone?: string }) {
  const of = Math.max(1, ...slices.map((s) => s.cards));
  const shown = slices.filter((s) => s.cards > 0);
  if (!shown.length) return null;
  return (
    <section className="acard">
      <h3>
        {title}
        {note && <small>{note}</small>}
      </h3>
      <ul className="abars">
        {shown.map((s) => (
          <Bar key={s.key} s={s} of={of} tone={tone} />
        ))}
      </ul>
    </section>
  );
}

/** Value over time: one point per day a snapshot exists, drawn as a line you can read at a glance. */
function History({ points }: { points: { day: string; usd: number }[] }) {
  if (points.length < 2)
    return (
      <section className="acard">
        <h3>WORTH OVER TIME</h3>
        <p className="anone">
          {points.length === 1 ? 'One day recorded so far. ' : 'No days recorded yet. '}
          Prices are saved once a day while you use the app, so the line starts filling in from tomorrow (two weeks are kept).
        </p>
      </section>
    );
  const lo = Math.min(...points.map((p) => p.usd));
  const hi = Math.max(...points.map((p) => p.usd));
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 46 - ((v - lo) / span) * 40;
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(p.usd).toFixed(2)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const diff = last.usd - first.usd;
  const day = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return (
    <section className="acard awide">
      <h3>
        WORTH OVER TIME
        <small>
          since {day(first.day)} · {points.length} {points.length === 1 ? 'day' : 'days'}
        </small>
      </h3>
      <p className={`atrend ${diff >= 0 ? 'up' : 'down'}`}>
        <b>{money(last.usd)}</b>
        <span>
          {diff >= 0 ? '▲' : '▼'} {money(Math.abs(diff))} since {day(first.day)}
        </span>
      </p>
      <svg className="aline" viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label={`Worth over time: ${money(first.usd)} on ${day(first.day)}, ${money(last.usd)} on ${day(last.day)}`}>
        <path d={`${d} L 100 50 L 0 50 Z`} className="aarea" />
        <path d={d} className="apath" />
      </svg>
      <p className="afoot">
        Your cards today, priced at each day's prices, so the line moves only when prices move. Scryfall prices, in CA$.
      </p>
    </section>
  );
}

export function Analytics({ entries, cards, decks, binder, onClose }: { entries: Entry[]; cards: Map<string, Card>; decks: Deck[]; binder: string; onClose: () => void }) {
  const [snaps, setSnaps] = useState<Awaited<ReturnType<typeof allSnapshots>>>([]);
  useEffect(() => void allSnapshots().then(setSnaps).catch(() => {}), []);
  const a = useMemo(() => analyse(entries, cards, decks, snaps), [entries, cards, decks, snaps]);
  const of = a.unique || 1;
  return (
    <section className="apanel" aria-label={`Analytics for ${binder}`}>
      <div className="ahead">
        <h2>ANALYTICS</h2>
        <small>{binder}</small>
        <button type="button" className="aclose" onClick={() => (haptic('tap'), onClose())} aria-label="Close analytics">
          ✕ CLOSE
        </button>
      </div>
      <p className="asum">
        <b>{a.cards.toLocaleString()}</b> copies · <b>{a.unique.toLocaleString()}</b> different cards · worth about <b>{money(a.usd)}</b>
      </p>
      <div className="agrid">
        <History points={a.history} />
        <section className="acard">
          <h3>
            IN YOUR DECKS
            <small>
              {a.inDecks.decks} {a.inDecks.decks === 1 ? 'deck' : 'decks'}
            </small>
          </h3>
          <p className="atrend">
            <b>{pct(a.inDecks.used, of)}%</b>
            <span>
              {a.inDecks.used.toLocaleString()} of your cards are in a deck · {a.inDecks.idle.toLocaleString()} sit idle
            </span>
          </p>
          <ul className="abars">
            <Bar s={{ key: 'used', label: 'In a deck', cards: a.inDecks.used, usd: 0 }} of={of} tone="good" />
            <Bar s={{ key: 'idle', label: 'Idle', cards: a.inDecks.idle, usd: 0 }} of={of} />
          </ul>
        </section>
        <Chart title="COLOURS" note="by colour identity" slices={a.colours} tone="col" />
        <Chart title="MANA CURVE" note="lands left out" slices={a.curve} />
        <Chart title="CARD TYPES" slices={a.types} />
        <Chart title="BIGGEST SETS" note="top 8" slices={a.sets} />
      </div>
    </section>
  );
}

export default Analytics;

import { useEffect, useMemo, useState } from 'react';
import { allSnapshots, analyse, type Slice } from '../lib/analytics';
import type { Card, Deck, Entry } from '../lib/db';
import { cad, toCad } from '../lib/prices';
import { KEEP_DAYS, mergeWorth, worthLog, worthReadings, type WorthDay } from '../lib/worthlog';

/**
 * Collection analytics (roadmap P2.5; the full analysis page, Phase 2 of Nov 23): what your binder is made of, and
 * what it has been worth. It reads what the app already keeps: your cards, your decks, the daily price snapshots
 * (two weeks) and the daily worth log (`lib/worthlog`, a year). This panel itself saves nothing.
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

const day = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** Worth over time: one point per day, the line full width, and three readings beside it (today, change, best day). */
function History({ points }: { points: WorthDay[] }) {
  const r = worthReadings(points);
  if (!r || points.length < 2)
    return (
      <section className="acard awide ahistory">
        <h3>WORTH OVER TIME</h3>
        <p className="anone">
          {points.length === 1 ? 'One day recorded so far. ' : 'No days recorded yet. '}
          The binder's worth is saved once a day while you use the app, so the line fills in from tomorrow (a year is kept).
        </p>
      </section>
    );
  const lo = Math.min(...points.map((p) => p.usd));
  const hi = Math.max(...points.map((p) => p.usd));
  const span = hi - lo || 1;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (v: number) => 46 - ((v - lo) / span) * 40;
  const d = points.map((p, i) => `${i ? 'L' : 'M'} ${x(i).toFixed(2)} ${y(p.usd).toFixed(2)}`).join(' ');
  const up = r.change >= 0;
  return (
    <section className="acard awide ahistory">
      <h3>
        WORTH OVER TIME
        <small>
          since {day(r.first.day)} · {points.length} {points.length === 1 ? 'day' : 'days'}
        </small>
      </h3>
      <dl className="areads">
        <div>
          <dt>{r.today.day === new Date().toISOString().slice(0, 10) ? 'today' : day(r.today.day)}</dt>
          <dd>{money(r.today.usd)}</dd>
        </div>
        <div className={up ? 'up' : 'down'}>
          <dt>since {day(r.first.day)}</dt>
          <dd>
            {up ? '▲' : '▼'} {money(Math.abs(r.change))}
          </dd>
        </div>
        <div>
          <dt>best day</dt>
          <dd>
            {money(r.best.usd)} <small>{day(r.best.day)}</small>
          </dd>
        </div>
      </dl>
      <svg className="aline" viewBox="0 0 100 50" preserveAspectRatio="none" role="img" aria-label={`Worth over time: ${money(r.first.usd)} on ${day(r.first.day)}, ${money(r.today.usd)} today`}>
        <path d={`${d} L 100 50 L 0 50 Z`} className="aarea" />
        <path d={d} className="apath" />
      </svg>
      <p className="afoot">
        What this binder was worth each day you opened it, at that day's Scryfall prices, in CA$; cards you add or remove
        move it too. Kept for {Math.round(KEEP_DAYS / 30.5)} months.
        {r.estimated > 0 &&
          ` The first ${r.estimated} ${r.estimated === 1 ? 'day is' : 'days are'} estimated: your cards today at that day's saved prices.`}
      </p>
    </section>
  );
}

/** Band 1: the facts the stat tiles above don't already say (cards, unique cards and worth live there). */
function Glance({ sets, dearest, average }: { sets: number; dearest: { name: string; usd: number; foil: boolean } | null; average: number }) {
  return (
    <section className="acard awide aglance" aria-label="At a glance">
      <h3>AT A GLANCE</h3>
      <dl className="areads">
        <div>
          <dt>sets</dt>
          <dd>{sets.toLocaleString()}</dd>
        </div>
        <div>
          <dt>dearest copy</dt>
          <dd>
            {dearest ? money(dearest.usd) : '—'}
            {dearest && (
              <small>
                {dearest.name}
                {dearest.foil ? ' · foil' : ''}
              </small>
            )}
          </dd>
        </div>
        <div>
          <dt>average copy</dt>
          <dd>{average > 0 ? money(average) : '—'}</dd>
        </div>
      </dl>
    </section>
  );
}

export function Analytics({ entries, cards, decks, binder, profile }: { entries: Entry[]; cards: Map<string, Card>; decks: Deck[]; binder: string; profile: number }) {
  const [snaps, setSnaps] = useState<Awaited<ReturnType<typeof allSnapshots>>>([]);
  const [logged, setLogged] = useState<WorthDay[]>([]);
  useEffect(() => void allSnapshots().then(setSnaps).catch(() => {}), []);
  useEffect(() => void worthLog(profile).then(setLogged).catch(() => {}), [profile]);
  const a = useMemo(() => analyse(entries, cards, decks, snaps), [entries, cards, decks, snaps]);
  const line = useMemo(() => mergeWorth(logged, a.history), [logged, a.history]);
  const of = a.unique || 1;
  return (
    // No heading and no totals line here (Guillermo, Nov 15): the ANALYTICS tab names the panel and the stat tiles
    // right above already say how many cards, how many different ones and what they are worth.
    <section className="apanel" aria-label={`Analytics for ${binder}`}>
      <div className="agrid">
        <History points={line} />
        <Glance sets={a.setCount} dearest={a.dearest} average={a.average} />
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
        <Chart title="RARITY" note="copies and what they're worth" slices={a.rarity} />
        <Chart title="BIGGEST SETS" note="top 8" slices={a.sets} />
      </div>
    </section>
  );
}

export default Analytics;

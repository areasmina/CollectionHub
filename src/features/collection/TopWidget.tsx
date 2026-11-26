import { memo, useEffect, useMemo, useState } from 'react';
import type { Card, Entry } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { cad, toCad } from '../../lib/prices';
import { movers, snapshotFrom, type Move } from '../../lib/pricewatch';
import { firstPerKey } from '../../lib/topn';
import { priced, Thumb } from '../../views/shared';

type Panel = { key: string; title: string; sub: string; rows: { e: Entry; card: Card; label: string; tone?: 'up' | 'down'; why?: string }[]; empty?: string };

/** Rotating "top 3" widget: most valuable, highest total, 3-day risers, 3-day fallers. */
export const TopWidget = memo(function TopWidget({ entries, cards }: { entries: Entry[]; cards: Map<string, Card> }) {
  const [i, setI] = useState(0);
  const [hold, setHold] = useState(false);
  const [past, setPast] = useState<Awaited<ReturnType<typeof snapshotFrom>>>(null);
  useEffect(() => void snapshotFrom(3).then(setPast), [entries.length, cards.size]);
  const unit = (e: Entry) => Number(priced(cards.get(e.cardId), e.foil)?.usd ?? 0);
  const { owned, byUnit, byTotal } = useMemo(() => {
    const keyOf = (e: Entry) => cards.get(e.cardId)?.key;
    const owned = entries.filter((e) => cards.get(e.cardId) && unit(e) > 0);
    return {
      owned,
      byUnit: firstPerKey([...owned].sort((a, b) => unit(b) - unit(a)), keyOf, 3),
      byTotal: firstPerKey([...owned].sort((a, b) => unit(b) * b.qty - unit(a) * a.qty), keyOf, 3),
    };
  }, [entries, cards]);
  const since = past ? new Date(past.day + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const moveRows = (ms: Move[], tone: 'up' | 'down') =>
    ms.map((m) => ({
      e: m.entry,
      card: cards.get(m.entry.cardId)!,
      tone,
      label: `${m.diff > 0 ? '▲' : '▼'} ${cad(Math.abs(toCad(String(m.diff)) ?? 0))}`,
      why: `${m.diff > 0 ? '+' : '−'}${Math.round((Math.abs(m.diff) / m.was) * 100)}%: ${cad(toCad(String(m.was)) ?? 0)} → ${cad(toCad(String(m.now)) ?? 0)}`,
    }));
  const panels: Panel[] = [
    { key: 'unit', title: 'MOST VALUABLE', sub: 'per copy', rows: byUnit.map((e) => ({ e, card: cards.get(e.cardId)!, label: cad(toCad(String(unit(e))) ?? 0) })) },
    { key: 'total', title: 'BIGGEST HOLDINGS', sub: 'price × copies', rows: byTotal.map((e) => ({ e, card: cards.get(e.cardId)!, label: `${e.qty}× · ${cad(toCad(String(unit(e) * e.qty)) ?? 0)}` })) },
    { key: 'up', title: 'BIGGEST GAINERS', sub: past ? `since ${since}` : 'last 3 days', rows: past ? moveRows(movers(entries, cards, past.prices, 'up'), 'up') : [], empty: past ? 'No price gains recorded.' : 'Collecting prices: risers show up after a day or two.' },
    { key: 'down', title: 'BIGGEST LOSERS', sub: past ? `since ${since}` : 'last 3 days', rows: past ? moveRows(movers(entries, cards, past.prices, 'down'), 'down') : [], empty: past ? 'No price drops recorded.' : 'Collecting prices: fallers show up after a day or two.' },
  ];
  useEffect(() => {
    if (hold || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
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
      onClick={() => {
        haptic('tap');
        setI((x) => (x + 1) % panels.length);
      }}
    >
      <span className="pen" aria-hidden="true" />
      <div className="twhead">
        <span className={`tlabel ${p.key}`}>TOP 3 · {p.title}</span>
        <small>{p.sub}</small>
      </div>
      <ul key={p.key} aria-live="polite">
        {p.rows.length ? (
          p.rows.map(({ e, card, label, tone, why }, j) => (
            <li key={e.id} onClick={(ev) => ev.stopPropagation()}>
              <Thumb src={card.img?.replace('/small/', '/normal/')} back={card.back} className={`thand xart owned${e.foil ? ' foil' : ''}`} name={e.name} />
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
});

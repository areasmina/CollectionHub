import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState, type ReactNode } from 'react';
import { db, type Card, type Deck } from '../../lib/db';
import { deckColour } from '../../lib/deckcolor';
import { deckSalt, saltMap } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { archidektUrl, spellbookUrl } from '../../lib/links';
import { openDeck } from '../../lib/nav';
import { cad, finishUsd, toCad } from '../../lib/prices';
import { warmMemCards } from '../../lib/scryfall';
import { Ransom } from '../../views/zine';

const binderMemo = new Map<number, Card[]>();

/** Every legal card in a binder, one per name (live). */
export function useBinder(profile: number) {
  const rows = useLiveQuery(async () => {
    const es = await db.entries.where('profile').equals(profile).toArray();
    const cards = (await db.cards.bulkGet([...new Set(es.map((e) => e.cardId))])).filter((c): c is Card => !!c);
    warmMemCards(cards);
    const m = new Map<string, Card>();
    for (const c of cards) if (c.legal && !m.has(c.key)) m.set(c.key, c);
    const out = [...m.values()];
    binderMemo.set(profile, out);
    return out;
  }, [profile]);
  return rows ?? binderMemo.get(profile) ?? [];
}

/** A deck's light: on = active (its cards count as in use in your binder), off = put away. */
export function DeckLight({ deck }: { deck: Deck }) {
  const on = !deck.inactive;
  return (
    <button
      className={`dlight${on ? ' on' : ''}`}
      style={{ '--dc': deckColour(deck) } as React.CSSProperties}
      aria-pressed={on}
      aria-label={`${deck.name}: ${on ? 'active, tap to put it away' : 'put away, tap to make it active'}`}
      title={on ? 'Active: its cards count as in use in your binder' : 'Put away: its cards are free in your binder'}
      onClick={(e) => (e.stopPropagation(), haptic(on ? 'tap' : 'success'), db.decks.update(deck.id!, { inactive: on ? true : undefined }))}
    >
      <i aria-hidden="true" />
      {on ? 'ACTIVE' : 'OFF'}
    </button>
  );
}

export interface Shared {
  profile: number;
  mine: Map<string, number>;
  other: Map<string, number>;
  otherName: string;
  binderName: string;
}

/** Estimated CAD price of a card (TCGplayer USD × daily rate); '≈CA$—' when unknown. */
export const usd = (c?: Card) => (c?.usd ? `≈${cad(toCad(c.usd)!)}` : '≈CA$—');

/** Estimated CAD total × quantity; cards without a USD price are left out. */
export const priceSum = (items: { card?: Card; qty: number }[]) => items.reduce((n, i) => n + (toCad(i.card?.usd) ?? 0) * i.qty, 0);
export const money = (n: number) => `${cad(n)} est.`;
/** The card with the price of the finish you own (foil entries use the foil price). */
export const priced = (c: Card | undefined, foil?: boolean) => (c && foil ? { ...c, usd: finishUsd(c, true) } : c);

/** Scryfall page for a card by exact name. */
export const scryfallUrl = (name: string) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name.split(' // ')[0]}"`)}`;

export const VIEW_KEY = 'ch:cardview';

/** onScroll for sideways chip rows: a light tick each time the row moves past another chip. */
export function snapTick(e: React.UIEvent<HTMLElement>) {
  const el = e.currentTarget;
  const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 120;
  const at = Math.round(el.scrollLeft / Math.max(40, step));
  if (Number(el.dataset.snap ?? -1) !== at) {
    if (el.dataset.snap !== undefined) haptic('tick');
    el.dataset.snap = String(at);
  }
}

/** A choice remembered on this device (view, grouping, sort); falls back when storage is blocked. */
export function useStored<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const [v, set] = useState<T>(() => {
    try {
      const got = localStorage.getItem(key) as T | null;
      return got && allowed.includes(got) ? got : fallback;
    } catch {
      return fallback;
    }
  });
  return [
    v,
    (x: T) => {
      set(x);
      try {
        localStorage.setItem(key, x);
      } catch {
        /* per-device convenience only */
      }
    },
  ];
}

/** `wait` (ms): Scryfall asked us to slow down; the work goes on by itself after the pause. */
export const Progress = ({ done, total, what = 'Looking up cards on Scryfall', wait }: { done: number; total: number; what?: string; wait?: number }) => (
  <div className="progress" role="status">
    <progress value={done} max={total || 1} />{' '}
    <span>
      {total ? `${what}: ${done.toLocaleString()} / ${total.toLocaleString()}` : 'Reading…'}
      {!!wait && <em className="pwait"> Scryfall asked for a short break (about {Math.ceil(wait / 1000)}s). It continues by itself: nothing is lost.</em>}
    </span>
  </div>
);

/** The deck's salt (sum of EDHREC salt scores) on a torn paper scrap; tap shows the saltiest cards. */
export function SaltStat({ names }: { names: string[] }) {
  const [salt, setSalt] = useState<Map<string, number> | null>(null);
  useEffect(() => void saltMap().then(setSalt), []);
  const s = salt && salt.size > 0 ? deckSalt(names, salt) : null;
  if (!s) return null;
  const level = s.total < 15 ? 'LOW' : s.total < 35 ? 'MED' : s.total < 60 ? 'HIGH' : 'SALTY';
  const levelClass = s.total < 15 ? 'low' : s.total < 35 ? 'med' : s.total < 60 ? 'high' : 'extreme';
  return (
    <details className="scrap salt">
      <summary aria-label={`Salt ${s.total.toFixed(1)} (${level}): sum of EDHREC salt scores. Show the saltiest cards`}>
        <span className="k">SALT</span>
        <span className="amt">{s.total.toFixed(1)}</span>
        <span className={`salt-badge ${levelClass}`}>{level}</span>
        {s.top.length > 0 && <span className="caret" aria-hidden="true">▾</span>}
      </summary>
      <ul className="popnote">
        {s.top.map((c) => (
          <li key={c.name}>
            {c.name} <b>{c.salt.toFixed(2)}</b>
          </li>
        ))}
        <li className="small">{s.top.length ? '' : 'No salty cards. '}Sum of EDHREC salt (0–4 per card, player votes) over its top 1,000 saltiest cards.</li>
      </ul>
    </details>
  );
}

/** A deck's name that opens that deck, from any screen. */
export function DeckLink({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <button type="button" className="decklink" onClick={(e) => (e.stopPropagation(), haptic('select'), openDeck(name))} title={`Open ${name}`}>
      {children ?? name}
    </button>
  );
}

/** The three outside sites for a commander: EDHREC, Commander Spellbook, Archidekt. */
export function OutsideLinks({ commander, edhrecPath }: { commander: string; edhrecPath: string }) {
  return (
    <span className="vlinks" aria-label="Open on other sites">
      <a href={`https://edhrec.com/${edhrecPath}`} target="_blank" rel="noreferrer" title="This commander's page on EDHREC">
        EDHREC ↗
      </a>
      <a href={spellbookUrl(commander)} target="_blank" rel="noreferrer" title="Every known combo with this commander, on Commander Spellbook">
        COMBOS ↗
      </a>
      <a href={archidektUrl(commander)} target="_blank" rel="noreferrer" title="Other players' decks with this commander, on Archidekt">
        ARCHIDEKT ↗
      </a>
    </span>
  );
}

/** The one "nothing to show" note (lists, searches, filters). */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="estate" role="status" aria-label={title}>
      <span aria-hidden="true" className="tape" style={{ width: 70, height: 18, top: -9, left: 18, transform: 'rotate(-4deg)' }} />
      <span className="etitle" aria-hidden="true">
        <Ransom text={title.toUpperCase()} size={22} seed={title.length * 7 + 3} />
      </span>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

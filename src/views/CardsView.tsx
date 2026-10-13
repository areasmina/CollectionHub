import { useEffect, useRef, useState } from 'react';
import { db, type Card, type Entry } from '../lib/db';
import { PriceLink, priced, Thumb } from './shared';

/** A per-device preference kept in localStorage (falls back to memory). */
function usePref<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial;
    } catch {
      return initial;
    }
  });
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, x);
    } catch {
      /* per-device convenience only */
    }
  };
  return [v, set];
}

type SetInfo = { code: string; name: string; released: string; icon?: string };
const SKIP_TYPES = ['token', 'memorabilia', 'minigame', 'alchemy', 'treasure_chest', 'vanguard'];

/** Paper Magic sets from Scryfall (one request, cached a week). */
function useSets(enabled: boolean) {
  const [sets, setSets] = useState<SetInfo[]>([]);
  useEffect(() => {
    if (!enabled || sets.length) return;
    (async () => {
      const hit = await db.edhrec.get('scryfall:sets:v2'); // v2: with set icons
      if (hit && Date.now() - hit.at < 7 * 864e5) return setSets(hit.data as SetInfo[]);
      const j = await fetch('https://api.scryfall.com/sets', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .catch(() => null);
      if (!j?.data) return;
      const list: SetInfo[] = j.data
        .filter((x: any) => !x.digital && !SKIP_TYPES.includes(x.set_type))
        .map((x: any) => ({ code: x.code, name: x.name, released: x.released_at ?? '', icon: x.icon_svg_uri }))
        .sort((a: SetInfo, b: SetInfo) => b.released.localeCompare(a.released));
      await db.edhrec.put({ path: 'scryfall:sets:v2', data: list, at: Date.now() });
      setSets(list);
    })();
  }, [enabled]);
  return sets;
}

/** − n + quantity editor; saves to the binder (synced on the next Push). */
function QtyEdit({ e, jinx }: { e: Entry; jinx?: boolean }) {
  const [text, setText] = useState(String(e.qty));
  useEffect(() => setText(String(e.qty)), [e.qty]);
  const save = (n: number) => {
    const q = Math.max(1, Math.min(999, Math.round(n) || 1));
    setText(String(q));
    if (q !== e.qty) db.entries.update(e.id!, { qty: q });
  };
  return (
    <span className={`qtyedit${jinx ? ' jinx' : ''}`} onClick={(ev) => ev.stopPropagation()}>
      {jinx && <small aria-hidden="true">QTY</small>}
      <button aria-label={`One less ${e.name}`} disabled={e.qty <= 1} onClick={() => save(e.qty - 1)}>
        −
      </button>
      <input
        aria-label={`Quantity of ${e.name}`}
        inputMode="numeric"
        value={text}
        onChange={(ev) => setText(ev.target.value.replace(/\D/g, ''))}
        onBlur={() => save(Number(text))}
        onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
      />
      <button aria-label={`One more ${e.name}`} onClick={() => save(e.qty + 1)}>
        +
      </button>
    </span>
  );
}

/** A set's main colour among your cards from it: W U B R G or C (colourless), weighted by copies. A multicolour card
 *  counts toward each of its colours (a white-blue card: half white, half blue), so no "gold" for multicolour. */
function toneOf(list: Entry[], cards: Map<string, Card>) {
  const n = new Map<string, number>();
  for (const e of list) {
    const ci = cards.get(e.cardId)?.ci;
    if (!ci) continue;
    if (!ci.length) n.set('C', (n.get('C') ?? 0) + e.qty);
    for (const c of ci) n.set(c, (n.get(c) ?? 0) + e.qty / ci.length);
  }
  return [...n].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none';
}

/** Grid quantity: spray-painted X tally on the card (X, XX, XXX, XXXX; X12 from 5). Tap it to edit: − n +,
 *  the − turns into a bin at 1. Closes when you tap anywhere else. */
function Tally({ e }: { e: Entry }) {
  const [edit, setEdit] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!edit) return;
    const away = (ev: PointerEvent) => !ref.current?.contains(ev.target as Node) && setEdit(false);
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [edit]);
  const set = (q: number) => db.entries.update(e.id!, { qty: Math.min(999, q) });
  const marks = e.qty <= 4 ? 'X'.repeat(e.qty) : `X${e.qty}`;
  return (
    <span ref={ref} className={`tally${edit ? ' editing' : ''}`} onClick={(ev) => ev.stopPropagation()}>
      {edit ? (
        <span className="tstep">
          {e.qty > 1 ? (
            <button aria-label={`One less ${e.name}`} onClick={() => set(e.qty - 1)}>
              −
            </button>
          ) : (
            <button className="bin" aria-label={`Remove ${e.name}`} onClick={() => confirm(`Remove ${e.name} from this binder?`) && db.entries.delete(e.id!)}>
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M3 4 H13 M6 4 V2 H10 V4 M4 4 L5 14 H11 L12 4" fill="none" stroke="currentColor" strokeWidth="2" />
              </svg>
            </button>
          )}
          <b aria-live="polite">{e.qty}</b>
          <button aria-label={`One more ${e.name}`} onClick={() => set(e.qty + 1)}>
            +
          </button>
        </span>
      ) : (
        <button className="marks" aria-label={`${e.qty} ${e.qty === 1 ? 'copy' : 'copies'} of ${e.name}. Change quantity`} onClick={() => setEdit(true)}>
          {marks}
        </button>
      )}
    </span>
  );
}

const RemoveBtn = ({ e }: { e: Entry }) => (
  <button className="xbtn" aria-label={`Remove ${e.name}`} onClick={() => confirm(`Remove ${e.name} from this binder?`) && db.entries.delete(e.id!)}>
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 2 L12 12 M12 2 L2 12" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  </button>
);

function Items({ list, cards, view }: { list: Entry[]; cards: Map<string, Card>; view: string }) {
  const setLine = (e: Entry) => [e.set?.toUpperCase(), e.cn, e.foil && 'foil'].filter(Boolean).join(' ');
  if (view === 'grid')
    return (
      <ul className="zgrid cgrid2">
        {list.map((e) => (
          <li key={e.id} className="ztile owned ctile">
            <span className="cart">
              <Thumb src={cards.get(e.cardId)?.img?.replace('/small/', '/normal/')} className={`timg xart${e.foil ? ' foil' : ''}`} name={e.name} />
              <PriceLink card={priced(cards.get(e.cardId), e.foil)} tape={e.cardId} />
              <Tally e={e} />
            </span>
            <span className="tname">{e.name}</span>
            <span className="tnote">{setLine(e)}</span>
          </li>
        ))}
      </ul>
    );
  return (
    <>
      <div className="colhead" aria-hidden="true">
        <span>qty</span>
        <span />
        <span>card · set</span>
        <span>each</span>
        <span />
      </div>
      <ul className="crows">
        {list.map((e) => (
          <li key={e.id} className="crow">
            <QtyEdit e={e} />
            <Thumb src={cards.get(e.cardId)?.img} className={`thumb xart${e.foil ? ' foil' : ''}`} name={e.name} />
            <span className="cn">
              <b>{e.name}</b>
              <span>{setLine(e)}</span>
            </span>
            <PriceLink card={priced(cards.get(e.cardId), e.foil)} tape={e.cardId} />
            <RemoveBtn e={e} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** The binder's cards: list or grid, optionally grouped by Magic set. */
export function CardsView({ entries, cards }: { entries: Entry[]; cards: Map<string, Card> }) {
  // Always opens in grid; LIST switches for this visit only.
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [group, setGroup] = usePref<'on' | 'off'>('ch:collgroup', 'off');
  const [hideEmpty, setHideEmpty] = usePref<'on' | 'off'>('ch:collempty', 'on');
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const sets = useSets(group === 'on');

  const bySet = new Map<string, Entry[]>();
  for (const e of entries) {
    const k = (e.set ?? '?').toLowerCase();
    if (!bySet.has(k)) bySet.set(k, []);
    bySet.get(k)!.push(e);
  }
  const known = new Map(sets.map((x) => [x.code, x]));
  const groups: { code: string; name: string; year?: string; icon?: string; list: Entry[] }[] = [
    ...(hideEmpty === 'on' ? sets.filter((x) => bySet.has(x.code)) : sets).map((x) => ({ code: x.code, name: x.name, year: x.released.slice(0, 4), icon: x.icon, list: bySet.get(x.code) ?? [] })),
    ...[...bySet.keys()].filter((k) => !known.has(k)).sort().map((k) => ({ code: k, name: k === '?' ? 'Unknown set' : k.toUpperCase(), list: bySet.get(k)! })),
  ];
  const tone = (list: Entry[]) => toneOf(list, cards);
  const toggle = (code: string) => setOpen((o) => (o.has(code) ? (o.delete(code), new Set(o)) : new Set(o).add(code)));

  return (
    <>
      <div className="cardopts">
        <div className="viewsw" role="group" aria-label="Card view">
          <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
            LIST
          </button>
          <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
            GRID
          </button>
        </div>
        <label className="check">
          <input type="checkbox" checked={group === 'on'} onChange={(e) => setGroup(e.target.checked ? 'on' : 'off')} /> Group by set
        </label>
        {group === 'on' && (
          <label className="check">
            <input type="checkbox" checked={hideEmpty === 'on'} onChange={(e) => setHideEmpty(e.target.checked ? 'on' : 'off')} /> Hide sets with no cards
          </label>
        )}
      </div>

      {group === 'on' ? (
        <div className="setgroups">
          {group === 'on' && !sets.length && <p className="count">Loading Magic sets from Scryfall…</p>}
          {groups.map((g) => {
            const n = g.list.reduce((s, e) => s + e.qty, 0);
            return (
              <details key={g.code} data-col={tone(g.list)} className={`cat setgrp${n ? '' : ' empty'}`} open={open.has(g.code)} onToggle={(ev) => (ev.currentTarget.open !== open.has(g.code) ? toggle(g.code) : null)}>
                <summary>
                  <span className="pm" aria-hidden="true" />
                  <span className="h">
                    {g.name}
                    {g.year && <small className="yr"> {g.year}</small>}
                  </span>
                  <span className="dots" aria-hidden="true" />
                  <span className="n">
                    {g.code.toUpperCase()} · {n} {n === 1 ? 'card' : 'cards'}
                    {g.icon ? <img className="seticon" src={g.icon} alt="" loading="lazy" /> : <span className="seticon" aria-hidden="true" />}
                  </span>
                </summary>
                {open.has(g.code) && (g.list.length ? <Items list={g.list} cards={cards} view={view} /> : <p className="count" style={{ padding: '0 14px 12px' }}>No cards from this set.</p>)}
              </details>
            );
          })}
        </div>
      ) : (
        <>
          <Items list={entries.slice(0, limit)} cards={cards} view={view} />
          {entries.length > limit && (
            <button className="btn secondary more" onClick={() => setLimit(limit + 200)}>
              SHOW MORE ({entries.length - limit} LEFT)
            </button>
          )}
        </>
      )}
    </>
  );
}

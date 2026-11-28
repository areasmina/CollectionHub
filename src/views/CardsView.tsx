import { haptic } from '../lib/haptics';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { db, type Card, type Entry } from '../lib/db';
import { EmptyState, PriceLink, priced, SearchBox, Thumb, useMenuPress } from './shared';
import { Choice, DisplayBtn, OneBar, Sheet } from '../features/shared/OneBar';
import { CardMenu, type Toast } from './CardMenu';
import { YourCopies } from './YourCopies';
import { norm } from '../lib/names';
import { inUse } from '../lib/copies';
import { activeNeed } from '../lib/folders';
import { colourByCard } from '../lib/deckcolor';
import { useLiveQuery } from 'dexie-react-hooks';
import { isCommander } from './Discover';

type MenuFn = (e: Entry, x: number, y: number) => void;
/** A card row / tile with the card menu: right-click, press and hold, or its ⋯ button. */
function MenuLi({ e, onMenu, className, children, tint }: { e: Entry; onMenu?: MenuFn; className: string; children: React.ReactNode; tint?: string }) {
  const press = useMenuPress(onMenu && ((x, y) => onMenu(e, x, y)));
  return (
    <li
      className={`${className}${onMenu ? ' hasmenu' : ''}`}
      style={tint ? ({ '--dc': tint } as React.CSSProperties) : undefined}
      tabIndex={className.includes('ctile') ? 0 : undefined} // a tap selects the card: its price and copies show
      aria-label={className.includes('ctile') ? e.name : undefined}
      {...press}
    >
      {children}
      {onMenu && (
        <button
          className="morebtn"
          aria-label={`More for ${e.name}`}
          title="More (right-click or hold works too)"
          onClick={(ev) => {
            ev.stopPropagation();
            const r = ev.currentTarget.getBoundingClientRect();
            haptic('open');
            onMenu(e, r.left, r.bottom);
          }}
        >
          ⋮
        </button>
      )}
    </li>
  );
}

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
  const [failed, setFailed] = useState(false);
  const [again, setAgain] = useState(0);
  useEffect(() => {
    if (!enabled || sets.length) return;
    setFailed(false);
    (async () => {
      const hit = await db.edhrec.get('scryfall:sets:v2'); // v2: with set icons
      if (hit && Date.now() - hit.at < 7 * 864e5) return setSets(hit.data as SetInfo[]);
      const j = await fetch('https://api.scryfall.com/sets', { headers: { Accept: 'application/json' } })
        .then((r) => r.json())
        .catch(() => null);
      // offline or refused: an older saved list is better than none; with nothing saved, say so (never "loading" forever)
      if (!j?.data) return hit ? setSets(hit.data as SetInfo[]) : setFailed(true);
      const list: SetInfo[] = j.data
        .filter((x: any) => !x.digital && !SKIP_TYPES.includes(x.set_type))
        .map((x: any) => ({ code: x.code, name: x.name, released: x.released_at ?? '', icon: x.icon_svg_uri }))
        .sort((a: SetInfo, b: SetInfo) => b.released.localeCompare(a.released));
      await db.edhrec.put({ path: 'scryfall:sets:v2', data: list, at: Date.now() });
      setSets(list);
    })();
  }, [enabled, again]);
  return { sets, failed, retry: () => setAgain((n) => n + 1) };
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

/** Grid quantity, Arena style: four pips under the card, one filled per copy you own, "+N" past four. Tap it to edit: − n +,
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
  const set = (q: number) => (haptic('tap'), db.entries.update(e.id!, { qty: Math.min(999, q) }));
  return (
    <span ref={ref} className={`tally${edit ? ' editing' : ''}`} onClick={(ev) => ev.stopPropagation()}>
      {edit ? (
        /* Changing the count keeps the diamonds (Guillermo, Nov 15: the editor used to swap them for a different
           widget in another palette, which broke the look of the card). The same ink pill, the same diamonds, with
           − and + on its ends; at one copy the − becomes the bin. */
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
          <span className="tmarks">
            {[0, 1, 2, 3].map((i) => (
              <i key={i} className={i < e.qty ? 'on' : ''} />
            ))}
            {e.qty > 4 && <small>+{e.qty - 4}</small>}
            <span className="u-sr" aria-live="polite">
              {e.qty} {e.qty === 1 ? 'copy' : 'copies'}
            </span>
          </span>
          <button aria-label={`One more ${e.name}`} onClick={() => set(e.qty + 1)}>
            +
          </button>
        </span>
      ) : (
        <button className="marks" aria-label={`${e.qty} ${e.qty === 1 ? 'copy' : 'copies'} of ${e.name}. Change quantity`} onClick={() => (haptic('open'), setEdit(true))}>
          {[0, 1, 2, 3].map((i) => (
            <i key={i} className={i < e.qty ? 'on' : ''} />
          ))}
          {e.qty > 4 && <small>+{e.qty - 4}</small>}
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

function Items({ list, cards, view, onMenu, onPick, used, tints, freeOf }: { list: Entry[]; cards: Map<string, Card>; view: string; onMenu?: MenuFn; onPick?: (e: Entry) => void; used?: Map<string, string[]>; tints?: Map<string, string[]>; freeOf?: (name: string) => number }) {
  const pick = (e: Entry) => (onPick ? () => (haptic('open'), onPick(e)) : undefined);
  // In your active decks: a small mark under the name ("in 2 decks · 1 free", the deck names on hover).
  const useMark = (e: Entry) => {
    const ds = used?.get(norm(e.name));
    if (!ds?.length) return null;
    const free = freeOf?.(e.name);
    return (
      <span className="inuse" title={`In ${ds.join(', ')}${free !== undefined ? ` (${free} free)` : ''}`}>
        {/* one dot per deck, in that deck's colour */}
        {(tints?.get(norm(e.name)) ?? []).map((c) => (
          <i key={c} style={{ background: c }} aria-hidden="true" />
        ))}
        {' '}
        in {ds.length} {ds.length === 1 ? 'deck' : 'decks'}
        {free !== undefined ? ` · ${free} free` : ''}
      </span>
    );
  };
  const cmd = (e: Entry) => {
    const c = cards.get(e.cardId);
    return !!c && c.legal !== false && isCommander(c.type ?? '', c.text ?? '');
  };
  const setLine = (e: Entry) => [e.set?.toUpperCase(), e.cn, e.finish === 'etched' ? 'etched' : e.foil && 'foil', e.condition, e.lang && e.lang !== 'en' && e.lang.toUpperCase()].filter(Boolean).join(' ');
  if (view === 'grid')
    return (
      <ul className="zgrid cgrid2">
        {list.map((e) => (
          <MenuLi key={e.id} e={e} onMenu={onMenu} className={`ztile owned ctile${used?.get(norm(e.name))?.length ? ' live' : ''}`} tint={tints?.get(norm(e.name))?.[0]}>
            {/* The card is its own title (owner's rule, Nov 6: names are read on the card). Price sticker, "in N decks"
                and the Arena-style copy pips sit on the card and show on hover, or when the card is tapped (selected). */}
            <span className="tname" title={setLine(e)}>
              {e.name}
            </span>
            <span className="cart">
              <Thumb src={cards.get(e.cardId)?.img?.replace('/small/', '/normal/')} back={cards.get(e.cardId)?.back} className={`timg xart${e.foil ? ' foil' : ''}`} name={e.name} onPick={pick(e)} />
              {/* Can lead a deck: a crown on the price sticker, nothing else (Guillermo, Nov 15 — the COMMANDER tape
                  repeated what Discover already tells you, and took a corner of the art to say it) */}
              <PriceLink card={priced(cards.get(e.cardId), e.foil)} tape={e.cardId} crown={cmd(e)} />
              {useMark(e)}
              <Tally e={e} />
            </span>
          </MenuLi>
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
          <MenuLi key={e.id} e={e} onMenu={onMenu} className="crow">
            <QtyEdit e={e} />
            <Thumb src={cards.get(e.cardId)?.img} back={cards.get(e.cardId)?.back} className={`thumb xart${e.foil ? ' foil' : ''}`} name={e.name} onPick={pick(e)} />
            <span className="cn">
              <b>{e.name}</b>
              <span>{setLine(e)}</span>
              {useMark(e)}
            </span>
            <PriceLink card={priced(cards.get(e.cardId), e.foil)} tape={e.cardId} />
            <RemoveBtn e={e} />
          </MenuLi>
        ))}
      </ul>
    </>
  );
}

/** The binder's cards: list or grid, optionally grouped by Magic set. */
/** `filter` is the page's FILTER button (first on the one bar); `sort` joins view, size and group in DISPLAY. */
export type SortSpec = { value: string; options: readonly (readonly [string, string])[]; onChange: (v: string) => void };
const VIEWS = [['grid', '▦ GRID'], ['list', '☰ LIST']] as const;
const SIZES = [['s', 'S'], ['m', 'M'], ['l', 'L']] as const;
const GROUPS = [['off', 'NONE'], ['on', 'BY SET']] as const;
export function CardsView({ entries, cards, profile, binderName, q = '', setQ, title, filter, sort, chips, empty }: { entries: Entry[]; cards: Map<string, Card>; profile?: number; binderName?: string; q?: string; setQ?: (v: string) => void; title?: ReactNode; filter?: ReactNode; sort?: SortSpec; chips?: ReactNode; empty?: ReactNode }) {
  const [disp, setDisp] = useState(false);
  const closeDisp = useCallback(() => setDisp(false), []);
  const [menu, setMenu] = useState<{ e: Entry; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const decks = useLiveQuery(() => (profile ? db.decks.where('profile').equals(profile).toArray() : []), [profile]) ?? [];
  const used = inUse(decks);
  const need = activeNeed(decks);
  const tints = colourByCard(decks, norm); // each card glows in the colour of its deck
  const onMenu: MenuFn | undefined = profile ? (e, x, y) => setMenu({ e, x, y }) : undefined;
  // a card picture opens YOUR COPIES: every copy of that card, each one changed on its own (Guillermo, Nov 24)
  const [hand, setHand] = useState<string | null>(null);
  const closeHand = useCallback(() => setHand(null), []);
  const onPick = profile ? (e: Entry) => setHand(e.name) : undefined;
  const ownedCounts = new Map<string, number>();
  for (const x of entries) ownedCounts.set(norm(x.name), (ownedCounts.get(norm(x.name)) ?? 0) + x.qty);
  const owned = (name: string) => ownedCounts.get(norm(name)) ?? 0;
  const freeOf = (name: string) => Math.max(0, owned(name) - (need.get(norm(name)) ?? 0));
  // Always opens in grid; LIST switches for this visit only.
  const [view, setView] = useState<'list' | 'grid'>('grid');
  const [group, setGroup] = usePref<'on' | 'off'>('ch:collgroup', 'off');
  // ZOOM: card size in the grid (small fits more, large reads the card), remembered on this device
  const [zoom, setZoom] = usePref<'s' | 'm' | 'l'>('ch:collzoom', 'm');
  const [hideEmpty, setHideEmpty] = usePref<'on' | 'off'>('ch:collempty', 'on');
  const [limit, setLimit] = useState(100);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const { sets, failed: setsFailed, retry: retrySets } = useSets(group === 'on');

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
      {menu && profile && (
        <CardMenu name={menu.e.name} at={menu} profile={profile} binderName={binderName ?? 'your binder'} owned={owned(menu.e.name)} onClose={() => setMenu(null)} onToast={setToast} />
      )}
      {hand && profile && <YourCopies profile={profile} name={hand} onClose={closeHand} onToast={setToast} />}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undo && (
            <button onClick={() => (haptic('undo'), toast.undo!(), setToast(null))}>
              UNDO
            </button>
          )}
        </div>
      )}
      {/* The one bar (Nov 28): FILTER · search · DISPLAY. DISPLAY holds the view, card size, sort and group-by-set. */}
      <div className="collbar" data-zoom={zoom}>
        {title}
        <OneBar
          label="Cards: filter, search and display"
          filter={filter}
          search={<SearchBox q={q} setQ={setQ ?? (() => {})} />}
          display={<DisplayBtn now={view === 'grid' ? `GRID · ${zoom.toUpperCase()}` : 'LIST'} open={disp} onClick={() => setDisp(true)} />}
        />
      </div>
      {disp && (
        <Sheet title="DISPLAY" seed={47} label="Display" onClose={closeDisp} foot={<button type="button" className="u-btn primary" onClick={closeDisp}>DONE</button>}>
          <Choice label="View" now={view === 'grid' ? 'GRID' : 'LIST'} value={view} options={VIEWS} onChange={setView} />
          {view === 'grid' && <Choice label="Card size" now={zoom.toUpperCase()} value={zoom} options={SIZES} onChange={setZoom} />}
          {sort && <Choice label="Sort" now={sort.options.find(([v]) => v === sort.value)?.[1]} value={sort.value} options={sort.options} onChange={sort.onChange} />}
          <Choice label="Group" value={group} options={GROUPS} onChange={setGroup} />
          {group === 'on' && (
            <label className="check">
              <input type="checkbox" checked={hideEmpty === 'on'} onChange={(e) => (haptic('select'), setHideEmpty(e.target.checked ? 'on' : 'off'))} /> Hide sets with no cards
            </label>
          )}
        </Sheet>
      )}
      {chips}

      {group === 'on' ? (
        <div className="setgroups">
          {!sets.length &&
            (setsFailed ? (
              <EmptyState
                title="Couldn't load the set list"
                action={
                  <button type="button" className="u-btn" onClick={() => (haptic('select'), retrySets())}>
                    TRY AGAIN
                  </button>
                }
              >
                Scryfall didn't answer, so the cards can't be grouped by set right now. Your cards are safe; set Group to NONE in DISPLAY to see them.
              </EmptyState>
            ) : (
              <p className="count">Loading Magic sets from Scryfall…</p>
            ))}
          {groups.map((g) => {
            const n = g.list.reduce((s, e) => s + e.qty, 0);
            return (
              <details key={g.code} data-col={tone(g.list)} className={`cat setgrp${n ? '' : ' empty'}`} open={open.has(g.code)} onToggle={(ev) => (ev.currentTarget.open !== open.has(g.code) ? toggle(g.code) : null)}>
                <summary title={g.year ? `${g.name} (${g.year})` : g.name}>
                  <span className="pm" aria-hidden="true" />
                  {g.icon ? <img className="seticon" src={g.icon} alt="" loading="lazy" /> : <span className="seticon" aria-hidden="true" />}
                  <span className="h">{g.name}</span>
                  <span className="n">
                    {g.code.toUpperCase()} · {n}
                  </span>
                </summary>
                {open.has(g.code) && (g.list.length ? <Items list={g.list} cards={cards} view={view} onMenu={onMenu} onPick={onPick} used={used} tints={tints} freeOf={freeOf} /> : <p className="count" style={{ padding: '0 14px 12px' }}>No cards from this set.</p>)}
              </details>
            );
          })}
        </div>
      ) : !entries.length && empty ? (
        empty
      ) : (
        <>
          <Items list={entries.slice(0, limit)} cards={cards} view={view} onMenu={onMenu} onPick={onPick} used={used} tints={tints} freeOf={freeOf} />
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

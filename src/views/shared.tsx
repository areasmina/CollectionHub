import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { deckColour } from '../lib/deckcolor';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { statusOf } from '../lib/compare';
import { norm } from '../lib/names';
import { db, type Card, type Deck } from '../lib/db';
import { openDeck } from '../lib/nav';
import { shortText, type Shortfall } from '../lib/copies';
import { deckSalt, saltMap } from '../lib/edhrec';
import { cad, finishUsd, PRICE_METHOD, rateNote, toCad } from '../lib/prices';
import { dragEnd, dragStart } from '../lib/drag';
import { Ransom } from './zine';

/** Every legal card in a binder, one per name (live). */
export function useBinder(profile: number) {
  return (
    useLiveQuery(async () => {
      const es = await db.entries.where('profile').equals(profile).toArray();
      const m = new Map<string, Card>();
      for (const c of await db.cards.bulkGet([...new Set(es.map((e) => e.cardId))])) if (c?.legal && !m.has(c.key)) m.set(c.key, c);
      return [...m.values()];
    }, [profile]) ?? []
  );
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

/** Scryfall page for a card by exact name (Scryfall opens the card page when the name matches one card). */
export const scryfallUrl = (name: string) => `https://scryfall.com/search?q=${encodeURIComponent(`!"${name.split(' // ')[0]}"`)}`;
/** Devices with a mouse: hover previews, click opens Scryfall. Touch devices: tap shows the preview. */
const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

// Large card preview: one overlay for the whole app (PreviewLayer in App).
type Preview = { src: string; tap: boolean; href?: string };
let setPreview: (p: Preview | null) => void = () => {};
export function PreviewLayer() {
  const [p, set] = useState<Preview | null>(null);
  useEffect(() => void (setPreview = set), []);
  if (!p) return null;
  return (
    <div className={`preview${p.tap ? ' tap' : ''}`} onClick={() => set(null)} role="dialog" aria-label="Card preview (tap to close)">
      <img src={p.src} alt="" />
      {p.tap && p.href && (
        <a className="btn ink scry" href={p.href} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
          OPEN ON SCRYFALL ↗
        </a>
      )}
    </div>
  );
}

/** Shows / hides the big card preview (press and hold on touch). */
export const showPreview = (src: string | null) => setPreview(src ? { src, tap: false } : null);

/** Card image: 1 s hover preview; click opens Scryfall (mouse) or the preview with a Scryfall link (touch).
 *  `onPick` replaces the click (missing cards open their swap note instead). */
export function Thumb({ src, className = 'thumb xart', name, onPick }: { src?: string; className?: string; name?: string; onPick?: () => void }) {
  const timer = useRef<number>(undefined);
  if (!src) return <span className={className} aria-hidden="true" />;
  const big = src.replace('/small/', '/normal/').replace('/art_crop/', '/normal/');
  const href = name ? scryfallUrl(name) : undefined;
  // Foil: the glare follows the pointer (mouse or finger) while it's over the card.
  const foil = className.includes('foil');
  const track = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--gx', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`);
    e.currentTarget.style.setProperty('--gy', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
    e.currentTarget.classList.add('tracking');
  };
  return (
    <span className={className} onPointerMove={foil ? track : undefined} onPointerLeave={foil ? (e) => e.currentTarget.classList.remove('tracking') : undefined}>
      <img
        src={src}
        alt=""
        loading="lazy"
        onMouseEnter={() => (timer.current = window.setTimeout(() => setPreview({ src: big, tap: false }), 1000))}
        onMouseLeave={() => {
          clearTimeout(timer.current);
          setPreview(null);
        }}
        onClick={(e) => {
          e.stopPropagation();
          clearTimeout(timer.current);
          setPreview(null);
          if (onPick) return onPick();
          if (href && canHover()) return void window.open(href, '_blank', 'noopener');
          haptic('open');
          setPreview({ src: big, tap: true, href });
        }}
      />
      <span className="pen" aria-hidden="true" />
    </span>
  );
}
/** Yellow price sticker; links to TCGplayer when Scryfall gives a link. */
export function PriceLink({ card, plain, tape }: { card?: Card; plain?: boolean; tape?: string }) {
  // tape: a seed (e.g. card id) picks one of 5 yellow shades x 4 textures, so a grid of prices doesn't look samey.
  let h = 0;
  for (const ch of tape ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cls = `price${plain ? ' plain' : ''}${tape ? ` tapey y${h % 5} t${(h >> 3) % 4}` : ''}`;
  if (!card?.usd) return null; // basics and unpriced cards: no "≈CA$—"
  return card.buy ? (
    <a className={cls} href={card.buy} target="_blank" rel="noreferrer" title={rateNote()} onClick={(e) => e.stopPropagation()}>
      {usd(card)}
    </a>
  ) : (
    <span className={cls} title={rateNote()}>
      {usd(card)}
    </span>
  );
}

/** Right-click, or press and hold (touch or mouse, 0.5 s), opens a card menu at that spot; the click a hold ends in is dropped. */
export function useMenuPress(onMenu?: (x: number, y: number) => void) {
  const timer = useRef<number>(undefined);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  if (!onMenu) return {};
  const cancel = () => (clearTimeout(timer.current), (start.current = null));
  return {
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      cancel();
      onMenu(e.clientX, e.clientY);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // mouse: right-click above, or hold the left button
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        haptic('open');
        onMenu(start.current!.x, start.current!.y);
      }, 500);
    },
    onPointerMove: (e: React.PointerEvent) => start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10 && cancel(),
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onClickCapture: (e: React.MouseEvent) => {
      if (fired.current) (e.stopPropagation(), e.preventDefault(), (fired.current = false));
    },
  };
}

/** A card row: owned normal, missing dimmed with a SWAP button, "in <other binder>" labelled. */
/** Mana cost rendered as authentic circular MTG mana pips. */
export function ManaPips({ mana }: { mana?: string }) {
  if (!mana) return null;
  const matches = [...mana.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
  if (!matches.length) return null;
  return (
    <span className="manapips" aria-label={`Mana cost: ${mana}`}>
      {matches.map((p, i) => {
        const s = p.toLowerCase();
        let cls = 'generic';
        if (s === 'w') cls = 'w';
        else if (s === 'u') cls = 'u';
        else if (s === 'b') cls = 'b';
        else if (s === 'r') cls = 'r';
        else if (s === 'g') cls = 'g';
        else if (s === 'c') cls = 'c';
        else if (s.includes('/')) cls = 'hybrid';
        return (
          <span key={i} className={`manapip pip-${cls}`} title={p}>
            {p}
          </span>
        );
      })}
    </span>
  );
}

/** A card row: owned normal, missing dimmed with a SWAP button, "in <other binder>" labelled. */
export function CardLine({
  name,
  img,
  card,
  s,
  note,
  marker,
  markText,
  quiet,
  onOpen,
  onClose,
  onMenu,
  foil,
  drag,
  children,
}: {
  drag?: boolean; // the Forge: the card can be dragged (mouse) back onto the suggestions to cut it
  markText?: string; // what the marker line says (default "↔ for <marker>")
  quiet?: boolean; // your own card: a small swap button instead of the loud one
  onMenu?: (x: number, y: number) => void; // card menu (right-click / press and hold)
  foil?: boolean; // foil copy: the image gets a sheen
  name: string;
  img?: string;
  card?: Card;
  s: Shared;
  note?: React.ReactNode;
  marker?: string; // the missing card a swap replaces
  onOpen?: () => void; // open the replacement note (hover, tap or SWAP)
  onClose?: () => void; // kept for callers; the note closes from its own button / the backdrop
  children?: ReactNode; // replacement note
}) {
  const st = statusOf(name, s.mine, s.other);
  const press = useMenuPress(onMenu);
  const ownQty = s.mine.get(norm(name)) ?? 0;

  return (
    <li className={`zrow ${st}${onMenu ? ' hasmenu' : ''}`} data-card={name} onClick={onOpen} {...press} {...dragProps(name, drag)}>
      <Thumb src={card?.img ?? img} className={`thumb xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      <span className="info">
        <span className="zrow-head">
          <span className="nm">{name}</span>
          <ManaPips mana={card?.mana} />
          {card?.type && <span className="zrow-type">{card.type}</span>}
        </span>
        <span className="zrow-sub">
          {st === 'owned' && (
            <span className="zrow-owned-badge">
              <span className="zrow-check">✓</span> OWNED{ownQty > 0 ? <span className="zrow-binder-qty"> · {ownQty} in binder</span> : ''}
            </span>
          )}
          {st === 'missing' && (
            <span className="zrow-missing-badge">
              MISSING · NEEDS 1
            </span>
          )}
          {st === 'other' && <span className="tagother">in {s.otherName}</span>}
          {(markText ?? marker) && <span className="swapmark">{markText ?? `↔ for ${marker}`}</span>}
          {card?.legal === false && <span className="bannedtag" title="Not legal in Commander (Scryfall)">BANNED</span>}
          {note && <span className="note">{note}</span>}
          {st === 'missing' && <span className="sr">(missing)</span>}
        </span>
      </span>
      <span className="acts">
        <PriceLink card={card} tape={name} />
        {onOpen && (
          <button
            className={`swapbtn${quiet ? ' quiet' : ''}`}
            onClick={(e) => (e.stopPropagation(), onOpen())}
            aria-label={marker ? `Swap ${name} (in place of ${marker})` : `Swap ${name}`}
            title="Swap or pin"
          >
            <span className="swap-icon">{quiet ? '⇄' : '↺'}</span>
            <span className="swap-lbl">SWAP</span>
          </button>
        )}
        {onMenu && (
          <button
            className="morebtn"
            aria-label={`More for ${name}`}
            title="More (right-click or hold works too)"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              haptic('open');
              onMenu(r.left, r.bottom);
            }}
          >
            ⋮
          </button>
        )}
      </span>
      {children}
    </li>
  );
}

/** Grid tile version of CardLine: big image, name, swap + price. Opens its note on tap/click only (no hover). */
/** Mouse drag of a deck card (the Forge: drop it on the suggestions to cut it). */
const dragProps = (name: string, on?: boolean) => (on ? { draggable: true, onDragStart: (e: React.DragEvent) => dragStart(e, name, 'deck'), onDragEnd: dragEnd } : {});

export function CardTile({ name, img, card, s, note, marker, markText, quiet, onOpen, onMenu, foil, drag, children }: Parameters<typeof CardLine>[0]) {
  const st = statusOf(name, s.mine, s.other);
  const src = (card?.img ?? img)?.replace('/small/', '/normal/');
  const press = useMenuPress(onMenu);
  return (
    <li className={`ztile ${st}${onMenu ? ' hasmenu' : ''}`} data-card={name} onClick={onOpen} tabIndex={onOpen ? undefined : 0} {...press} {...dragProps(name, drag)}>
      <Thumb src={src} className={`timg xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      {st === 'missing' && (
        <span className="misstape" aria-hidden="true">
          MISSING
        </span>
      )}
      {card?.legal === false && (
        <span className="bannedtape" title="Not legal in Commander (Scryfall)">
          BANNED
        </span>
      )}
      <span className="tname">
        {name}
        {st === 'missing' && <span className="sr">(missing)</span>}
      </span>
      {note && <span className="tnote">{note}</span>}
      {(markText ?? marker) && <span className="swapmark">{markText ?? `↔ for ${marker}`}</span>}
      {st === 'other' && <span className="tagother">in {s.otherName}</span>}
      <span className="tacts">
        {onOpen && (
          <button className="swapbtn tilehit" onClick={(e) => (e.stopPropagation(), onOpen())} aria-label={marker ? `Swap ${name} (in place of ${marker})` : `Swap ${name}`} title="Swap or pin">
            <span className="sr">Swap</span>
          </button>
        )}
        {onMenu && (
          <button
            className="morebtn"
            aria-label={`More for ${name}`}
            title="More (right-click or hold works too)"
            onClick={(e) => {
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              haptic('open');
              onMenu(r.left, r.bottom);
            }}
          >
            ⋮
          </button>
        )}
      </span>
      {/* the same peel-on tape sticker as Collection: on the art's top-right corner */}
      <PriceLink card={card} tape={name} />
      {children}
    </li>
  );
}

export function Segs({ label, value, options, onChange, roman }: { label: string; value: string; options: ([string, string] | [string, string, string])[]; onChange: (v: string) => void; roman?: boolean }) {
  return (
    <div className="segs" role="radiogroup" aria-label={label}>
      {options.map(([v, text, tip]) => (
        <button key={v} type="button" role="radio" className={roman && v ? 'roman' : ''} title={tip} aria-checked={value === v} onClick={() => (haptic('select'), onChange(v))}>
          {text}
        </button>
      ))}
    </div>
  );
}

/**
 * Where a deck's card view (grid / list / compact) is remembered on this device. Grid is the start at every screen size
 * (owner's call, Nov 13). The key replaced 'ch:view', under which phones started on the compact list, so every device
 * starts on the grid once and then keeps what its owner picks. The view pills sit on the bar at every width (on phones
 * too: twice they were moved into a menu there, and twice the owner could not find them).
 */
export const VIEW_KEY = 'ch:cardview';

/** onScroll for sideways chip rows: a light tick each time the row moves past another chip (scroll-snap step). */
export function snapTick(e: React.UIEvent<HTMLElement>) {
  const el = e.currentTarget;
  const step = (el.firstElementChild as HTMLElement | null)?.offsetWidth ?? 120;
  const at = Math.round(el.scrollLeft / Math.max(40, step));
  if (Number(el.dataset.snap ?? -1) !== at) {
    if (el.dataset.snap !== undefined) haptic('tick');
    el.dataset.snap = String(at);
  }
}

/** Dropdown in the Discover SORT-box style: black tab label, select, red arrow. */
export function Pick<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={`sbox pick${className ? ` ${className}` : ''}`}>
      <span className="tab">{label}</span>
      <select value={value} onChange={(e) => (haptic('select'), onChange(e.target.value as T))}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <span className="arrow" aria-hidden="true">
        <span>▼</span>
      </span>
    </label>
  );
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
  if (!s) return null; // unknown salt (loading, or EDHREC's list unreachable): show nothing rather than "…"
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
      {(
        <ul className="popnote">
          {s.top.map((c) => (
            <li key={c.name}>
              {c.name} <b>{c.salt.toFixed(2)}</b>
            </li>
          ))}
          <li className="small">{s.top.length ? '' : 'No salty cards. '}Sum of EDHREC salt (0–4 per card, player votes) over its top 1,000 saltiest cards.</li>
        </ul>
      )}
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

/** Hazard note: cards your decks share more often than you own copies (decks are virtual lists). */
/** Copies warning. `inline`: it leads a hint line (which turns yellow), so it needs no band of its own. */
function cleanDeckName(d: string, fallback?: string): string {
  if (d.startsWith('this ') && d.endsWith(' deck')) {
    return d.slice(5, -5).trim() || fallback || 'Current Deck';
  }
  return d;
}

/** Hazard note: cards your decks share more often than you own copies (decks are virtual lists). */
/** Copies warning. `inline`: it leads a hint line (which turns yellow), so it needs no band of its own. */
export function ShortAlert({ items, inline, currentDeck }: { items: Shortfall[]; inline?: boolean; currentDeck?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const real = useLiveQuery(async () => new Set((await db.decks.toArray()).map((d) => d.name)), []) ?? new Set<string>();

  const updatePos = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 700) {
      setPos(null);
      return;
    }
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - 490));
      const top = Math.min(r.bottom + 8, window.innerHeight - 300);
      setPos({ top, right });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (
        popRef.current &&
        !popRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!items.length) return null;

  const totalShort = items.reduce((sum, s) => sum + s.short, 0);
  const search = q.trim().toLowerCase();
  const list = search
    ? items.filter((s) => s.name.toLowerCase().includes(search) || s.decks.some((d) => d.toLowerCase().includes(search)))
    : items;

  const isCurrentDeck = (d: string) => {
    if (d.startsWith('this ') && d.endsWith(' deck')) return true;
    if (!currentDeck) return false;
    const cleanD = cleanDeckName(d).toLowerCase();
    const cleanC = currentDeck.toLowerCase();
    // exact names only: "Tatyova Lands" is not this deck when you're in "Tatyova Lands (copy)"
    return cleanD === cleanC || d.toLowerCase() === cleanC;
  };

  const portalContent = open && typeof document !== 'undefined'
    ? createPortal(
        <>
          <div className="backdrop shortback" onClick={() => setOpen(false)} />
          <div
            ref={popRef}
            className="shortpop"
            role="dialog"
            aria-modal="true"
            aria-label="Copies Shortfall Report"
            style={pos && typeof window !== 'undefined' && window.innerWidth > 700 ? { top: `${pos.top}px`, right: `${pos.right}px` } : undefined}
          >
            <div className="shortpop-header">
              <div className="shortpop-tape">
                <span className="shortpop-tape-stripes" aria-hidden="true" />
                <span className="shortpop-tape-title">▲ COPIES SHORTFALL</span>
                <span className="shortpop-tape-stripes" aria-hidden="true" />
              </div>
              <button
                type="button"
                className="shortpop-close-btn"
                onClick={() => {
                  haptic('tap');
                  setOpen(false);
                }}
                aria-label="Close shortfall report"
              >
                ✕ CLOSE
              </button>
            </div>

            <div className="shortpop-summary">
              <div className="shortpop-summary-info">
                <b>{items.length} {items.length === 1 ? 'CARD' : 'CARDS'}</b>
                <span> in more decks than physical copies</span>
              </div>
              <div className="shortpop-summary-badge" title={`${totalShort} extra copies needed across all active decks`}>
                <span className="sp-neg">−{totalShort}</span>
                <span className="sp-lbl">SHORT</span>
              </div>
            </div>

            {items.length > 2 && (
              <div className="shortpop-search-bar">
                <input
                  type="search"
                  value={q}
                  placeholder="Filter short cards or decks..."
                  onChange={(e) => setQ(e.target.value)}
                  aria-label="Filter shortfall cards"
                />
                {q && (
                  <button type="button" className="shortpop-search-clear" onClick={() => setQ('')} aria-label="Clear search">
                    ✕
                  </button>
                )}
              </div>
            )}

            {/* a deck name opens that deck: the report steps aside (it used to stay open over the deck, backdrop and all) */}
            <ul className="shortpop-list" onClickCapture={(e) => (e.target as HTMLElement).closest('.decklink') && setTimeout(() => setOpen(false), 0)}>
              {list.map((s) => (
                <li key={s.name} className="shortitem">
                  <div className="shortitem-badge" title={`${s.short} more ${s.short === 1 ? 'copy' : 'copies'} needed`}>
                    <span className="shortitem-num">−{s.short}</span>
                    <span className="shortitem-lbl">SHORT</span>
                  </div>
                  <div className="shortitem-info">
                    <div className="shortitem-top">
                      <a
                        className="shortitem-name"
                        href={scryfallUrl(s.name)}
                        target="_blank"
                        rel="noreferrer"
                        title={`View ${s.name} on Scryfall`}
                      >
                        {s.name} <span className="shortitem-arrow">↗</span>
                      </a>
                      <span className="shortitem-eq">
                        <span className="sc-own">OWN {s.own}</span>
                        <span className="sc-sep">/</span>
                        <span className="sc-need">{s.need} IN DECKS</span>
                      </span>
                    </div>
                    <div className="shortitem-decks-wrap">
                      <span className="shortitem-decks-lbl">DECKS:</span>
                      <div className="shortitem-deck-tags">
                        {s.decks.map((d) => {
                          const isCurrent = isCurrentDeck(d);
                          const displayName = cleanDeckName(d, currentDeck);
                          return (
                            <span key={d} className={`shortitem-deck-tag${isCurrent ? ' this-deck' : ''}`}>
                              {isCurrent ? (
                                <>
                                  <span className="shortitem-deck-name">{displayName}</span>
                                  <span className="shortitem-current-marker">★ THIS DECK</span>
                                </>
                              ) : real.has(d) ? (
                                <DeckLink name={d} />
                              ) : (
                                <span className="shortitem-deck-name">{displayName}</span>
                              )}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
              {list.length === 0 && (
                <li className="shortitem-empty">No shortfall cards match "{q}"</li>
              )}
            </ul>

            <div className="shortpop-footer">
              <span>Decks are virtual lists. Add copies to your binder to clear shortfalls.</span>
            </div>
          </div>
        </>,
        document.body
      )
    : null;

  if (inline) {
    return (
      <div className="shortin" role="region" aria-label="Shortfall alerts">
        <button
          ref={triggerRef}
          type="button"
          className={`shortin-btn${open ? ' active' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={`${items.length} ${items.length === 1 ? 'card is' : 'cards are'} in more decks than you have copies: tap for breakdown`}
          onClick={() => {
            haptic('open');
            setOpen(!open);
          }}
        >
          <span className="shortin-warn-icon" aria-hidden="true">▲</span>
          <span className="shortin-count">{items.length} SHORT</span>
          <span className="shortin-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
        </button>
        {portalContent}
      </div>
    );
  }

  return (
    <aside className="shortalert chip" role="status">
      <button
        ref={triggerRef}
        type="button"
        className={`shortchip-btn${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          haptic('open');
          setOpen(!open);
        }}
      >
        <span className="shortin-warn-icon" aria-hidden="true">▲</span>
        <b>{items.length} SHORT</b>{' '}
        <span>{items.length === 1 ? 'card is' : 'cards are'} in more decks than you have copies</span>
        <span className="shortin-caret" aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      {portalContent}
    </aside>
  );
}

/** The commander's big card is its menu button (it replaces the old one-card "Commander" section). The ⋯ OPTIONS tag
 *  sits under the card, never on it: nothing may cover the card's name, mana cost, rules text or collector line. */
export function CmdrCard({ src, name, onMenu, children }: { src: string; name: string; onMenu: (x: number, y: number) => void; children?: ReactNode }) {
  const open = (x: number, y: number) => (haptic('open'), onMenu(x, y));
  return (
    <button
      type="button"
      className="cmdrbtn"
      onPointerDown={(e) => e.stopPropagation()}
      aria-label={`${name}: commander options`}
      title="Commander options (right-click or hold works too)"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        open(r.left + r.width / 2, r.top + r.height * 0.4);
      }}
      onContextMenu={(e) => (e.preventDefault(), e.stopPropagation(), open(e.clientX, e.clientY))}
    >
      <img src={src} alt="" />
      {children}
      <span className="cmdrmore" aria-hidden="true">
        ⋯ <b>OPTIONS</b>
      </span>
    </button>
  );
}

/** The SEARCH segment every toolbar starts with: cards by name or rules text (Oracle + reminder text). */
export function SearchBox({ q, setQ, placeholder = 'name or rules text_', ariaLabel = 'Search cards by name or rules text' }: { q: string; setQ: (v: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <label className="sbox dark tsearch">
      <span className="tab">SEARCH</span>
      <input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={ariaLabel} enterKeyHint="search" />
      <span aria-hidden="true" className="fade" />
    </label>
  );
}

/**
 * The one tool bar (owner's rule, Nov 6): a slim single row on every page and every width. The search box, then ⋮,
 * which opens the options (power, budget, sort, show, view, size, grouping). On wider screens the bar also names the
 * options in use. Kept class names (.dtools / .fsheet / .fbody) so the old hooks still find it.
 */
export function ToolBar({ q, setQ, placeholder, searchLabel, now, quick, extra, label = 'Cards: search and options', children }: { q: string; setQ: (v: string) => void; placeholder?: string; searchLabel?: string; now?: ReactNode; quick?: ReactNode; extra?: ReactNode; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  // a tap outside the open options closes them
  useEffect(() => {
    const out = (e: PointerEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute('open');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ref.current?.open && (ref.current.removeAttribute('open'), ref.current.querySelector('summary')?.focus());
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => (removeEventListener('pointerdown', out), removeEventListener('keydown', esc), void document.documentElement.classList.remove('sheet-open'));
  }, []);
  return (
    <div className="dtools tbar" role="toolbar" aria-label={label}>
      {quick && <div className="tquick">{quick}</div>}
      {/* On phones the options open as the one bottom sheet (same shape as Collection's filter sheet); a tap on the
          dimmed page behind it (the details' own ::before) closes it. Wider screens keep the popover under the button. */}
      <details
        className="fsheet tbmore"
        ref={ref}
        onToggle={(e) => (e.currentTarget.open && haptic('open'), document.documentElement.classList.toggle('sheet-open', !!document.querySelector('details.tbmore[open]')))}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.removeAttribute('open')}
      >
        <summary aria-label="Options" title="Options">
          {now && <span className="fnow">{now}</span>}
          <span className="kebab" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </summary>
        <div className="fbody">
          <div className="sheethead">
            <span aria-hidden="true">
              <Ransom text="OPTIONS" size={24} seed={43} />
            </span>
            <button type="button" className="close" aria-label="Close options" onClick={() => (haptic('tap'), ref.current?.removeAttribute('open'))}>
              ✕
            </button>
          </div>
          {children}
        </div>
      </details>
      <SearchBox q={q} setQ={setQ} placeholder={placeholder} ariaLabel={searchLabel} />
      {extra}
    </div>
  );
}

/**
 * Under a tool bar: one removable chip per setting that changes what is shown, then "Clear all" (audit roadmap, phase 2).
 * The same strip as Collection's and Discover's active filters, so what narrows a page is never hidden behind ⋮.
 * Hidden when nothing is on.
 */
export function SetChips({ chips }: { chips: { label: string; off: () => unknown }[] }) {
  if (!chips.length) return null;
  return (
    <div className="fchips setchips" role="group" aria-label="Active settings">
      {chips.map((c) => (
        <button key={c.label} type="button" className="fchip" aria-label={`Remove ${c.label}`} onClick={() => (haptic('select'), void c.off())}>
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="fclear"
          onClick={async () => {
            haptic('select');
            for (const c of chips) await c.off(); // one at a time: unpinning saves to the binder
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/** One labelled row inside the tool bar's options. */
export function OptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="optrow">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

/** The one "nothing to show" note (lists, searches, filters): what happened in plain words and the way out. */
export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="estate" role="status" aria-label={title}>
      {/* the note is empty frame space, so it may carry the zine (Overhaul rule 1): a tape strip and ransom letters */}
      <span aria-hidden="true" className="tape" style={{ width: 70, height: 18, top: -9, left: 18, transform: 'rotate(-4deg)' }} />
      <span className="etitle" aria-hidden="true">
        <Ransom text={title.toUpperCase()} size={22} seed={title.length * 7 + 3} />
      </span>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

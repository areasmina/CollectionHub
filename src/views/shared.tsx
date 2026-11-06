import { haptic } from '../lib/haptics';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { statusOf } from '../lib/compare';
import { db, type Card, type Deck } from '../lib/db';
import { openDeck } from '../lib/nav';
import { shortText, type Shortfall } from '../lib/copies';
import { deckSalt, saltMap } from '../lib/edhrec';
import { cad, finishUsd, PRICE_METHOD, rateNote, toCad } from '../lib/prices';

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
  return card?.buy && card.usd ? (
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
  children,
}: {
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
  return (
    <li className={`zrow ${st}${onMenu ? ' hasmenu' : ''}`} onClick={onOpen} {...press}>
      <Thumb src={card?.img ?? img} className={`thumb xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      <span className="info">
        <span className="nm">{name}</span>
        <span className="note">
          {card?.mana && `${card.mana} `}
          {note}
          {st === 'missing' && <span className="sr">(missing)</span>}
        </span>
        {(markText ?? marker) && <span className="swapmark">{markText ?? `↔ for ${marker}`}</span>}
        {st === 'other' && <span className="tagother">in {s.otherName}</span>}
      </span>
      <span className="acts">
        {onOpen && (
          <button className={`swapbtn${quiet ? ' quiet' : ''}`} onClick={(e) => (e.stopPropagation(), onOpen())} aria-label={marker ? `Swap ${name} (in place of ${marker})` : `Swap ${name}`} title="Swap or pin">
            {quiet ? '⇄' : '↺ SWAP'}
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
            ⋯
          </button>
        )}
        <PriceLink card={card} plain={st === 'owned' && !marker} />
      </span>
      {children}
    </li>
  );
}

/** Grid tile version of CardLine: big image, name, swap + price. Opens its note on tap/click only (no hover). */
export function CardTile({ name, img, card, s, note, marker, markText, quiet, onOpen, onMenu, foil, children }: Parameters<typeof CardLine>[0]) {
  const st = statusOf(name, s.mine, s.other);
  const src = (card?.img ?? img)?.replace('/small/', '/normal/');
  const press = useMenuPress(onMenu);
  return (
    <li className={`ztile ${st}${onMenu ? ' hasmenu' : ''}`} onClick={onOpen} {...press}>
      <Thumb src={src} className={`timg xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      {st === 'missing' && (
        <span className="misstape" aria-hidden="true">
          MISSING
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
            ⋯
          </button>
        )}
        <PriceLink card={card} plain={st === 'owned' && !marker} />
      </span>
      {children}
    </li>
  );
}

export function Segs({ label, value, options, onChange, roman }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void; roman?: boolean }) {
  return (
    <div className="segs" role="radiogroup" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={v} role="radio" className={roman && v ? 'roman' : ''} aria-checked={value === v} onClick={() => (haptic('select'), onChange(v))}>
          {text}
        </button>
      ))}
    </div>
  );
}

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
export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="sbox pick">
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

export const Progress = ({ done, total, what = 'Looking up cards on Scryfall' }: { done: number; total: number; what?: string }) => (
  <div className="progress">
    <progress value={done} max={total || 1} /> <span>{total ? `${what}: ${done} / ${total}` : 'Reading…'}</span>
  </div>
);

/** Header stats in the title banner, beside the colour pips: deck price on yellow tape, salt on a torn paper scrap,
 *  optional extras (bracket stamp); the price note sits under the row. */
export function HeroStats({ price, fetched, names, children }: { price?: number; fetched: string; names: string[]; children?: ReactNode }) {
  return (
    <div className="hstats" onClick={(e) => e.stopPropagation()}>
      <span className="price tapey y1 t0 big" title={PRICE_METHOD} aria-label={`Whole deck costs about ${price !== undefined ? cad(price) : 'an unknown amount'}`}>
        <small className="wideonly">DECK</small> {price !== undefined ? `≈${cad(price)}` : 'CA$—'}
      </span>
      <SaltStat names={names} />
      {children}
      <small className="fetched" title={PRICE_METHOD}>
        deck price: cheapest printings · {fetched}
      </small>
    </div>
  );
}

/** The deck's salt (sum of EDHREC salt scores) on a torn paper scrap; tap shows the saltiest cards. */
export function SaltStat({ names }: { names: string[] }) {
  const [salt, setSalt] = useState<Map<string, number> | null>(null);
  useEffect(() => void saltMap().then(setSalt), []);
  const s = salt && deckSalt(names, salt);
  return (
    <details className="scrap salt">
      <summary aria-label={s ? `Salt ${s.total.toFixed(1)}: sum of EDHREC salt scores. Show the saltiest cards` : 'Salt loading'}>
        <span className="k">SALT</span>
        <span className="amt">{s ? s.total.toFixed(1) : '…'}</span>
        {s && s.top.length > 0 && <span className="caret" aria-hidden="true">▾</span>}
      </summary>
      {s && (
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
export function ShortAlert({ items }: { items: Shortfall[] }) {
  const real = useLiveQuery(async () => new Set((await db.decks.toArray()).map((d) => d.name)), []) ?? new Set<string>();
  if (!items.length) return null;
  const row = (s: Shortfall) => (
    <li key={s.name}>
      {shortText(s)}.{' '}
      <small>
        You own {s.own} · used in{' '}
        {s.decks.map((d, i) => (
          <span key={d}>
            {i > 0 && ', '}
            {real.has(d) ? <DeckLink name={d} /> : d}
          </span>
        ))}
      </small>
    </li>
  );
  return (
    <aside className="shortalert chip" role="status">
      {/* A small chip; tap it for which cards and decks (the full warning used to take a whole band). */}
      <details>
        <summary>
          <b>⚠ {items.length} SHORT</b> <span>{items.length === 1 ? 'card is' : 'cards are'} in more decks than you have copies</span>
        </summary>
        <ul>{items.map(row)}</ul>
      </details>
    </aside>
  );
}

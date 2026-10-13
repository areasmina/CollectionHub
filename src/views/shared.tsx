import { useEffect, useRef, useState } from 'react';
import { statusOf } from '../lib/compare';
import type { Card } from '../lib/db';
import { shortText, type Shortfall } from '../lib/copies';
import { deckSalt, saltMap } from '../lib/edhrec';
import { cad, finishUsd, PRICE_METHOD, rateNote, toCad } from '../lib/prices';

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

/** Card image: 1 s hover preview; click opens Scryfall (mouse) or the preview with a Scryfall link (touch).
 *  `onPick` replaces the click (missing cards open their swap note instead). */
export function Thumb({ src, className = 'thumb xart', name, onPick }: { src?: string; className?: string; name?: string; onPick?: () => void }) {
  const timer = useRef<number>(undefined);
  if (!src) return <span className={className} aria-hidden="true" />;
  const big = src.replace('/small/', '/normal/').replace('/art_crop/', '/normal/');
  const href = name ? scryfallUrl(name) : undefined;
  return (
    <span className={className}>
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
          setPreview({ src: big, tap: true, href });
        }}
      />
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

/** Right-click (mouse) or press-and-hold (touch, 0.5 s) opens a card menu at that spot; the click a hold ends in is dropped. */
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
      if (e.pointerType === 'mouse') return;
      fired.current = false;
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        fired.current = true;
        navigator.vibrate?.(15);
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
  onOpen,
  onClose,
  onMenu,
  children,
}: {
  onMenu?: (x: number, y: number) => void; // card menu (right-click / press and hold)
  name: string;
  img?: string;
  card?: Card;
  s: Shared;
  note?: React.ReactNode;
  marker?: string; // the missing card a swap replaces
  onOpen?: () => void; // open the replacement note (hover, tap or SWAP)
  onClose?: () => void;
  children?: React.ReactNode; // replacement note
}) {
  const st = statusOf(name, s.mine, s.other);
  const press = useMenuPress(onMenu);
  return (
    <li className={`zrow ${st}${onMenu ? ' hasmenu' : ''}`} onMouseEnter={onOpen} onMouseLeave={onClose} onClick={onOpen} {...press}>
      <Thumb src={card?.img ?? img} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      <span className="info">
        <span className="nm">{name}</span>
        <span className="note">
          {card?.mana && `${card.mana} `}
          {note}
          {st === 'missing' && <span className="sr">(missing)</span>}
        </span>
        {marker && <span className="swapmark">↔ for {marker}</span>}
        {st === 'other' && <span className="tagother">in {s.otherName}</span>}
      </span>
      <span className="acts">
        {onOpen && (
          <button className="swapbtn" onClick={(e) => (e.stopPropagation(), onOpen())} aria-label={marker ? `Undo swap for ${marker}` : `Swap ${name}`}>
            ↺ SWAP
          </button>
        )}
        <PriceLink card={card} plain={st === 'owned' && !marker} />
      </span>
      {children}
    </li>
  );
}

/** Grid tile version of CardLine: big image, name, swap + price. Opens its note on tap/click only (no hover). */
export function CardTile({ name, img, card, s, note, marker, onOpen, onMenu, children }: Parameters<typeof CardLine>[0]) {
  const st = statusOf(name, s.mine, s.other);
  const src = (card?.img ?? img)?.replace('/small/', '/normal/');
  const press = useMenuPress(onMenu);
  return (
    <li className={`ztile ${st}${onMenu ? ' hasmenu' : ''}`} onClick={onOpen} {...press}>
      <Thumb src={src} className="timg xart" name={name} onPick={st !== 'owned' ? onOpen : undefined} />
      <span className="tname">
        {name}
        {st === 'missing' && <span className="sr">(missing)</span>}
      </span>
      {note && <span className="tnote">{note}</span>}
      {marker && <span className="swapmark">↔ for {marker}</span>}
      {st === 'other' && <span className="tagother">in {s.otherName}</span>}
      <span className="tacts">
        {onOpen && (
          <button className="swapbtn" onClick={(e) => (e.stopPropagation(), onOpen())} aria-label={marker ? `Undo swap for ${marker}` : `Swap ${name}`}>
            ↺ SWAP
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
      {options.map(([v, text], i) => (
        <button key={v} role="radio" className={roman && i > 0 ? 'roman' : ''} aria-checked={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Dropdown in the Discover SORT-box style: black tab label, select, red arrow. */
export function Pick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <label className="sbox pick">
      <span className="tab">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
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
export function HeroStats({ price, fetched, names, children }: { price?: number; fetched: string; names: string[]; children?: React.ReactNode }) {
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

/** Hazard note: cards your decks share more often than you own copies (decks are virtual lists). */
export function ShortAlert({ items }: { items: Shortfall[] }) {
  if (!items.length) return null;
  const row = (s: Shortfall) => (
    <li key={s.name}>
      {shortText(s)}. <small>You own {s.own} · used in {s.decks.join(', ')}</small>
    </li>
  );
  return (
    <aside className="shortalert" role="status">
      <b>⚠ COPIES</b>
      {items.length <= 3 ? (
        <ul>{items.map(row)}</ul>
      ) : (
        <details>
          <summary>
            {items.length} cards are in more decks than you have copies for
          </summary>
          <ul>{items.map(row)}</ul>
        </details>
      )}
    </aside>
  );
}

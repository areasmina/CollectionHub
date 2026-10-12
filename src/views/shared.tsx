import { useEffect, useRef, useState } from 'react';
import { statusOf } from '../lib/compare';
import type { Card } from '../lib/db';
import { cad, rateNote, toCad } from '../lib/prices';

export interface Shared {
  profile: number;
  mine: Map<string, number>;
  other: Map<string, number>;
  otherName: string;
}

/** Estimated CAD price of a card (TCGplayer USD × daily rate), '' when unknown. */
export const usd = (c?: Card) => (c?.usd ? `≈${cad(toCad(c.usd)!)}` : '');

/** Estimated CAD total × quantity; cards without a USD price are left out. */
export const priceSum = (items: { card?: Card; qty: number }[]) => items.reduce((n, i) => n + (toCad(i.card?.usd) ?? 0) * i.qty, 0);
export const money = (n: number) => `${cad(n)} est.`;

// Large card preview: one overlay for the whole app (see PreviewLayer in App).
let setPreview: (p: { src: string; tap: boolean } | null) => void = () => {};
export function PreviewLayer() {
  const [p, set] = useState<{ src: string; tap: boolean } | null>(null);
  useEffect(() => void (setPreview = set), []);
  if (!p) return null;
  return (
    <div className={`preview${p.tap ? ' tap' : ''}`} onClick={() => set(null)} role="dialog" aria-label="Card preview (tap to close)">
      <img src={p.src} alt="" />
    </div>
  );
}

/** Card image: preview after resting the mouse 1 s on it, or right away on tap. */
export function Thumb({ src, size = 36 }: { src?: string; size?: number }) {
  const timer = useRef<number>(undefined);
  if (!src) return <span className="noimg" />;
  const big = src.replace('/small/', '/normal/');
  return (
    <img
      src={src}
      alt=""
      loading="lazy"
      width={size}
      height={Math.round(size * 1.39)}
      onMouseEnter={() => (timer.current = window.setTimeout(() => setPreview({ src: big, tap: false }), 1000))}
      onMouseLeave={() => {
        clearTimeout(timer.current);
        setPreview(null);
      }}
      onClick={(e) => {
        e.stopPropagation();
        clearTimeout(timer.current);
        setPreview({ src: big, tap: true });
      }}
    />
  );
}

export function PriceLink({ card }: { card?: Card }) {
  const price = usd(card);
  if (!price) return null;
  return card?.buy ? (
    <a className="price" href={card.buy} target="_blank" rel="noreferrer" title={rateNote()}>
      {price}
    </a>
  ) : (
    <small className="price" title={rateNote()}>
      {price}
    </small>
  );
}

/** A card line: owned normal, missing greyed, "in <other binder>" labelled. */
export function CardLine({
  name,
  img,
  card,
  s,
  right,
  marker,
  onOpen,
  onClose,
  children,
}: {
  name: string;
  img?: string;
  card?: Card;
  s: Shared;
  right?: React.ReactNode;
  marker?: string; // e.g. the missing card a swap replaces
  onOpen?: () => void; // missing card: open its replacement menu (hover or tap)
  onClose?: () => void;
  children?: React.ReactNode; // menu
}) {
  const st = statusOf(name, s.mine, s.other);
  return (
    <li
      className={`card ${st}${onOpen ? ' swappable' : ''}`}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onClick={onOpen}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => onOpen && e.key === 'Enter' && onOpen()}
    >
      <Thumb src={card?.img ?? img} />
      <span className="cname">
        {name}
        {card?.mana && <small className="mana"> {card.mana}</small>}
        {marker && <small className="swapmark">↔ for {marker}</small>}
        {st === 'other' && <small className="tag">in {s.otherName}</small>}
        {st === 'missing' && <span className="sr">(missing)</span>}
      </span>
      <span className="right">
        {right}
        <PriceLink card={card} />
      </span>
      {children}
    </li>
  );
}

export function Seg({ label, value, options, onChange }: { label: string; value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="seglabel">{label}</span>
      {options.map(([v, text]) => (
        <button key={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

export const Progress = ({ done, total, what = 'Looking up cards on Scryfall' }: { done: number; total: number; what?: string }) => (
  <div className="progress">
    <progress value={done} max={total || 1} /> <span>{total ? `${what}: ${done} / ${total}` : 'Reading…'}</span>
  </div>
);

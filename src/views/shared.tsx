import { useEffect, useRef, useState } from 'react';
import { statusOf } from '../lib/compare';
import type { Card } from '../lib/db';
import { cad, rateNote, toCad } from '../lib/prices';

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

// Large card preview: one overlay for the whole app (PreviewLayer in App).
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
export function Thumb({ src, className = 'thumb xart' }: { src?: string; className?: string }) {
  const timer = useRef<number>(undefined);
  if (!src) return <span className={className} aria-hidden="true" />;
  const big = src.replace('/small/', '/normal/').replace('/art_crop/', '/normal/');
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
          setPreview({ src: big, tap: true });
        }}
      />
    </span>
  );
}

/** Yellow price sticker; links to TCGplayer when Scryfall gives a link. */
export function PriceLink({ card, plain }: { card?: Card; plain?: boolean }) {
  const cls = `price${plain ? ' plain' : ''}`;
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
  children,
}: {
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
  return (
    <li className={`zrow ${st}`} onMouseEnter={onOpen} onMouseLeave={onClose} onClick={onOpen}>
      <Thumb src={card?.img ?? img} />
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

export const Progress = ({ done, total, what = 'Looking up cards on Scryfall' }: { done: number; total: number; what?: string }) => (
  <div className="progress">
    <progress value={done} max={total || 1} /> <span>{total ? `${what}: ${done} / ${total}` : 'Reading…'}</span>
  </div>
);

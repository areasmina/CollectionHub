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
export function CardTile({ name, img, card, s, note, marker, onOpen, children }: Parameters<typeof CardLine>[0]) {
  const st = statusOf(name, s.mine, s.other);
  const src = (card?.img ?? img)?.replace('/small/', '/normal/');
  return (
    <li className={`ztile ${st}`} onClick={onOpen}>
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

export const Progress = ({ done, total, what = 'Looking up cards on Scryfall' }: { done: number; total: number; what?: string }) => (
  <div className="progress">
    <progress value={done} max={total || 1} /> <span>{total ? `${what}: ${done} / ${total}` : 'Reading…'}</span>
  </div>
);

import { useEffect, useState, type ReactNode } from 'react';
import type { Card } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { smallOf } from '../../lib/offlinepics';
import { rateNote } from '../../lib/prices';
import { scryfallUrl, usd } from './helpers';

const canHover = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

type Preview = { src: string; tap: boolean; href?: string; back?: string };
let setPreview: (p: Preview | null) => void = () => {};

/** Large card preview overlay (one instance mounted in App). */
export function PreviewLayer() {
  const [p, set] = useState<Preview | null>(null);
  const [flipped, setFlipped] = useState(false);
  useEffect(() => void (setPreview = set), []);
  useEffect(() => setFlipped(false), [p?.src]);
  if (!p) return null;
  const shown = flipped && p.back ? p.back : p.src;
  return (
    <div className={`preview${p.tap ? ' tap' : ''}`} onClick={() => set(null)} role="dialog" aria-label="Card preview (tap to close)">
      <img src={shown} alt="" />
      {p.back && (
        <button
          type="button"
          className="btn ink flipbig"
          aria-pressed={flipped}
          onClick={(e) => (e.stopPropagation(), haptic('select'), setFlipped(!flipped))}
        >
          ⟳ {flipped ? 'FRONT' : 'BACK'}
        </button>
      )}
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

/** Opens a card big enough to read, with its Scryfall link and back face when double-sided. */
export const openCard = (src: string, name?: string, back?: string) =>
  setPreview({
    src: src.replace('/small/', '/normal/').replace('/art_crop/', '/normal/'),
    tap: true,
    href: name ? scryfallUrl(name) : undefined,
    back: back?.replace('/small/', '/normal/'),
  });

/** Card thumbnail with flip support for two-faced cards, foil glare tracking, and offline fallback. */
export function Thumb({ src, className = 'thumb xart', name, back, onPick }: { src?: string; className?: string; name?: string; back?: string; onPick?: () => void }) {
  const [flipped, setFlipped] = useState(false);
  const [failed, setFailed] = useState('');
  if (!src) return <span className={className} aria-hidden="true" />;
  const sized = (u: string) => (src.includes('/normal/') ? u.replace('/small/', '/normal/') : u);
  const face = flipped && back ? sized(back) : src;
  const big = face.replace('/small/', '/normal/').replace('/art_crop/', '/normal/');
  const bigBack = back ? back.replace('/small/', '/normal/') : undefined;
  const href = name ? scryfallUrl(name) : undefined;
  const foil = className.includes('foil');
  const track = (e: React.PointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty('--gx', `${Math.round(((e.clientX - r.left) / r.width) * 100)}%`);
    e.currentTarget.style.setProperty('--gy', `${Math.round(((e.clientY - r.top) / r.height) * 100)}%`);
    e.currentTarget.classList.add('tracking');
  };
  return (
    <span className={`${className}${back ? ' twoface' : ''}${flipped ? ' flipped' : ''}`} onPointerMove={foil ? track : undefined} onPointerLeave={foil ? (e) => e.currentTarget.classList.remove('tracking') : undefined}>
      <img
        src={failed === face ? smallOf(face) : face}
        alt=""
        loading="lazy"
        onError={() => failed !== face && smallOf(face) && smallOf(face) !== face && setFailed(face)}
        onClick={(e) => {
          e.stopPropagation();
          if (onPick) return onPick();
          if (href && canHover()) return void window.open(href, '_blank', 'noopener');
          haptic('open');
          setPreview({ src: big, tap: true, href, back: flipped ? src.replace('/small/', '/normal/') : bigBack });
        }}
      />
      {back && (
        <button
          type="button"
          className="flipbtn"
          aria-pressed={flipped}
          aria-label={flipped ? `Show the front of ${name ?? 'this card'}` : `Show the back of ${name ?? 'this card'}`}
          title={flipped ? 'Show the front' : 'Show the back'}
          onClick={(e) => (e.stopPropagation(), haptic('select'), setFlipped(!flipped))}
        >
          <span aria-hidden="true">⟳</span>
          <span className="fliplbl" aria-hidden="true">{flipped ? 'FRONT' : 'BACK'}</span>
        </button>
      )}
      <span className="pen" aria-hidden="true" />
    </span>
  );
}

/** Yellow price sticker; links to TCGplayer when Scryfall gives a link. */
export function PriceLink({ card, plain, tape, crown }: { card?: Card; plain?: boolean; tape?: string; crown?: boolean }) {
  let h = 0;
  for (const ch of tape ?? '') h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const cls = `price${plain ? ' plain' : ''}${tape ? ` tapey y${h % 5} t${(h >> 3) % 4}` : ''}`;
  const mark = crown ? (
    <svg className="pcrown" viewBox="0 0 24 20" aria-hidden="true" focusable="false">
      <path d="M2 16 L1 4 L7 10 L12 2 L17 10 L23 4 L22 16 Z" />
    </svg>
  ) : null;
  if (!card?.usd) return null;
  return card.buy ? (
    <a className={cls} href={card.buy} target="_blank" rel="noreferrer" title={crown ? `${rateNote()} · can be your commander` : rateNote()} onClick={(e) => e.stopPropagation()}>
      {mark}
      {usd(card)}
    </a>
  ) : (
    <span className={cls} title={crown ? `${rateNote()} · can be your commander` : rateNote()}>
      {mark}
      {usd(card)}
    </span>
  );
}

/** The commander's big card is its menu button, with ⋯ OPTIONS underneath. */
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

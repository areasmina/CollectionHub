import { useRef, type ReactNode } from 'react';
import { statusOf } from '../../lib/compare';
import type { Card } from '../../lib/db';
import { dragEnd, dragStart } from '../../lib/drag';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import { PriceLink, Thumb } from './CardPreview';
import type { Shared } from './helpers';

/** Right-click or 0.5s press-and-hold opens a card menu at that spot. */
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
      if (e.clientX === 0 && e.clientY === 0) {
        const r = e.currentTarget.getBoundingClientRect();
        return onMenu(r.left + r.width / 2, r.top + r.height / 2);
      }
      onMenu(e.clientX, e.clientY);
    },
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
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

/** Mana cost rendered as circular MTG mana pips. */
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

const dragProps = (name: string, on?: boolean) => (on ? { draggable: true, onDragStart: (e: React.DragEvent) => dragStart(e, name, 'deck'), onDragEnd: dragEnd } : {});

export interface CardRowProps {
  drag?: boolean;
  markText?: string;
  quiet?: boolean;
  eager?: boolean;
  onMenu?: (x: number, y: number) => void;
  foil?: boolean;
  name: string;
  img?: string;
  card?: Card;
  s: Shared;
  note?: ReactNode;
  marker?: string;
  onOpen?: () => void;
  onClose?: () => void;
  children?: ReactNode;
}

/** List row representation of a deck card. */
export function CardLine({ name, img, card, s, note, marker, markText, quiet, onOpen, onMenu, foil, drag, children }: CardRowProps) {
  const st = statusOf(name, s.mine, s.other);
  const press = useMenuPress(onMenu);
  const ownQty = s.mine.get(norm(name)) ?? 0;

  return (
    <li className={`zrow ${st}${onMenu ? ' hasmenu' : ''}`} data-card={name} onClick={onOpen} {...press} {...dragProps(name, drag)}>
      <Thumb src={card?.img ?? img} back={card?.back} className={`thumb xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
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
          {st === 'missing' && <span className="zrow-missing-badge">MISSING · NEEDS 1</span>}
          {st === 'other' && <span className="tagother">in {s.otherName}</span>}
          {(markText ?? marker) && <span className="swapmark">{markText ?? `↔ for ${marker}`}</span>}
          {card?.legal === false && (
            <span className="bannedtag" title="Not legal in Commander (Scryfall)">
              BANNED
            </span>
          )}
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

/** Grid tile representation of a deck card. */
export function CardTile({ name, img, card, s, note, marker, markText, eager, onOpen, onMenu, foil, drag, children }: CardRowProps) {
  const st = statusOf(name, s.mine, s.other);
  const src = (card?.img ?? img)?.replace('/small/', '/normal/');
  const press = useMenuPress(onMenu);
  return (
    <li className={`ztile ${st}${onMenu ? ' hasmenu' : ''}`} data-card={name} onClick={onOpen} tabIndex={onOpen ? undefined : 0} {...press} {...dragProps(name, drag)}>
      <Thumb src={src} back={card?.back} eager={eager} className={`timg xart${foil ? ' foil' : ''}`} name={name} onPick={st !== 'owned' ? onOpen : undefined} />
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
      <PriceLink card={card} tape={name} />
      {children}
    </li>
  );
}

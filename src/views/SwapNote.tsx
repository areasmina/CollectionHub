import { haptic } from '../lib/haptics';
import { useRef, useState } from 'react';
import { reasonsFor, whyIn, type SubCard } from '../lib/subs';
import { scryfallUrl, showPreview } from './shared';
import { Tape } from './zine';

// Hover preview only with a real mouse: a tap on a phone also fires a fake hover.
const mouse = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export interface SwapOption {
  sub: SubCard;
  img?: string; // small image
  big?: string; // readable image
  owned: number;
}

/** A suggestion row: hover (mouse) shows it in the viewer; press and hold (touch) shows it full screen; tap swaps. */
function Option({ o, missing, onPick, onLook }: { o: SwapOption; missing: SubCard; onPick: () => void; onLook: (src?: string) => void }) {
  const timer = useRef<number>(undefined);
  const held = useRef(false);
  return (
    <li>
      <button
        onClick={() => (held.current ? (held.current = false) : onPick())}
        onPointerEnter={(e) => e.pointerType === 'mouse' && mouse() && onLook(o.big)}
        onFocus={(e) => mouse() && e.target.matches(':focus-visible') && onLook(o.big)}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' || !o.big) return;
          held.current = false;
          timer.current = window.setTimeout(() => ((held.current = true), haptic('open'), showPreview(o.big!)), 350);
        }}
        onPointerUp={() => (clearTimeout(timer.current), held.current && showPreview(null))}
        onPointerCancel={() => (clearTimeout(timer.current), showPreview(null))}
      >
        {o.img && <img src={o.img} alt="" loading="lazy" />}
        <span>
          <b>{o.sub.name}</b>
          <span className="whys">
            {reasonsFor(missing, o.sub, o.owned).map((r) => (
              <span key={r}>{r}</span>
            ))}
          </span>
        </span>
      </button>
    </li>
  );
}

/** Swap note: replace a missing card with one you own. Desktop: big readable viewer + suggestions with reasons. */
export function SwapNote({
  name,
  missing,
  big,
  replaced,
  options,
  loading,
  onPick,
  onUndo,
  onClose,
  empty = 'No owned card fits this slot.',
}: {
  empty?: string; // shown when there are no suggestions
  name: string;
  missing: SubCard;
  big?: string;
  replaced?: string;
  options: SwapOption[];
  loading: boolean;
  onPick: (sub: string) => void;
  onUndo: () => void;
  onClose: () => void;
}) {
  const [look, setLook] = useState<string | undefined>();
  const shown = look ?? big;
  const why = whyIn(missing);
  return (
    <div className="note-pop swapnote" role="dialog" aria-label={`Replace ${name}`} onClick={(e) => e.stopPropagation()}>
      <Tape style={{ top: -12, left: '40%', width: 90, height: 24, transform: 'rotate(4deg)' }} />
      <div className="nh">
        <span>
          {replaced ? 'SWAPPED FOR ' : 'REPLACE '}
          <mark>{name.toUpperCase()}</mark>
          {replaced ? '' : ' WITH ONE OF YOURS'}
        </span>
        <button className="close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="3" />
          </svg>
        </button>
      </div>
      <div className="swapbody">
        <div className="viewer" onMouseLeave={() => setLook(undefined)}>
          {shown && <img src={shown} alt="" />}
          <small>{look ? `↔ instead of ${name}` : 'why it’s in the deck'}</small>
          {!look && why.length > 0 && (
            <span className="whys">
              {why.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </span>
          )}
          <a className="scrylink" href={scryfallUrl(name)} target="_blank" rel="noreferrer">
            {name} on Scryfall ↗
          </a>
        </div>
        <div className="picks" onMouseLeave={() => setLook(undefined)}>
          {replaced ? (
            <ul>
              <li>
                <button onClick={onUndo}>
                  <span>
                    <b>UNDO SWAP</b>
                    <small>back to {name}</small>
                  </span>
                </button>
              </li>
            </ul>
          ) : (
            <>
              <small className="hint">your cards that fit this slot{mouse() ? ' · hover to read one' : ' · hold one to read it'}</small>
              <ul>
                {options.map((o) => (
                  <Option key={o.sub.name} o={o} missing={missing} onPick={() => onPick(o.sub.name)} onLook={setLook} />
                ))}
              </ul>
              {options.length === 0 && <p className="small">{loading ? 'Loading suggestions…' : empty}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

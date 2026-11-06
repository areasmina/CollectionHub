import { haptic } from '../lib/haptics';
import { useRef, useState } from 'react';
import { type PinSide } from '../lib/pins';
import { searchByText } from '../lib/search';
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
  text?: string; // rules text (Oracle + reminder text), for the search
}

/** A suggestion row: hover (mouse) shows it in the viewer; press and hold (touch) shows it full screen; tap swaps. */
function Option({ o, missing, onPick, onLook }: { o: SwapOption; missing: SubCard; onPick: () => void; onLook: (src?: string) => void }) {
  const timer = useRef<number>(undefined);
  const held = useRef(false);
  return (
    <li>
      <button
        draggable={mouse()}
        onDragStart={(e) => (e.dataTransfer.setData('text/x-card', o.sub.name), (e.dataTransfer.effectAllowed = 'move'), onLook(o.big))}
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

/**
 * Swap window, for every card in the deck: the 3 owned cards that fit the slot best, a search over your whole binder
 * (in the commander's colours), undo, and pins (📌 always in / 💀 never use) that hold for every deck of this commander.
 */
export function SwapNote({
  name,
  missing,
  big,
  replaced,
  options,
  pool,
  loading,
  pin,
  canPinIn,
  cmdr,
  onPick,
  onUndo,
  onPin,
  onClose,
}: {
  name: string; // EDHREC's card in this slot
  missing: SubCard;
  big?: string;
  replaced?: string; // the card you put in its place
  options: SwapOption[];
  pool: SwapOption[]; // your cards that can go in (search)
  loading: boolean;
  pin?: PinSide; // pin on the card now in the slot
  canPinIn: boolean; // you own the card now in the slot
  cmdr: string;
  onPick: (sub: string) => void;
  onUndo: () => void;
  onPin?: (side: PinSide) => void; // no commander: no pins
  onClose: () => void;
}) {
  const [look, setLook] = useState<string | undefined>();
  const [q, setQ] = useState('');
  const [over, setOver] = useState(false); // a card dragged over the slot
  const shown = look ?? big;
  const why = whyIn(missing);
  const now = replaced ?? name;
  const top = new Set(options.map((o) => o.sub.name));
  // name or rules text (Oracle + reminder text) or type line
  const found = searchByText(
    pool.filter((o) => !top.has(o.sub.name)),
    q,
    (o) => ({ name: o.sub.name, type: o.sub.type, text: o.text }),
  ).slice(0, 6);
  const row = (o: SwapOption) => <Option key={o.sub.name} o={o} missing={missing} onPick={() => (setQ(''), onPick(o.sub.name))} onLook={setLook} />;
  return (
    <div className="note-pop swapnote" role="dialog" aria-label={`Swap ${now}`} onClick={(e) => e.stopPropagation()}>
      <Tape
        style={{
          top: -12,
          left: '40%',
          width: 90,
          height: 24,
          transform: 'rotate(4deg)',
        }}
      />
      <div className="nh">
        <span>
          SWAP <mark>{now.toUpperCase()}</mark>
          {replaced && <small className="was"> · was {name}</small>}
        </span>
        {/* Search sits up top beside the title: any card of yours, by name or rules text */}
        <label className="swapq top">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search your binder: name or rules text…" aria-label="Search your binder" autoComplete="off" />
        </label>
        <button className="close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="3" />
          </svg>
        </button>
      </div>
      <div className="swapbody">
        <div
          className={`viewer${over ? ' dropover' : ''}`}
          onMouseLeave={() => setLook(undefined)}
          onDragOver={(e) => e.dataTransfer.types.includes('text/x-card') && (e.preventDefault(), setOver(true))}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            const card = e.dataTransfer.getData('text/x-card');
            setOver(false);
            if (card) (e.preventDefault(), haptic('success'), setQ(''), onPick(card));
          }}
        >
          {shown && <img src={shown} alt="" />}
          <small>{look ? `↔ instead of ${now}` : replaced ? `EDHREC’s card for this slot` : 'why it’s in the deck'}</small>
          {!look && why.length > 0 && (
            <span className="whys">
              {why.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </span>
          )}
          <a className="scrylink" href={scryfallUrl(now)} target="_blank" rel="noreferrer">
            {now} on Scryfall ↗
          </a>
        </div>
        <div className="picks" onMouseLeave={() => setLook(undefined)}>
          {replaced && (
            <ul>
              <li>
                <button className="undo" onClick={onUndo}>
                  <span>
                    <b>↺ UNDO</b>
                    <small>back to {name}</small>
                  </span>
                </button>
              </li>
            </ul>
          )}
          <small className="hint">
            {q.trim().length >= 2 ? `your cards matching “${q.trim()}”` : 'top 3 from your binder'}
            {mouse() ? ' · hover to read one, click or drag it onto the card' : ' · hold one to read it'}
          </small>
          {/* While you search, the results take the top-3 spot */}
          {q.trim().length >= 2 ? (
            found.length ? (
              <ul className="found">{found.map(row)}</ul>
            ) : (
              <p className="small">No card of yours in these colours matches “{q}”.</p>
            )
          ) : (
            <>
              <ul>{options.map(row)}</ul>
              {options.length === 0 && <p className="small">{loading ? 'Loading suggestions…' : 'No card of yours fits this slot by role. Search up top.'}</p>}
            </>
          )}
          {onPin && (
            <div className="pinrow" role="group" aria-label={`Pins for every ${cmdr} deck`}>
              <button
                aria-pressed={pin === 'in'}
                disabled={!canPinIn && pin !== 'in'}
                title={canPinIn ? '' : 'Only cards you own can be pinned in'}
                onClick={() => (haptic(pin === 'in' ? 'undo' : 'success'), onPin('in'))}
              >
                📌 ALWAYS IN
              </button>
              <button aria-pressed={pin === 'out'} onClick={() => (haptic(pin === 'out' ? 'undo' : 'success'), onPin('out'))}>
                💀 NEVER USE
              </button>
              <small>for every {cmdr} deck</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

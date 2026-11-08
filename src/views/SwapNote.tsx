import { haptic } from '../lib/haptics';
import { useEffect, useRef, useState } from 'react';
import { type PinSide } from '../lib/pins';
import { searchByText } from '../lib/search';
import { reasonsFor, whyIn, type SubCard } from '../lib/subs';
import { comboBreaks, swapEffect } from '../brain/combos';
import { scryfallUrl, showPreview } from './shared';
import { WhyCard } from './Verdict';
import type { Why } from '../brain/why';

// Hover preview only with a real mouse: a tap on a phone also fires a fake hover.
const mouse = () => typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;

export interface SwapOption {
  sub: SubCard;
  img?: string; // small image
  big?: string; // readable image
  owned: number;
  text?: string; // rules text (Oracle + reminder text), for the search
  inUse?: { text: string; lock: boolean; colour?: string }; // "in Atraxa" / "held by Atraxa" (only when another deck uses it)
}

/** A suggestion row: hover (mouse) shows it in the viewer; press and hold (touch) shows it full screen; tap swaps. */
function Option({ o, missing, notes = [], onPick, onLook }: { o: SwapOption; missing: SubCard; notes?: { text: string; warn?: boolean }[]; onPick: () => void; onLook: (src?: string) => void }) {
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
            {notes.map((n) => (
              <span key={n.text} className={n.warn ? 'cwarn' : 'cgain'}>
                {n.text}
              </span>
            ))}
            {reasonsFor(missing, o.sub, o.owned).map((r) => (
              <span key={r}>{r}</span>
            ))}
          </span>
          {o.inUse && (
            <span className="inchip" style={o.inUse.colour ? ({ '--dc': o.inUse.colour } as React.CSSProperties) : undefined}>
              <i aria-hidden="true" />
              {o.inUse.lock && <span aria-label="reserved">🔒</span>}
              {o.inUse.text}
            </span>
          )}
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
  deck,
  bracket = 4,
  whyCard,
}: {
  deck?: string[]; // every card in the deck now (commander included): for combo warnings
  whyCard?: Why; // the brain's "Why this card?" for the card in the slot now
  bracket?: number; // 2–5: which combos the rules allow
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
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // Esc closes it (and with it the backdrop); Tab stays inside the window; focus starts in it and goes back after.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    box.current?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return e.stopPropagation(), close.current();
      if (e.key !== 'Tab' || !box.current) return;
      const f = [...box.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, a[href]')];
      if (!f.length) return;
      const [first, last] = [f[0], f[f.length - 1]];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box.current)) (e.preventDefault(), last.focus());
      else if (!e.shiftKey && document.activeElement === last) (e.preventDefault(), first.focus());
    };
    document.addEventListener('keydown', key);
    return () => (document.removeEventListener('keydown', key), back?.focus?.({ preventScroll: true }));
  }, []);
  const shown = look ?? big;
  const why = whyIn(missing);
  const now = replaced ?? name;
  const top = new Set(options.map((o) => o.sub.name));
  // name or rules text (Oracle + reminder text) or type line. Results replace the top 3 while you search, so the top 3
  // are searched too (a card that's already a top pick must still turn up when you type its name).
  const found = searchByText(
    [...options, ...pool.filter((o) => !top.has(o.sub.name))],
    q,
    (o) => ({ name: o.sub.name, type: o.sub.type, text: o.text }),
  ).slice(0, 6);
  // Combos (Commander Spellbook): what taking this card out breaks, and what each option completes.
  const breaks = deck ? comboBreaks(now, deck) : [];
  const notesFor = (o: SwapOption) => {
    if (!deck) return [];
    const e = swapEffect(now, o.sub.name, deck, bracket);
    return [
      ...e.lost.map((c) => ({ text: `▲ breaks ${c.cards.join(' + ')}`, warn: true })),
      ...e.gained.map((c) => (e.gainedBlocked.includes(c) ? { text: `▲ completes ${c.cards.join(' + ')}: not allowed in bracket ${bracket}`, warn: true } : { text: `combo: ${c.cards.join(' + ')}` })),
    ];
  };
  const row = (o: SwapOption) => <Option key={o.sub.name} o={o} missing={missing} notes={notesFor(o)} onPick={() => (setQ(''), onPick(o.sub.name))} onLook={setLook} />;
  return (
    <div ref={box} tabIndex={-1} className="note-pop swapnote" role="dialog" aria-modal="true" aria-label={`Swap ${now}`} onClick={(e) => e.stopPropagation()}>
      <div className="nh">
        <div className="swap-title-wrap">
          <span className="swap-title">
            SWAP <mark>{now.toUpperCase()}</mark> <span className="swap-for">FOR</span>
          </span>
          {replaced && <span className="was">was {name}</span>}
        </div>
        {/* Search sits up top beside the title: any card of yours, by name or rules text */}
        <label className="swapq top">
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search your binder: name or rules text…" aria-label="Search your binder" autoComplete="off" />
        </label>
        <button className="close" aria-label="Close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
            <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="2.5" />
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
          <small className="slot-role-tag">{look ? `↔ instead of ${now}` : replaced ? `EDHREC’s card for this slot` : 'why it’s in the deck'}</small>
          {whyCard && (
            // kept in place while a suggestion is previewed, so the drop target doesn't change size mid-drag
            <div style={look ? { visibility: 'hidden' } : undefined}>
              <WhyCard why={whyCard} />
            </div>
          )}
          {!look && !whyCard && why.length > 0 && (
            <span className="whys">
              {why.map((r) => (
                <span key={r}>{r}</span>
              ))}
            </span>
          )}
          {!look && !whyCard && breaks.length > 0 && (
            <p className="combowarn" role="note">
              ▲ Part of {breaks.length > 1 ? `${breaks.length} combos` : 'a combo'}: {breaks.slice(0, 3).map((c) => c.cards.join(' + ')).join(' · ')}. Swapping it out breaks {breaks.length > 1 ? 'them' : 'it'}.
            </p>
          )}
          <a className="scrylink" href={scryfallUrl(now)} target="_blank" rel="noreferrer">
            <span>{now} on Scryfall</span> ↗
          </a>
        </div>
        <div className="picks" onMouseLeave={() => setLook(undefined)}>
          {replaced && (
            <div className="undo-row">
              <button className="undo" onClick={onUndo} title={`Revert swap back to ${name}`}>
                <span>
                  <b>↺ UNDO</b>
                  <small>back to {name}</small>
                </span>
                <span className="undo-badge">RESTORE</span>
              </button>
            </div>
          )}
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
          {/* Indicator text placed at the bottom */}
          <small className="hint">
            {q.trim().length >= 2 ? `your cards matching “${q.trim()}”` : 'top 3 from your binder'}
            {mouse() ? ' · hover to preview, click or drag onto card' : ' · hold one to read it'}
          </small>
          {onPin && (
            <div className="pinrow" role="group" aria-label={`Pins for every ${cmdr} deck`}>
              <div className="pin-btns">
                <button
                  type="button"
                  className={`pin-btn pin-in${pin === 'in' ? ' is-active' : ''}`}
                  aria-pressed={pin === 'in'}
                  disabled={!canPinIn && pin !== 'in'}
                  title={canPinIn ? 'Always keep this card in every deck of this commander' : 'Only cards you own can be pinned in'}
                  onClick={() => (haptic(pin === 'in' ? 'undo' : 'success'), onPin('in'))}
                >
                  <span className="pin-tag-mark" aria-hidden="true">{pin === 'in' ? '★' : '☆'}</span>
                  <span>ALWAYS IN</span>
                </button>
                <button
                  type="button"
                  className={`pin-btn pin-out${pin === 'out' ? ' is-active' : ''}`}
                  aria-pressed={pin === 'out'}
                  title="Never suggest or include this card in decks of this commander"
                  onClick={() => (haptic(pin === 'out' ? 'undo' : 'success'), onPin('out'))}
                >
                  <span className="pin-tag-mark" aria-hidden="true">✕</span>
                  <span>NEVER USE</span>
                </button>
              </div>
              <small className="pin-hint">Pinned for every <b>{cmdr || 'this commander'}</b> deck</small>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

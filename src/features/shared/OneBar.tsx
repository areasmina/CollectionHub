import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../../lib/haptics';
import { swipeCloses, swipeOffset } from '../../lib/swipe';
import { Ransom } from '../../views/zine';
import './one-bar.css';

/*
 * THE ONE BAR (Guillermo, Nov 28, "Search · FILTER · DISPLAY"): every list screen gets one slim row.
 *   FILTER  · first, where ⋮ used to be: decides which cards show; a count when something narrows the list.
 *   search  · the widest part: finds.
 *   DISPLAY · last: decides how the cards look and in what order (view, size, sort, group); its label names what is on,
 *             "GRID · M", so the view and size are never lost behind it.
 * Under the bar, a row of removable chips appears only while a filter is on. Page actions (export, share, tools) never
 * sit on this bar. Both buttons open the same Sheet: a bottom sheet on phones (swipe it down to close), a panel wider.
 */

/** The row itself. It keeps the old bar's classes, so pinning, the island lane and the hairlines carry over. */
export function OneBar({ label, filter, search, display }: { label: string; filter: ReactNode; search: ReactNode; display: ReactNode }) {
  return (
    <div className="dtools tbar onebar" role="toolbar" aria-label={label}>
      {filter}
      {search}
      {display}
    </div>
  );
}

const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
    <path d="M2 4h14M5 9h8M7.5 14h3" fill="none" stroke="currentColor" strokeWidth="2" />
  </svg>
);

/** FILTER: first on the bar, with a count badge when something narrows the list. */
export function FilterBtn({ count, onClick, what, open }: { count: number; onClick: () => void; /** "decks" → "Filter decks" */ what?: string; open?: boolean }) {
  const name = what ? `Filter ${what}` : 'Filter';
  return (
    <button
      type="button"
      className={`fbtn ob-filter${count ? ' on' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={!!open}
      aria-label={count ? `${name}, ${count} active` : name}
      onClick={() => (haptic('open'), onClick())}
    >
      <FilterIcon />
      <span className="flabel">FILTER</span>
      {count > 0 && <b className="fcount">{count}</b>}
    </button>
  );
}

/** DISPLAY: last on the bar; it names the view and size that are on ("GRID · M", "LIST"). A small dot says the sort
 *  or grouping is not the page's usual one (Guillermo, Nov 28: "so I can tell at a glance"); `changed` names it. */
export function DisplayBtn({ now, onClick, open, changed }: { now: string; onClick: () => void; open?: boolean; changed?: string }) {
  return (
    <button
      type="button"
      className="ob-display"
      aria-haspopup="dialog"
      aria-expanded={!!open}
      aria-label={`Display: ${now}${changed ? `, ${changed}` : ''}. View, size and sort`}
      title={changed ? `Display: ${changed}` : 'Display: view, size, sort'}
      onClick={() => (haptic('open'), onClick())}
    >
      <span className="ob-now">{now}</span>
      {changed && <i className="ob-dot" aria-hidden="true" />}
      <span className="ob-caret" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}

/** One setting inside a sheet: its name (with the current value), then one button per choice. */
export function Choice<T extends string>({ label, value, options, onChange, now }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void; now?: string }) {
  return (
    <div className="fs-group ob-choice">
      <span className="lbl">
        {label}
        {now !== undefined && <em className="ob-val">{now}</em>}
      </span>
      <div className="fs-row" role="group" aria-label={label}>
        {options.map(([v, t]) => (
          <button key={v} type="button" className="u-chip" aria-pressed={value === v} onClick={() => (haptic('select'), onChange(v))}>
            {t}
          </button>
        ))}
      </div>
    </div>
  );
}

const PHONE = '(max-width: 700px)';

/**
 * The one sheet both buttons open: in the page body (not inside the sticky bar, whose layer would put it under the
 * bottom nav), over a dimmed page. ✕, Escape or a tap on the dimmed page closes it; on a phone so does a swipe down
 * on its top edge. Focus moves into it and goes back to the button that opened it.
 */
export function Sheet({ title, seed, label, onClose, children, foot, className = '' }: { title: string; seed: number; label: string; onClose: () => void; children: ReactNode; foot?: ReactNode; className?: string }) {
  const closeBtn = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ y: number; t: number; id: number } | null>(null);
  const [dy, setDy] = useState(0);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // once per opening: focus in, Escape closes, focus back to the opener on the way out
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    addEventListener('keydown', esc);
    return () => (removeEventListener('keydown', esc), void back?.focus?.({ preventScroll: true }));
  }, []);

  const down = (e: React.PointerEvent) => {
    if (!matchMedia(PHONE).matches || (e.target as HTMLElement).closest('button')) return;
    drag.current = { y: e.clientY, t: e.timeStamp, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => drag.current?.id === e.pointerId && setDy(swipeOffset(e.clientY - drag.current.y));
  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    if (swipeCloses(e.clientY - d.y, e.timeStamp - d.t)) (haptic('tap'), onClose());
    else setDy(0);
  };

  return createPortal(
    <>
      <div className="backdrop fbackdrop" onClick={onClose} />
      <div
        className={`fsheet2 ob-sheet${dy ? ' ob-dragging' : ''}${className ? ` ${className}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={dy ? { transform: `translateY(${dy}px)` } : undefined}
      >
        <div className="nh ob-grab" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
          <span className="ob-handle" aria-hidden="true" />
          <span aria-hidden="true">
            <Ransom text={title} size={24} seed={seed} />
          </span>
          <button ref={closeBtn} type="button" className="close" onClick={onClose} aria-label={`Close ${label.toLowerCase()}`}>
            ✕
          </button>
        </div>
        <div className="fs-body">{children}</div>
        {foot && <div className="fs-foot">{foot}</div>}
      </div>
    </>,
    document.body,
  );
}

/** Under the bar while something narrows the list: one removable chip each, Clear all, and how many are left. */
export function BarChips({ chips, clear, shown, total, noun = 'cards' }: { chips: { key: string; label: string; off: () => unknown }[]; clear: () => unknown; shown?: number; total?: number; noun?: string }) {
  if (!chips.length) return null;
  return (
    <div className="fchips" role="group" aria-label="Active filters">
      {chips.map((c) => (
        <button key={c.key} type="button" className="fchip" aria-label={`Remove filter ${c.label}`} onClick={() => (haptic('select'), void c.off())}>
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      <button
        type="button"
        className="fclear"
        onClick={() => (haptic('select'), void clear())}
      >
        Clear all
      </button>
      {shown !== undefined && total !== undefined && (
        <span className="fcounts" role="status">
          {shown.toLocaleString()} of {total.toLocaleString()} {noun} shown
        </span>
      )}
    </div>
  );
}

import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { diamonds, meterCells } from '../lib/parts';

/**
 * THE OVERHAUL's seven parts (docs/THE_OVERHAUL.md, rule 5). Content is quiet: flat, hairline borders, the 4·8·12·16·24·32·48
 * scale (styles in src/ui.css). Button, Chip and Sticker are plain class names (`u-btn`, `u-chip`, `u-sticker`) so any
 * element can wear them; Panel, Sheet, Menu and Meter carry behaviour or markup and live here.
 */

/** Panel: carbon paper with hairline dividers. */
export function Panel({ label, className = '', children }: { label?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`u-panel ${className}`} aria-label={label}>
      {children}
    </section>
  );
}

/** Sheet / drawer: a 360px side drawer on wide screens, a bottom sheet on phones. Esc, ✕ or a tap outside closes it. */
export function Sheet({ label, onClose, children }: { label: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    ref.current?.focus();
    return () => removeEventListener('keydown', esc);
  }, [onClose]);
  // On <body>, so it sits over the top bar and every sticky bar (pages make their own stacking layers).
  return createPortal(
    <>
      <div className="u-scrim" onClick={onClose} aria-hidden="true" />
      <div className="u-sheet" role="dialog" aria-label={label} tabIndex={-1} ref={ref}>
        <div className="u-sheethead">
          <span className="u-grab" aria-hidden="true" />
          <b>{label}</b>
          <button type="button" className="u-btn ghost u-x" aria-label="Close" onClick={() => (haptic('tap'), onClose())}>
            ✕
          </button>
        </div>
        <div className="u-sheetbody">{children}</div>
      </div>
    </>,
    document.body,
  );
}

/** Menu: a small popover under a chip-style button (one per control; the page's ⋮ is the ToolBar). */
export function Menu({ label, summary, className = '', children }: { label: string; summary: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute('open');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ref.current?.open && (ref.current.removeAttribute('open'), ref.current.querySelector('summary')?.focus());
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => (removeEventListener('pointerdown', out), removeEventListener('keydown', esc));
  }, []);
  return (
    <details className={`u-menu ${className}`} ref={ref} onToggle={(e) => e.currentTarget.open && haptic('open')}>
      <summary aria-label={label}>{summary}</summary>
      <div className="u-menubody">{children}</div>
    </details>
  );
}

/**
 * Meter: slanted bars for a match %. Default: green. `tone` colours the lit bars along a gradient by position:
 * 'discover' runs red (0%) to green (100%); 'deck' runs blue to purple as the deck fills.
 */
export function Meter({ pct, label, tone }: { pct: number; label: string; tone?: 'discover' | 'deck' }) {
  const cells = meterCells(pct);
  return (
    <span className="u-meter" role="img" aria-label={label}>
      {cells.map((on, i) => {
        const f = (i + 0.5) / cells.length;
        const hue = tone === 'discover' ? 120 * f : tone === 'deck' ? 215 + 65 * f : undefined;
        return <i key={i} className={on ? 'on' : ''} style={on && hue !== undefined ? { background: `hsl(${hue.toFixed(0)} 85% 55%)` } : undefined} />;
      })}
    </span>
  );
}

/** Arena-style copy diamonds: ◆ owned, ◇ still needed. */
export function Diamonds({ own, need }: { own: number; need: number }) {
  return (
    <span className="u-dia" aria-label={`${Math.min(own, need)} of ${need} owned`}>
      {diamonds(own, need)}
    </span>
  );
}

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../lib/haptics';
import { COLOURS, COLOUR_NAME, SHOW_LABEL, TYPES, filterChips, filterCount, noFilter, toggled, type CollFilter, type Show } from '../lib/collfilter';

/** The Filter button of the control strip: a count when something narrows the list, and a sheet with the choices.
 *  The sheet sits at the bottom of the screen on a phone (thumb reach) and as a panel on wider screens. */
export function FilterButton({ filter, setFilter, shown, total }: { filter: CollFilter; setFilter: (f: CollFilter) => void; shown: number; total: number }) {
  const [open, setOpen] = useState(false);
  const n = filterCount(filter);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);
  const pick = (kind: 'colours' | 'types' | 'show', v: string) => (haptic('select'), setFilter(toggled(filter, kind, v)));
  return (
    <>
      <button type="button" className={`fbtn${n ? ' on' : ''}`} aria-haspopup="dialog" aria-expanded={open} aria-label={n ? `Filter, ${n} active` : 'Filter'} onClick={() => (haptic('open'), setOpen(true))}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M2 4h14M5 9h8M7.5 14h3" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className="flabel">FILTER</span>
        {n > 0 && <b className="fcount">{n}</b>}
      </button>
      {open &&
        // in the page body, not inside the sticky bar: the bar's own layer would put the sheet under the bottom nav
        createPortal(
        <>
          <div className="backdrop fbackdrop" onClick={() => setOpen(false)} />
          <div className="fsheet2" role="dialog" aria-modal="true" aria-label="Filter cards">
            <div className="nh">
              <span>FILTER <mark>CARDS</mark></span>
              <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close filter">✕</button>
            </div>
            <div className="fs-body">
              <div className="fs-group">
                <span className="lbl">Colours</span>
                <div className="fs-row">
                  {COLOURS.map((c) => (
                    <button key={c} type="button" className={`pip pip-${c}`} aria-pressed={filter.colours.includes(c)} aria-label={COLOUR_NAME[c]} title={COLOUR_NAME[c]} onClick={() => pick('colours', c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fs-group">
                <span className="lbl">Type</span>
                <div className="fs-row">
                  {TYPES.map((t) => (
                    <button key={t} type="button" className="u-chip" aria-pressed={filter.types.includes(t)} onClick={() => pick('types', t)}>
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="fs-group">
                <span className="lbl">Show</span>
                <div className="fs-row">
                  {(Object.keys(SHOW_LABEL) as Show[]).filter((s) => s !== 'all').map((s) => (
                    <button key={s} type="button" className="u-chip" aria-pressed={filter.show === s} onClick={() => pick('show', s)}>
                      {SHOW_LABEL[s]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="fs-foot">
              <button type="button" className="u-btn ghost" disabled={!n} onClick={() => (haptic('select'), setFilter(noFilter()))}>
                RESET
              </button>
              <button type="button" className="u-btn primary" onClick={() => setOpen(false)}>
                SHOW {shown.toLocaleString()} {shown === 1 ? 'CARD' : 'CARDS'}
                {n > 0 && total !== shown ? ` OF ${total.toLocaleString()}` : ''}
              </button>
            </div>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

/** Under the bar: one removable chip per active filter, "Clear all", and how many cards are left. Hidden when nothing is on. */
export function ActiveChips({ filter, setFilter, shown, total }: { filter: CollFilter; setFilter: (f: CollFilter) => void; shown: number; total: number }) {
  const chips = filterChips(filter);
  if (!chips.length) return null;
  return (
    <div className="fchips" role="group" aria-label="Active filters">
      {chips.map((c) => (
        <button key={c.kind + c.value} type="button" className="fchip" aria-label={`Remove filter ${c.label}`} onClick={() => (haptic('select'), setFilter(toggled(filter, c.kind, c.value)))}>
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      <button type="button" className="fclear" onClick={() => (haptic('select'), setFilter(noFilter()))}>
        Clear all
      </button>
      <span className="fcounts" role="status">
        {shown.toLocaleString()} of {total.toLocaleString()} cards shown
      </span>
    </div>
  );
}

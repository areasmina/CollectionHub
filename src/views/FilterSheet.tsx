import { useState, type ReactNode } from 'react';
import { haptic } from '../lib/haptics';
import { ManaIcon } from './zine';
import { FilterBtn, Sheet } from '../features/shared/OneBar';
import { COLOURS, COLOUR_NAME, FINISH_LABEL, MVS, PRICES, PRICE_LABEL, RARITIES, RARITY_LABEL, SHOW_LABEL, TYPES, filterChips, filterCount, noFilter, toggled, type CollFilter, type Finish, type Show } from '../lib/collfilter';

/** Collection's FILTER: first on the one bar, with a count when something narrows the list, and the sheet with the
 *  choices (a bottom sheet on a phone, swipe it down to close; a panel on wider screens). */
export function FilterButton({
  filter,
  setFilter,
  shown,
  total,
  folders,
  folderOn = false,
  onReset,
}: {
  filter: CollFilter;
  setFilter: (f: CollFilter) => void;
  shown: number;
  total: number;
  /** The binder's folders open at the top of the sheet (Nov 27 on phones; every width since the one bar, Nov 28). */
  folders?: ReactNode;
  /** A folder other than ALL is picked: it counts on the button like a filter. */
  folderOn?: boolean;
  /** RESET also goes back to ALL folders. */
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const n = filterCount(filter) + (folderOn ? 1 : 0);
  const pick = (kind: Parameters<typeof toggled>[1], v: string) => (haptic('select'), setFilter(toggled(filter, kind, v)));
  const close = () => setOpen(false);
  return (
    <>
      <FilterBtn count={n} open={open} onClick={() => setOpen(true)} />
      {open && (
        <Sheet
          title="FILTER CARDS"
          seed={41}
          label="Filter cards"
          onClose={close}
          foot={
            <>
              <button type="button" className="u-btn ghost" disabled={!n} onClick={() => (haptic('select'), setFilter(noFilter()), onReset?.())}>
                RESET
              </button>
              <button type="button" className="u-btn primary" onClick={close}>
                SHOW {shown.toLocaleString()} {shown === 1 ? 'CARD' : 'CARDS'}
                {n > 0 && total !== shown ? ` OF ${total.toLocaleString()}` : ''}
              </button>
            </>
          }
        >
          {folders && (
            <div className="fs-group fs-folders">
              <span className="lbl">Folder</span>
              {folders}
            </div>
          )}
          <div className="fs-group">
            <span className="lbl">Colours</span>
            {/* the same mana buttons as Discover's colour filter (one part, one look) */}
            <div className="fs-row colours">
              {COLOURS.map((c) => (
                <button key={c} type="button" data-c={c} className="u-chip mana-filter-btn" aria-pressed={filter.colours.includes(c)} aria-label={COLOUR_NAME[c]} title={COLOUR_NAME[c]} onClick={() => pick('colours', c)}>
                  {c === 'C' ? <b className="cless">◇</b> : <ManaIcon c={c} />}
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
          <div className="fs-group">
            <span className="lbl">Mana value</span>
            <div className="fs-row mvs">
              {MVS.map((v) => (
                <button key={v} type="button" className="u-chip" aria-pressed={filter.mv.includes(v)} aria-label={`Mana value ${v}`} onClick={() => pick('mv', v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div className="fs-group">
            <span className="lbl">Price per copy</span>
            <div className="fs-row">
              {PRICES.map((v) => (
                <button key={v} type="button" className="u-chip" aria-pressed={filter.prices.includes(v)} onClick={() => pick('prices', v)}>
                  {PRICE_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="fs-group">
            <span className="lbl">Rarity</span>
            <div className="fs-row rarities">
              {RARITIES.map((v) => (
                <button key={v} type="button" className={`u-chip r-${v}`} aria-pressed={filter.rarities.includes(v)} onClick={() => pick('rarities', v)}>
                  {RARITY_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
          <div className="fs-group">
            <span className="lbl">Finish</span>
            <div className="fs-row">
              {(Object.keys(FINISH_LABEL) as Finish[]).filter((v) => v !== 'all').map((v) => (
                <button key={v} type="button" className="u-chip" aria-pressed={filter.finish === v} onClick={() => pick('finish', v)}>
                  {FINISH_LABEL[v]}
                </button>
              ))}
            </div>
          </div>
        </Sheet>
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

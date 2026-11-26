import { useEffect, useRef, type ReactNode } from 'react';
import { haptic } from '../../lib/haptics';
import { Ransom } from '../../views/zine';
import { snapTick } from './helpers';

/** One bar button that steps through its choices. */
export function CycleBtn<T extends string>({
  name,
  value,
  options,
  onChange,
  icons,
  cls,
}: {
  name: string;
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
  icons?: Partial<Record<T, ReactNode>>;
  cls?: string;
}) {
  const i = Math.max(0, options.findIndex(([v]) => v === value));
  const label = options[i][1];
  const next = options[(i + 1) % options.length];
  return (
    <button
      type="button"
      className={`u-btn ghost qcycle-btn${cls ? ` ${cls}` : ''}`}
      title={`${name}: ${label}. Tap for ${next[1]}`}
      aria-label={`${name} ${label}: tap for ${next[1]}`}
      onClick={() => (haptic('select'), onChange(next[0]))}
    >
      {icons?.[value]}
      <span className="qc-lbl">{label}</span>
    </button>
  );
}

export function Segs({ label, value, options, onChange, roman }: { label: string; value: string; options: ([string, string] | [string, string, string])[]; onChange: (v: string) => void; roman?: boolean }) {
  return (
    <div className="segs" role="radiogroup" aria-label={label}>
      {options.map(([v, text, tip]) => (
        <button key={v} type="button" role="radio" className={roman && v ? 'roman' : ''} title={tip} aria-checked={value === v} onClick={() => (haptic('select'), onChange(v))}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** One setting as a wrapping/scrolling line of chips inside ToolBar options. */
export function ChipPick<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <OptRow label={label}>
      <div className="chiprow" role="radiogroup" aria-label={label} onScroll={snapTick} style={{ flexWrap: 'wrap', rowGap: 6 }}>
        {options.map(([v, t]) => (
          <button key={v} type="button" role="radio" className="u-chip" aria-checked={value === v} aria-pressed={value === v} onClick={() => (haptic('select'), onChange(v))}>
            {t}
          </button>
        ))}
      </div>
    </OptRow>
  );
}

/** Dropdown in the Discover SORT-box style: black tab label, select, red arrow. */
export function Pick<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void; className?: string }) {
  return (
    <label className={`sbox pick${className ? ` ${className}` : ''}`}>
      <span className="tab">{label}</span>
      <select value={value} onChange={(e) => (haptic('select'), onChange(e.target.value as T))}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
      <span className="arrow" aria-hidden="true">
        <span>▼</span>
      </span>
    </label>
  );
}

/** Magnifier icon inside SearchBox. */
export function SearchIcon() {
  return (
    <svg className="sicon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <circle cx="7.5" cy="7.5" r="5" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M11.2 11.2 16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="square" />
    </svg>
  );
}

/** Search segment every toolbar starts with. */
export function SearchBox({ q, setQ, placeholder = 'name or rules text_', ariaLabel = 'Search cards by name or rules text' }: { q: string; setQ: (v: string) => void; placeholder?: string; ariaLabel?: string }) {
  return (
    <label className="sbox dark tsearch">
      <span className="tab">SEARCH</span>
      <SearchIcon />
      <input type="search" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} aria-label={ariaLabel} enterKeyHint="search" />
      <span aria-hidden="true" className="fade" />
    </label>
  );
}

/** Single-row toolbar with options popover/bottom-sheet, quick pills, and search box. */
export function ToolBar({ q, setQ, placeholder, searchLabel, now, quick, extra, foot, label = 'Cards: search and options', children }: { q: string; setQ: (v: string) => void; placeholder?: string; searchLabel?: string; now?: ReactNode; quick?: ReactNode; extra?: ReactNode; foot?: ReactNode; label?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const out = (e: PointerEvent) => ref.current?.open && !ref.current.contains(e.target as Node) && ref.current.removeAttribute('open');
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && ref.current?.open && (ref.current.removeAttribute('open'), ref.current.querySelector('summary')?.focus());
    addEventListener('pointerdown', out);
    addEventListener('keydown', esc);
    return () => (removeEventListener('pointerdown', out), removeEventListener('keydown', esc), void document.documentElement.classList.remove('sheet-open'));
  }, []);
  return (
    <div className="dtools tbar" role="toolbar" aria-label={label}>
      <details
        className="fsheet tbmore"
        ref={ref}
        onToggle={(e) => {
          if (e.currentTarget.open) {
            haptic('open');
            const panel = e.currentTarget.querySelector('.fbody') as HTMLElement | null;
            if (panel && matchMedia('(min-width: 701px)').matches) {
              panel.style.removeProperty('left');
              panel.style.removeProperty('right');
              panel.style.removeProperty('max-width');
              requestAnimationFrame(() => {
                const r = panel.getBoundingClientRect();
                const maxW = Math.max(260, innerWidth - 24);
                if (r.width > maxW) panel.style.setProperty('max-width', `${maxW}px`, 'important');
                const r2 = panel.getBoundingClientRect();
                if (r2.right > innerWidth - 12) {
                  panel.style.setProperty('left', 'auto', 'important');
                  panel.style.setProperty('right', '0', 'important');
                }
                const r3 = panel.getBoundingClientRect();
                if (r3.left < 12) {
                  panel.style.setProperty('left', `${12 - (panel.offsetParent?.getBoundingClientRect().left ?? 0)}px`, 'important');
                  panel.style.setProperty('right', 'auto', 'important');
                }
                const over = r3.bottom - (innerHeight - 12);
                if (over > 0) scrollBy({ top: Math.min(over, Math.max(0, r3.top - 72)), behavior: 'smooth' });
              });
            }
          }
          document.documentElement.classList.toggle('sheet-open', !!document.querySelector('details.tbmore[open]'));
        }}
        onClick={(e) => e.target === e.currentTarget && e.currentTarget.removeAttribute('open')}
      >
        <summary aria-label="Options" title="Options">
          {now && <span className="fnow">{now}</span>}
          <span className="kebab" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </summary>
        <div className="fbody">
          <div className="sheethead">
            <span aria-hidden="true">
              <Ransom text="OPTIONS" size={24} seed={43} />
            </span>
            <button type="button" className="close" aria-label="Close options" onClick={() => (haptic('tap'), ref.current?.removeAttribute('open'))}>
              ✕
            </button>
          </div>
          {children}
          {foot && <div className="sheetfoot">{foot}</div>}
        </div>
      </details>
      {quick && <div className="tquick">{quick}</div>}
      <SearchBox q={q} setQ={setQ} placeholder={placeholder} ariaLabel={searchLabel} />
      {extra}
    </div>
  );
}

/** Under a toolbar: one removable chip per active setting, plus Clear all. */
export function SetChips({ chips }: { chips: { label: string; off: () => unknown }[] }) {
  if (!chips.length) return null;
  return (
    <div className="fchips setchips" role="group" aria-label="Active settings">
      {chips.map((c) => (
        <button key={c.label} type="button" className="fchip" aria-label={`Remove ${c.label}`} onClick={() => (haptic('select'), void c.off())}>
          {c.label} <span aria-hidden="true">✕</span>
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          className="fclear"
          onClick={async () => {
            haptic('select');
            for (const c of chips) await c.off();
          }}
        >
          Clear all
        </button>
      )}
    </div>
  );
}

/** One labelled row inside the toolbar options. */
export function OptRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="optrow">
      <span className="lbl">{label}</span>
      {children}
    </div>
  );
}

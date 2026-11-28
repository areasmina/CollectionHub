import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../../lib/haptics';
import { Ransom } from '../../views/zine';
import css from './DeckToolsSheet.module.css';

export interface DeckTool {
  key: string;
  label: string;
  /** One line on what it is for. */
  desc: string;
  onOpen: () => void;
}

/**
 * TOOLS (Guillermo, Nov 28): one button on the deck strip opens one clean sheet with the deck's analysis and playtest
 * tools, each with a line on what it does, instead of a row of five buttons (or hiding them in ⋮). A bottom sheet on
 * a phone, a panel on wider screens (the same look as the Filter sheets).
 */
export function DeckToolsButton({ tools, compact, onToggleHeader }: { tools: readonly DeckTool[]; compact: boolean; onToggleHeader: () => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);
  const go = (t: DeckTool) => {
    haptic('open');
    setOpen(false);
    t.onOpen();
  };
  return (
    <>
      <button type="button" className={`u-btn ghost ${css.btn}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => (haptic('open'), setOpen(true))}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M2 4h7M12 4h2M2 12h2M7 12h7M9.5 2v4M4.5 10v4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        TOOLS
      </button>
      {open &&
        createPortal(
          <>
            <div className="backdrop fbackdrop" onClick={() => setOpen(false)} />
            <div className={`fsheet2 ${css.sheet}`} role="dialog" aria-modal="true" aria-label="Deck tools">
              <div className="nh">
                <span aria-hidden="true">
                  <Ransom text="DECK TOOLS" size={24} seed={47} />
                </span>
                <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close deck tools">
                  ✕
                </button>
              </div>
              <ul className={css.list}>
                {tools.map((t) => (
                  <li key={t.key}>
                    <button type="button" className={css.row} onClick={() => go(t)}>
                      <span className={css.text}>
                        <b>{t.label}</b>
                        <span className={css.desc}>{t.desc}</span>
                      </span>
                      <span className={css.arrow} aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                ))}
                <li>
                  <button type="button" className={css.row} aria-pressed={compact} onClick={() => (haptic('select'), onToggleHeader())}>
                    <span className={css.text}>
                      <b>HEADER</b>
                      <span className={css.desc}>The big commander header, or a slim one that leaves room for the cards</span>
                    </span>
                    <span className={css.toggle}>{compact ? 'COMPACT' : 'FULL'}</span>
                  </button>
                </li>
              </ul>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

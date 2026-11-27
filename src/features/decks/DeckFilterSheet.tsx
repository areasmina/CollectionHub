import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { haptic } from '../../lib/haptics';
import { Ransom } from '../../views/zine';
import type { Deck } from '../../lib/db';
import { DeckFolderBar } from './DeckFolderBar';
import type { DeckFolderStore, FolderFilter } from './deckOrg';
import css from './DeckFilterSheet.module.css';

/**
 * My Decks' FILTER button and sheet (Guillermo, Nov 26: "one home for filters, like ManaBox"). Search, sort, the status
 * chips and SIZE stay on the page bar; the tags and folders, which used to live only in the Dynamic Island, open here.
 * The same sheet as Collection's Filter: a bottom sheet on a phone, a panel on wider screens.
 */
export function DeckFilterButton({
  tags,
  tag,
  setTag,
  decks,
  folderStore,
  folder,
  setFolder,
  onChangeFolders,
}: {
  tags: readonly string[];
  tag: string;
  setTag: (t: string) => void;
  decks: readonly Deck[];
  folderStore: DeckFolderStore;
  folder: FolderFilter;
  setFolder: (f: FolderFilter) => void;
  onChangeFolders: (next: DeckFolderStore) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = (tag !== 'all' ? 1 : 0) + (folder !== 'all' ? 1 : 0);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className={`${css.btn}${n ? ` ${css.on}` : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={n ? `Filter decks, ${n} active` : 'Filter decks'}
        onClick={() => (haptic('open'), setOpen(true))}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path d="M2 4h14M5 9h8M7.5 14h3" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span className={css.label}>FILTER</span>
        {n > 0 && <b className={css.count}>{n}</b>}
      </button>
      {open &&
        createPortal(
          <>
            <div className="backdrop fbackdrop" onClick={() => setOpen(false)} />
            <div className="fsheet2 dfsheet" role="dialog" aria-modal="true" aria-label="Filter decks">
              <div className="nh">
                <span aria-hidden="true">
                  <Ransom text="FILTER DECKS" size={24} seed={43} />
                </span>
                <button type="button" className="close" onClick={() => setOpen(false)} aria-label="Close filter">
                  ✕
                </button>
              </div>
              <div className="fs-body">
                <div className="fs-group">
                  <span className="lbl">Tags</span>
                  {tags.length ? (
                    <div className="fs-row" role="group" aria-label="Filter by tag">
                      <button type="button" className="u-chip" aria-pressed={tag === 'all'} onClick={() => (haptic('select'), setTag('all'))}>
                        ALL
                      </button>
                      {tags.map((t) => (
                        <button key={t} type="button" className="u-chip" aria-pressed={tag === t} onClick={() => (haptic('select'), setTag(tag === t ? 'all' : t))}>
                          #{t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className={`small ${css.none}`}>No tags yet: a deck's themes and your own tags show here.</p>
                  )}
                </div>
                {/* the folder bar names itself (FOLDERS) */}
                <div className="fs-group">
                  <DeckFolderBar decks={decks} store={folderStore} active={folder} onChangeStore={onChangeFolders} onSelect={setFolder} />
                </div>
              </div>
              <div className={css.foot}>
                {n > 0 && (
                  <button type="button" className="u-btn ghost" onClick={() => (haptic('select'), setTag('all'), setFolder('all'))}>
                    Clear all
                  </button>
                )}
                <button type="button" className="u-btn" onClick={() => setOpen(false)}>
                  DONE
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

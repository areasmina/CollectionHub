import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Shortfall } from '../../lib/copies';
import { db } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { DeckLink, scryfallUrl } from './helpers';

function cleanDeckName(d: string, fallback?: string): string {
  if (d.startsWith('this ') && d.endsWith(' deck')) {
    return d.slice(5, -5).trim() || fallback || 'Current Deck';
  }
  return d;
}

/** Copies warning: cards your active decks share more often than you own copies. */
export function ShortAlert({ items, inline, currentDeck }: { items: Shortfall[]; inline?: boolean; currentDeck?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const real = useLiveQuery(async () => new Set((await db.decks.toArray()).map((d) => d.name)), []) ?? new Set<string>();

  const updatePos = () => {
    if (typeof window !== 'undefined' && window.innerWidth <= 700) {
      setPos(null);
      return;
    }
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      const right = Math.max(12, Math.min(window.innerWidth - r.right, window.innerWidth - 490));
      const top = Math.min(r.bottom + 8, window.innerHeight - 300);
      setPos({ top, right });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePos();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onPointer = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node) && triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    addEventListener('keydown', onKey);
    addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  if (!items.length) return null;

  const totalShort = items.reduce((sum, s) => sum + s.short, 0);
  const search = q.trim().toLowerCase();
  const list = search ? items.filter((s) => s.name.toLowerCase().includes(search) || s.decks.some((d) => d.toLowerCase().includes(search))) : items;

  const isCurrentDeck = (d: string) => {
    if (d.startsWith('this ') && d.endsWith(' deck')) return true;
    if (!currentDeck) return false;
    const cleanD = cleanDeckName(d).toLowerCase();
    const cleanC = currentDeck.toLowerCase();
    return cleanD === cleanC || d.toLowerCase() === cleanC;
  };

  const portalContent =
    open && typeof document !== 'undefined'
      ? createPortal(
          <>
            <div className="backdrop shortback" onClick={() => setOpen(false)} />
            <div
              ref={popRef}
              className="shortpop"
              role="dialog"
              aria-modal="true"
              aria-label="Copies Shortfall Report"
              style={pos && typeof window !== 'undefined' && window.innerWidth > 700 ? { top: `${pos.top}px`, right: `${pos.right}px` } : undefined}
            >
              <div className="shortpop-header">
                <div className="shortpop-tape">
                  <span className="shortpop-tape-stripes" aria-hidden="true" />
                  <span className="shortpop-tape-title">▲ COPIES SHORTFALL</span>
                  <span className="shortpop-tape-stripes" aria-hidden="true" />
                </div>
                <button
                  type="button"
                  className="shortpop-close-btn"
                  onClick={() => {
                    haptic('tap');
                    setOpen(false);
                  }}
                  aria-label="Close shortfall report"
                >
                  ✕ CLOSE
                </button>
              </div>

              <div className="shortpop-summary">
                <div className="shortpop-summary-info">
                  <b>
                    {items.length} {items.length === 1 ? 'CARD' : 'CARDS'}
                  </b>
                  <span> in more decks than physical copies</span>
                </div>
                <div className="shortpop-summary-badge" title={`${totalShort} extra copies needed across all active decks`}>
                  <span className="sp-neg">−{totalShort}</span>
                  <span className="sp-lbl">SHORT</span>
                </div>
              </div>

              {items.length > 2 && (
                <div className="shortpop-search-bar">
                  <input type="search" value={q} placeholder="Filter short cards or decks..." onChange={(e) => setQ(e.target.value)} aria-label="Filter shortfall cards" />
                  {q && (
                    <button type="button" className="shortpop-search-clear" onClick={() => setQ('')} aria-label="Clear search">
                      ✕
                    </button>
                  )}
                </div>
              )}

              <ul className="shortpop-list" onClickCapture={(e) => (e.target as HTMLElement).closest('.decklink') && setTimeout(() => setOpen(false), 0)}>
                {list.map((s) => (
                  <li key={s.name} className="shortitem">
                    <div className="shortitem-badge" title={`${s.short} more ${s.short === 1 ? 'copy' : 'copies'} needed`}>
                      <span className="shortitem-num">−{s.short}</span>
                      <span className="shortitem-lbl">SHORT</span>
                    </div>
                    <div className="shortitem-info">
                      <div className="shortitem-top">
                        <a className="shortitem-name" href={scryfallUrl(s.name)} target="_blank" rel="noreferrer" title={`View ${s.name} on Scryfall`}>
                          {s.name} <span className="shortitem-arrow">↗</span>
                        </a>
                        <span className="shortitem-eq">
                          <span className="sc-own">OWN {s.own}</span>
                          <span className="sc-sep">/</span>
                          <span className="sc-need">{s.need} IN DECKS</span>
                        </span>
                      </div>
                      <div className="shortitem-decks-wrap">
                        <span className="shortitem-decks-lbl">DECKS:</span>
                        <div className="shortitem-deck-tags">
                          {s.decks.map((d) => {
                            const isCurrent = isCurrentDeck(d);
                            const displayName = cleanDeckName(d, currentDeck);
                            return (
                              <span key={d} className={`shortitem-deck-tag${isCurrent ? ' this-deck' : ''}`}>
                                {isCurrent ? (
                                  <>
                                    <span className="shortitem-deck-name">{displayName}</span>
                                    <span className="shortitem-current-marker">★ THIS DECK</span>
                                  </>
                                ) : real.has(d) ? (
                                  <DeckLink name={d} />
                                ) : (
                                  <span className="shortitem-deck-name">{displayName}</span>
                                )}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
                {list.length === 0 && <li className="shortitem-empty">No shortfall cards match "{q}"</li>}
              </ul>

              <div className="shortpop-footer">
                <span>Decks are virtual lists. Add copies to your binder to clear shortfalls.</span>
              </div>
            </div>
          </>,
          document.body,
        )
      : null;

  if (inline) {
    return (
      <div className="shortin" role="region" aria-label="Shortfall alerts">
        <button
          ref={triggerRef}
          type="button"
          className={`shortin-btn${open ? ' active' : ''}`}
          aria-expanded={open}
          aria-haspopup="dialog"
          title={`${items.length} ${items.length === 1 ? 'card is' : 'cards are'} in more decks than you have copies: tap for breakdown`}
          onClick={() => {
            haptic('open');
            setOpen(!open);
          }}
        >
          <span className="shortin-warn-icon" aria-hidden="true">
            ▲
          </span>
          <span className="shortin-count">{items.length} SHORT</span>
          <span className="shortin-caret" aria-hidden="true">
            {open ? '▴' : '▾'}
          </span>
        </button>
        {portalContent}
      </div>
    );
  }

  return (
    <aside className="shortalert chip" role="status">
      <button
        ref={triggerRef}
        type="button"
        className={`shortchip-btn${open ? ' active' : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          haptic('open');
          setOpen(!open);
        }}
      >
        <span className="shortin-warn-icon" aria-hidden="true">
          ▲
        </span>
        <b>{items.length} SHORT</b> <span>{items.length === 1 ? 'card is' : 'cards are'} in more decks than you have copies</span>
        <span className="shortin-caret" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>
      {portalContent}
    </aside>
  );
}

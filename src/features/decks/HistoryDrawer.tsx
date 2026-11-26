import { useState } from 'react';
import type { Deck } from '../../lib/db';
import {
  deleteDeckSnapshot,
  getDeckSnapshots,
  restoreDeckSnapshot,
  saveDeckSnapshot,
  type DeckSnapshot,
} from '../../lib/deckhistory';
import { haptic } from '../../lib/haptics';
import { diffDeckSnapshot } from './deckOrg';
import s from './DeckOrg.module.css';

interface HistoryDrawerProps {
  deck: Deck;
  onClose: () => void;
}

export function HistoryDrawer({ deck, onClose }: HistoryDrawerProps) {
  const deckId = deck.id!;
  const [snapshots, setSnapshots] = useState<DeckSnapshot[]>(() => getDeckSnapshots(deckId));
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const refresh = () => setSnapshots(getDeckSnapshots(deckId));

  const saveNow = () => {
    const label = `Manual save (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`;
    saveDeckSnapshot(deck, label);
    haptic('success');
    refresh();
  };

  const handleRestore = async (snap: DeckSnapshot) => {
    await restoreDeckSnapshot(deck, snap);
    haptic('success');
    refresh();
    onClose();
  };

  const handleDelete = (snapId: string) => {
    setSnapshots(deleteDeckSnapshot(deckId, snapId));
  };

  return (
    <div
      className={s.scrim}
      role="dialog"
      aria-modal="true"
      aria-label={`Version history for ${deck.name}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={s.drawer}>
        <header className={s.drawerHead}>
          <div>
            <h2 className={s.drawerTitle}>Version History</h2>
            <span className={s.snapMeta}>{deck.name} · {snapshots.length} snapshots</span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} onClick={saveNow}>
              + Snapshot
            </button>
            <button type="button" className={s.btn} onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className={s.drawerBody}>
          {snapshots.length === 0 ? (
            <p className={s.snapMeta}>
              No snapshots saved for this deck yet. Click "+ Snapshot" to save a checkpoint before editing.
            </p>
          ) : (
            snapshots.map((snap) => {
              const diff = diffDeckSnapshot(deck.cards, snap.cards);
              const isOpen = expandedId === snap.id;
              return (
                <article key={snap.id} className={s.snapCard}>
                  <div className={s.snapTop}>
                    <span className={s.snapLabel}>{snap.label || 'Snapshot'}</span>
                    <span className={s.snapMeta}>{snap.cardCount} cards</span>
                  </div>
                  <div className={s.snapMeta}>
                    {new Date(snap.at).toLocaleDateString()} · {new Date(snap.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className={s.diffRow}>
                    <span className={s.diffAdd}>+{diff.totalAdded} on restore</span>
                    <span className={s.diffRem}>-{diff.totalRemoved} on restore</span>
                    {(diff.totalAdded > 0 || diff.totalRemoved > 0) && (
                      <button
                        type="button"
                        className={s.btn}
                        style={{ minHeight: 24, padding: '2px 8px' }}
                        onClick={() => setExpandedId(isOpen ? null : snap.id)}
                      >
                        {isOpen ? 'Hide diff' : 'Show diff'}
                      </button>
                    )}
                  </div>

                  {isOpen && (
                    <ul className={s.diffList}>
                      {diff.toAdd.slice(0, 8).map((c) => (
                        <li key={`add-${c.name}`} className={s.diffAdd}>
                          +{c.qty} {c.name}
                        </li>
                      ))}
                      {diff.toRemove.slice(0, 8).map((c) => (
                        <li key={`rem-${c.name}`} className={s.diffRem}>
                          -{c.qty} {c.name}
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className={s.snapActions}>
                    <button
                      type="button"
                      className={s.btn}
                      onClick={() => handleDelete(snap.id)}
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      className={`${s.btn} ${s.btnPrimary}`}
                      onClick={() => void handleRestore(snap)}
                    >
                      Restore
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

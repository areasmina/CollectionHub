import { useEffect, useState, type ReactNode } from 'react';
import { importDeck } from '../../lib/actions';
import { haptic } from '../../lib/haptics';
import { freeDeckName } from '../../lib/nav';
import { useMenuPress } from '../../views/shared';

/** A deck in the Decks list: tap opens it; right-click or press and hold opens the deck menu. */
export function DeckTile({ onClick, onMenu, label, children }: { onClick: () => void; onMenu: (x: number, y: number) => void; label: string; children: ReactNode }) {
  const press = useMenuPress(onMenu);
  return (
    <div
      role="button"
      tabIndex={0}
      className="dcard ccard hasmenu"
      onClick={onClick}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())}
      {...press}
      aria-label={`${label}: open (right-click or hold for options)`}
    >
      {children}
    </div>
  );
}

/** IMPORT DECK: paste a list (Arena, MTGO, Moxfield, Archidekt, plain text) or choose a CSV / text file. */
export function ImportDeckPop({ profile, onClose, onDone }: { profile: number; onClose: () => void; onDone: (id: number) => void }) {
  const [name, setName] = useState('Imported deck');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const [made, setMade] = useState<{ id: number; left: string[] } | null>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function pickFile(f: File) {
    setText(await f.text());
    setName(f.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported deck');
  }

  async function go() {
    if (!text.trim()) return setError('Paste a list or choose a file first.');
    setError('');
    setBusy({ done: 0, total: 0 });
    try {
      const deckName = await freeDeckName(profile, name.trim() || 'Imported deck');
      const r = await importDeck(profile, deckName, text, (done, total) => setBusy({ done, total }));
      setBusy(null);
      if (!r.deck.cards.length) return setError('No cards found in that list. Check the format and try again.');
      haptic('success');
      const left = r.unmatched.map((u) => u.name);
      if (left.length) setMade({ id: r.deck.id!, left });
      else onDone(r.deck.id!);
    } catch (e) {
      setBusy(null);
      setError(`Import failed: ${(e as Error).message}. Nothing was saved.`);
    }
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="importbox-pop note-pop dimport" role="dialog" aria-modal="true" aria-label="Import a deck" onClick={(e) => e.stopPropagation()}>
        <div className="nh">
          <span>
            IMPORT <mark>DECK</mark>
          </span>
          <button type="button" className="close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>
        <label className="dimport-field">
          <span>Deck name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        </label>
        <textarea
          aria-label="Deck list"
          rows={8}
          placeholder="Paste a list: Arena, MTGO, Moxfield, Archidekt, or plain text (4 Sol Ring)"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="u-btn ghost dimport-file">
          CHOOSE A FILE (CSV or TXT)
          <input type="file" accept=".csv,.txt,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
        </label>
        {error && (
          <p role="alert" className="dimport-err">
            {error}
          </p>
        )}
        {made && (
          <p className="dimport-note" role="status">
            Imported. {made.left.length} {made.left.length === 1 ? 'card was' : 'cards were'} not found and left out: {made.left.slice(0, 6).join(', ')}
            {made.left.length > 6 ? '…' : ''}
          </p>
        )}
        <div className="dimport-acts">
          {made ? (
            <button type="button" className="u-btn primary" onClick={() => onDone(made.id)}>
              OPEN DECK
            </button>
          ) : (
            <button type="button" className="u-btn primary" disabled={!!busy} onClick={go}>
              {busy ? `IMPORTING ${busy.done}/${busy.total || '…'}` : 'IMPORT'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

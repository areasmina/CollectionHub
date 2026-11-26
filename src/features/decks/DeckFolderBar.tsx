import { useState } from 'react';
import type { Deck } from '../../lib/db';
import {
  createDeckFolder,
  deleteDeckFolder,
  folderOfDeck,
  type DeckFolderStore,
  type FolderFilter,
} from './deckOrg';
import s from './DeckOrg.module.css';

interface DeckFolderBarProps {
  decks: readonly Deck[];
  store: DeckFolderStore;
  active: FolderFilter;
  onChangeStore: (next: DeckFolderStore) => void;
  onSelect: (filter: FolderFilter) => void;
}

export function DeckFolderBar({
  decks,
  store,
  active,
  onChangeStore,
  onSelect,
}: DeckFolderBarProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const unfiledCount = decks.filter((d) => !folderOfDeck(store, d.id)).length;
  const countIn = (folder: string) =>
    decks.filter((d) => (folderOfDeck(store, d.id) ?? '').toLowerCase() === folder.toLowerCase()).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const res = createDeckFolder(store, name);
    if (!res.ok) {
      setError(res.why);
      return;
    }
    setError('');
    setName('');
    onChangeStore(res.store);
    onSelect(res.name);
  };

  return (
    <div className={s.folderBar} role="region" aria-label="Deck folders">
      <span className={s.label}>Folders</span>
      <button
        type="button"
        className={s.pill}
        aria-pressed={active === 'all'}
        onClick={() => onSelect('all')}
      >
        All ({decks.length})
      </button>
      <button
        type="button"
        className={s.pill}
        aria-pressed={active === 'unfiled'}
        onClick={() => onSelect('unfiled')}
      >
        Unfiled ({unfiledCount})
      </button>

      {store.folders.map((folder) => (
        <span key={folder} style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
          <button
            type="button"
            className={s.pill}
            aria-pressed={active === folder}
            onClick={() => onSelect(folder)}
          >
            {folder} ({countIn(folder)})
          </button>
          <button
            type="button"
            className={s.pillDel}
            aria-label={`Delete folder ${folder}`}
            title={`Remove folder "${folder}" (keeps all decks)`}
            onClick={() => {
              onChangeStore(deleteDeckFolder(store, folder));
              if (active === folder) onSelect('all');
            }}
          >
            ×
          </button>
        </span>
      ))}

      <form className={s.addForm} onSubmit={submit}>
        <input
          type="text"
          className={s.addInput}
          aria-label="New deck folder name"
          placeholder="+ folder..."
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError('');
          }}
        />
        <button type="submit" className={s.btn}>
          Add
        </button>
      </form>
      {error && <div className={s.err}>{error}</div>}
    </div>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db } from '../../lib/db';
import { haptic } from '../../lib/haptics';
import { openCollection, openDeck, openDiscoverSub } from '../../lib/nav';
import { openCard } from '../../views/shared';
import { loadTagData } from '../tags/tagState';
import s from './JumpBar.module.css';
import { searchJumpItems, type JumpItem, type TagSummary } from './jumpSearch';

interface JumpBarProps {
  profile: number;
  mine: Map<string, number>;
  onSwitchTab: (tab: 'discover' | 'decks' | 'collection') => void;
}

export function JumpBar({ profile, mine, onSwitchTab }: JumpBarProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const [tags, setTags] = useState<TagSummary[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const decks = useLiveQuery(() => db.decks.where('profile').equals(profile).toArray(), [profile]) ?? [];
  const cards = useLiveQuery(() => db.cards.toArray(), []) ?? [];

  // Global Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) setQuery('');
          return next;
        });
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Focus input & lazy-load tags when opened
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    if (tags.length === 0) {
      void loadTagData().then((data) => {
        if (!data) return;
        setTags(
          data.tags.map((t) => ({
            slug: t.id,
            name: t.label,
            count: t.cards.length,
          }))
        );
      });
    }
  }, [open, tags.length]);

  const items = useMemo(
    () => searchJumpItems(query, { decks, cards, tags, mine }),
    [cards, decks, mine, query, tags]
  );

  useEffect(() => {
    setActiveIdx(0);
  }, [query, items.length]);

  const execute = (item: JumpItem) => {
    haptic('select');
    setOpen(false);
    const t = item.target;
    if (t.kind === 'view') {
      onSwitchTab(t.tab);
      if (t.tab === 'discover' && t.subTab) openDiscoverSub(t.subTab);
      return;
    }
    if (t.kind === 'deck') {
      openDeck(t.deckName);
      return;
    }
    if (t.kind === 'tag') {
      onSwitchTab('discover');
      openDiscoverSub('tags');
      return;
    }
    if (t.kind === 'card') {
      if (t.card.img) openCard(t.card.img, t.card.name, t.card.back);
      else openCollection();
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        className={s.triggerBtn}
        aria-label="Quick jump (Ctrl+K)"
        title="Quick Jump (Ctrl+K / Cmd+K)"
        onClick={() => {
          setQuery('');
          setOpen(true);
        }}
      >
        ⌘K JUMP
      </button>
    );
  }

  return (
    <div
      className={s.scrim}
      role="dialog"
      aria-modal="true"
      aria-label="Quick jump bar"
      onClick={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className={s.modal}>
        <div className={s.inputRow}>
          <span className={s.prompt}>JUMP //</span>
          <input
            ref={inputRef}
            type="search"
            className={s.input}
            aria-label="Jump to deck, card, view, or tag"
            placeholder="Type a deck, card, view, or Scryfall tag..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIdx((i) => (items.length ? (i + 1) % items.length : 0));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIdx((i) => (items.length ? (i - 1 + items.length) % items.length : 0));
              } else if (e.key === 'Enter' && items[activeIdx]) {
                e.preventDefault();
                execute(items[activeIdx]);
              }
            }}
          />
          <span className={s.kbdHint}>ESC</span>
        </div>

        <div className={s.list} role="listbox" aria-label="Jump results">
          {items.length === 0 ? (
            <div className={s.empty}>No matching views, decks, cards, or tags.</div>
          ) : (
            items.map((item, idx) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={idx === activeIdx}
                className={`${s.row} ${idx === activeIdx ? s.rowActive : ''}`}
                onMouseEnter={() => setActiveIdx(idx)}
                onClick={() => execute(item)}
              >
                <div className={s.rowMain}>
                  <span className={s.rowTitle}>{item.title}</span>
                  <span className={s.rowSub}>{item.subtitle}</span>
                </div>
                <span className={s.badge}>{item.badge}</span>
              </button>
            ))
          )}
        </div>

        <footer className={s.footer}>
          <span>↑↓ Navigate · ↵ Open</span>
          <span>Ctrl+K / ⌘K</span>
        </footer>
      </div>
    </div>
  );
}

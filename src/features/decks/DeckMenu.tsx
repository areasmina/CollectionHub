import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db, type Deck } from '../../lib/db';
import { deckColour, hsvHex, wheelColour } from '../../lib/deckcolor';
import { getDeckSnapshots, saveDeckSnapshot } from '../../lib/deckhistory';
import { deckArena, deckCsv, deckText, download } from '../../lib/export';
import { haptic } from '../../lib/haptics';
import { freeDeckName } from '../../lib/nav';

export type MenuAt = { x: number; y: number; anchor?: DOMRect };

function ColourWheel({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hue, setHue] = useState(0);
  const at = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2);
    const dy = e.clientY - (r.top + r.height / 2);
    setHue((Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360);
    onPick(wheelColour(dx, dy, r.width / 2));
  };
  return (
    <span className="cwheel-wrap">
      <div
        ref={ref}
        className="cwheel"
        role="slider"
        tabIndex={0}
        aria-label="Deck colour wheel: left and right turn the colour"
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={Math.round(hue)}
        aria-valuetext={value}
        onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), at(e))}
        onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && at(e)}
        onKeyDown={(e) => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 10 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -10 : 0;
          if (!step) return;
          e.preventDefault();
          const h = (hue + step + 360) % 360;
          setHue(h);
          haptic('select');
          onPick(hsvHex(h, 1, 1));
        }}
      >
        <span className="cwheel-now" style={{ background: value }} aria-hidden="true" />
      </div>
      <code className="cwheel-val">{value.toUpperCase()}</code>
    </span>
  );
}

export function DeckMenu({
  deck,
  at,
  onClose,
  onDeleted,
  onOpen,
  onHistory,
  folders,
  currentFolder,
  onFolderChange,
}: {
  deck: Deck;
  at: MenuAt;
  onClose: () => void;
  onDeleted?: () => void;
  onOpen: (id: number) => void;
  onHistory?: () => void;
  folders?: string[];
  currentFolder?: string;
  onFolderChange?: (folder: string | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const file = (ext: string) => `${deck.name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function' && matchMedia('(pointer: coarse)').matches;
  async function share() {
    const text = deckText(deck);
    if (canShare) {
      close();
      await navigator.share({ title: deck.name, text }).catch(() => {});
      return;
    }
    await navigator.clipboard?.writeText(text).catch(() => {});
    haptic('success');
    setCopied(true);
    setTimeout(close, 900);
  }
  const close = onClose;
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    const b = at.anchor;
    const left = Math.max(8, Math.min(b ? b.right - r.width : at.x, innerWidth - r.width - 8));
    const top = b ? (b.bottom + 8 + r.height > innerHeight - 8 ? Math.max(8, b.top - r.height - 8) : b.bottom + 8) : Math.max(8, Math.min(at.y, innerHeight - r.height - 8));
    setPos({ left, top });
  }, [at]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && close();
    addEventListener('keydown', key);
    addEventListener('scroll', close, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', close));
  }, []);
  const act = (f: () => unknown) => () => (close(), f());
  return (
    <>
      <div className="backdrop menuback" onClick={close} onContextMenu={(e) => (e.preventDefault(), close())} />
      <div ref={ref} className="cardmenu deckmenu" role="menu" aria-label={`${deck.name} options`} style={pos}>
        <div className="mh">{deck.name}</div>
        <ul>
          <li>
            <button
              role="menuitem"
              onClick={act(async () => {
                const want = prompt('Rename deck', deck.name)?.trim();
                if (!want || want === deck.name) return;
                const name = await freeDeckName(deck.profile, want, deck.id);
                if (name !== want && !confirm(`Another deck is already called "${want}". Use "${name}"?`)) return;
                haptic('success');
                await db.decks.update(deck.id!, { name });
              })}
            >
              <span className="cmenu-main">RENAME</span>
            </button>
          </li>
          <li>
            <button
              role="menuitem"
              onClick={act(async () => {
                const { id: _, ...copy } = deck;
                const name = await freeDeckName(deck.profile, `${deck.name} (copy)`);
                haptic('success');
                onOpen(await db.decks.add({ ...copy, name, cards: deck.cards.map((c) => ({ ...c })), tags: deck.tags && [...deck.tags], updated: Date.now() }));
                scrollTo({ top: 0, behavior: 'smooth' });
              })}
            >
              <span className="cmenu-main">DUPLICATE</span>
              <small className="cmenu-meta">copy to edit freely</small>
            </button>
          </li>
          <li className="colourrow">
            <span className="cl">
              DECK COLOUR <small>cards glow in it</small>
            </span>
            <ColourWheel value={deckColour(deck)} onPick={(c) => (haptic('select'), db.decks.update(deck.id!, { color: c }))} />
          </li>
          <li>
            <button
              role="menuitem"
              onClick={act(async () => {
                const val = prompt('Add a tag for this deck (e.g. casual, cedh, token, artifact):', '')?.trim().toLowerCase().slice(0, 30);
                if (!val) return;
                const prev = deck.tags ?? [];
                if (!prev.includes(val)) {
                  haptic('success');
                  await db.decks.update(deck.id!, { tags: [...prev, val] });
                }
              })}
            >
              <span className="cmenu-main">+ ADD TAG</span>
              <small className="cmenu-meta">{deck.tags?.length ? deck.tags.map((t) => `#${t}`).join(', ') : 'organise your decks'}</small>
            </button>
          </li>
          {deck.tags && deck.tags.length > 0 && (
            <li className="cmenu-tags-row">
              <span className="cl">
                TAGS <small>tap to remove</small>
              </span>
              <div className="cmenu-tags-list">
                {deck.tags.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="cmenu-tag-item"
                    title={`Remove tag #${t}`}
                    onClick={act(async () => {
                      haptic('tap');
                      await db.decks.update(deck.id!, { tags: deck.tags!.filter((x) => x !== t) });
                    })}
                  >
                    #{t} ✕
                  </button>
                ))}
              </div>
            </li>
          )}
          <li>
            <button role="menuitem" onClick={share}>
              <span className="cmenu-main">{copied ? 'COPIED TO CLIPBOARD' : canShare ? 'SHARE DECK' : 'COPY DECKLIST'}</span>
              <small className="cmenu-meta">{copied ? 'paste anywhere' : canShare ? 'send to friend' : 'Moxfield, chat…'}</small>
            </button>
          </li>
          <li className="sep" role="separator" />
          <li>
            <button role="menuitem" onClick={act(() => download(file('txt'), deckText(deck)))}>
              <span className="cmenu-main">EXPORT FOR MOXFIELD</span>
              <small className="cmenu-meta">.txt</small>
            </button>
          </li>
          <li>
            <button role="menuitem" onClick={act(() => (navigator.clipboard?.writeText(deckArena(deck)).catch(() => {}), haptic('success')))}>
              <span className="cmenu-main">COPY FOR MTG ARENA</span>
              <small className="cmenu-meta">import in Arena</small>
            </button>
          </li>
          <li>
            <button role="menuitem" onClick={act(() => download(file('csv'), deckCsv(deck), 'text/csv'))}>
              <span className="cmenu-main">EXPORT AS CSV</span>
              <small className="cmenu-meta">spreadsheet</small>
            </button>
          </li>
          <li className="sep" role="separator" />
          <li>
            <button
              role="menuitem"
              onClick={act(async () => {
                const snap = saveDeckSnapshot(deck, `Manual save (${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})`);
                if (snap) haptic('success');
              })}
            >
              <span className="cmenu-main">CREATE SNAPSHOT</span>
              <small className="cmenu-meta">save current deck version</small>
            </button>
          </li>
          {deck.id && onHistory && (
            <li>
              <button role="menuitem" onClick={act(() => onHistory())}>
                <span className="cmenu-main">VERSION HISTORY</span>
                <small className="cmenu-meta">{getDeckSnapshots(deck.id).length} saved snapshots · diff &amp; restore</small>
              </button>
            </li>
          )}
          {deck.id && folders && folders.length > 0 && onFolderChange && (
            <li style={{ padding: '6px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span className="cmenu-meta">FOLDER</span>
              <select
                aria-label={`Assign folder for ${deck.name}`}
                value={currentFolder ?? ''}
                onChange={(e) => (onFolderChange(e.target.value || null), close())}
                style={{ maxWidth: 150 }}
              >
                <option value="">Unfiled</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </li>
          )}
          <li className="sep" role="separator" />
          <li>
            <button
              role="menuitem"
              className="danger"
              onClick={act(async () => {
                if (confirm(`Delete deck "${deck.name}"?`)) {
                  await db.decks.delete(deck.id!);
                  onDeleted?.();
                }
              })}
            >
              <span className="cmenu-main">DELETE DECK</span>
            </button>
          </li>
        </ul>
      </div>
    </>
  );
}

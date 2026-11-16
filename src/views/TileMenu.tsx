import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { db } from '../lib/db';
import { fetchPage, NoPage, pagePath, type EdhPage } from '../lib/edhrec';
import { haptic } from '../lib/haptics';
import { archidektUrl, spellbookUrl } from '../lib/links';
import { norm, slug } from '../lib/names';
import { freeDeckName, openDeck } from '../lib/nav';
import type { Stat } from '../lib/cmdrstats';
import { averageDeckCards, listText, missingCards } from '../lib/tilemenu';

export type TileToast = { text: string; undo?: () => unknown; open?: string };

const WEEK = 7 * 864e5; // the same age Discover refreshes its EDHREC pages at, so this reads the copy the tile counted

/**
 * A commander tile's menu in Discover: right-click, or press and hold on phones (useMenuPress). The tap itself still
 * opens the commander page. Same look as the card menu (.cardmenu). Every list here comes from the EDHREC average deck
 * the tile's % owned is counted from; nothing changes ownership or suggestions.
 */
export function TileMenu({
  name,
  at,
  profile,
  mine,
  stat,
  onOpen,
  onClose,
  onToast,
}: {
  name: string;
  at: { x: number; y: number };
  profile: number;
  mine: Map<string, number>;
  stat?: Stat;
  onOpen: () => void;
  onClose: () => void;
  onToast: (t: TileToast) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<EdhPage | 'loading' | 'none' | 'offline'>('loading');
  const [saving, setSaving] = useState(false);
  const decks = useLiveQuery(() => db.decks.where('profile').equals(profile).filter((d) => norm(d.commander ?? '') === norm(name) || norm(d.partner ?? '') === norm(name)).toArray(), [profile, name]) ?? [];

  useEffect(() => {
    let live = true;
    fetchPage(pagePath('average', slug(name)), WEEK)
      .then((p) => live && setPage(p))
      .catch((e) => live && setPage(e instanceof NoPage ? 'none' : 'offline'));
    return () => void (live = false);
  }, [name]);

  // Keep the menu on screen (phones turn it into a bottom sheet in CSS).
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(16, Math.min(at.x, innerWidth - r.width - 16)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y, decks.length, typeof page]);

  // Escape closes; so does scrolling (but not the scroll still settling from the press that opened it).
  // Focus moves into the menu and goes back to the tile when it closes.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const t0 = Date.now();
    const scroll = () => Date.now() - t0 > 400 && onClose();
    addEventListener('keydown', key);
    addEventListener('scroll', scroll, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', scroll), back?.focus?.({ preventScroll: true }));
  }, []);

  const cards = typeof page === 'object' ? averageDeckCards(page, name) : [];
  const missing = missingCards(cards, mine);
  const missingCopies = missing.reduce((n, c) => n + c.qty, 0);
  const short = name.split(' // ')[0];
  const why = page === 'loading' ? 'loading EDHREC…' : page === 'none' ? 'no EDHREC deck yet' : page === 'offline' ? "EDHREC didn't answer" : '';

  const copy = async (text: string, done: string) => {
    haptic('success');
    const ok = await navigator.clipboard?.writeText(text).then(
      () => true,
      () => false,
    );
    onToast({ text: ok ? done : "Couldn't copy: this browser blocked the clipboard" });
    onClose();
  };
  const save = async () => {
    if (typeof page !== 'object' || saving) return;
    setSaving(true);
    try {
      const deckName = await freeDeckName(profile, `${short} (EDHREC average)`);
      const id = await db.decks.add({ profile, name: deckName, commander: name, cards, updated: Date.now() });
      haptic('success');
      onToast({ text: `Saved as “${deckName}”`, undo: () => db.decks.delete(id), open: deckName });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const item = (label: string, onClick: () => unknown, meta?: string, disabled = false) => (
    <li>
      <button type="button" role="menuitem" disabled={disabled} onClick={onClick}>
        <span className="cmenu-main">{label}</span>
        {meta && <small className="cmenu-meta">{meta}</small>}
      </button>
    </li>
  );
  const link = (href: string, text: string, title: string) => (
    <a href={href} role="menuitem" target="_blank" rel="noreferrer" title={title} onContextMenu={(e) => e.preventDefault()} onClick={() => (haptic('tap'), onClose())}>
      <span className="cmenu-main">{text}</span>
      <span className="cmenu-arr">↗</span>
    </a>
  );

  return (
    <>
      <div className="backdrop menuback" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="cardmenu tilemenu" role="menu" aria-label={`${short} options`} style={pos} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
        <div className="mh">
          {short}
          {stat && (
            <span className="mstat">
              {stat.pct}% OWNED · {stat.missing ? `${stat.missing} MISSING` : 'ALL OWNED'}
            </span>
          )}
        </div>
        <ul>
          {item('OPEN COMMANDER PAGE', () => (haptic('open'), onClose(), onOpen()))}
          {decks.length > 0 && (
            <li className="using">
              <span className="using-lead">YOUR {decks.length === 1 ? 'DECK' : 'DECKS'}:</span>
              <div className="using-pills">
                {decks.map((d) => (
                  <button key={d.id} type="button" role="menuitem" className="deck-chip" onClick={() => (haptic('open'), onClose(), openDeck(d.name))}>
                    {d.name}
                  </button>
                ))}
              </div>
            </li>
          )}
          <li className="sep" role="separator" />
          {item('SAVE TO MY DECKS', save, why || (saving ? 'saving…' : `EDHREC average · ${cards.length}`), typeof page !== 'object' || saving)}
          {item('COPY DECK LIST', () => copy(listText(cards), `Copied ${short}'s average deck (${cards.length} cards)`), why || 'Moxfield, Archidekt', typeof page !== 'object')}
          {item(
            `COPY MISSING${typeof page === 'object' ? ` (${missingCopies})` : ''}`,
            () => copy(listText(missing), `Copied ${missingCopies} missing ${missingCopies === 1 ? 'card' : 'cards'}`),
            why || (missing.length ? 'to buy' : 'all owned'),
            typeof page !== 'object' || !missing.length,
          )}
          <li className="sep" role="separator" />
          <li className="tlinks">
            {link(`https://edhrec.com/${pagePath('commander', slug(name))}`, 'EDHREC', "This commander's page on EDHREC")}
            {link(spellbookUrl(name), 'COMBOS', 'Every known combo with this commander, on Commander Spellbook')}
            {link(archidektUrl(name), 'ARCHIDEKT', "Other players' decks with this commander, on Archidekt")}
          </li>
        </ul>
      </div>
    </>
  );
}

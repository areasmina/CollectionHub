import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BASICS } from '../lib/compare';
import { db, type Deck } from '../lib/db';
import { addToDeck, changeQty, removeFromDeck, removeOneFromBinder, setCommander, setFoil } from '../lib/deckedit';
import { haptic } from '../lib/haptics';
import { norm, slug } from '../lib/names';
import { openDeck } from '../lib/nav';
import type { PinSide } from '../lib/pins';
import { shopUrl } from '../lib/prices';
import { scryfallUrl } from './shared';
import { Tape } from './zine';

export type Toast = { text: string; undo?: () => unknown };

/**
 * The one card menu of the app: right-click on desktop, press and hold on phones, or the ⋯ button on a card.
 * Same items everywhere; the ones that don't apply where you are are left out. Every change can be undone.
 */
export function CardMenu({
  name,
  at,
  profile,
  binderName,
  owned,
  deck,
  onSwap,
  pin,
  onClose,
  onToast,
}: {
  name: string;
  at: { x: number; y: number };
  profile: number;
  binderName: string;
  owned: number; // copies in the binder
  deck?: Deck; // a saved deck (the Forge): deck actions
  onSwap?: () => void; // opens the swap window for this card
  pin?: { side?: PinSide; canIn: boolean; onPin: (side: PinSide) => void }; // pins for this commander
  onClose: () => void;
  onToast?: (t: Toast) => void;
}) {
  const live = useLiveQuery(() => (deck ? db.decks.get(deck.id!) : undefined), [deck?.id]);
  const d = live ?? deck;
  const c = d?.cards.find((x) => x.name === name);
  const decks = useLiveQuery(() => db.decks.where('profile').equals(profile).toArray(), [profile]) ?? [];
  const using = decks.filter((x) => x.id !== d?.id && x.cards.some((y) => norm(y.name) === norm(name)));
  const others = decks.filter((x) => x.id !== d?.id && !x.cards.some((y) => norm(y.name) === norm(name)));
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  // Keep the menu on screen: open left / up near the right / bottom edge.
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(16, Math.min(at.x, innerWidth - r.width - 16)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y, adding]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    // Scrolling closes the menu, but not the scroll still settling from the tap that opened it.
    const t0 = Date.now();
    const scroll = () => Date.now() - t0 > 400 && onClose();
    addEventListener('scroll', scroll, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', scroll));
  }, []);
  const isCmdr = !!d && name === d.commander;
  // Change commander: legendary creatures in this deck first, then the rest of your binder.
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState('');
  const legends =
    useLiveQuery(async () => {
      if (!d || !isCmdr || !picking) return [];
      const inDeck = new Set(d.cards.map((c) => norm(c.name)));
      const names = [...new Set([...d.cards.map((c) => c.name), ...(await db.entries.where('profile').equals(profile).toArray()).map((e) => e.name)])];
      const cs = await db.cards.where('key').anyOf(names.map(norm)).toArray();
      return [...new Map(cs.filter((c) => /Legendary.*Creature/.test(c.type ?? '') || /can be your commander/i.test(c.text ?? '')).map((c) => [c.name, c])).values()]
        .filter((c) => c.name !== d.commander)
        .sort((a, b) => Number(inDeck.has(b.key)) - Number(inDeck.has(a.key)) || a.name.localeCompare(b.name))
        .map((c) => ({ name: c.name, inDeck: inDeck.has(c.key) }));
    }, [d?.id, d?.commander, isCmdr, picking, profile]) ?? [];
  const shownLegends = legends.filter((c) => norm(c.name).includes(norm(q))).slice(0, 8);
  const basic = BASICS.has(norm(name));
  const toast = (t: Toast) => onToast?.(t);
  const act = (f: () => unknown) => () => (f(), onClose());
  const link = (href: string, text: string) => (
    <li>
      <a href={href} target="_blank" rel="noreferrer" onClick={() => (haptic('tap'), onClose())}>
        {text} ↗
      </a>
    </li>
  );
  return (
    <>
      <div className="backdrop menuback" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="cardmenu" role="menu" aria-label={`${name} options`} style={pos} onClick={(e) => e.stopPropagation()}>
        <Tape style={{ top: -11, left: '42%', width: 70, height: 22, transform: 'rotate(4deg)' }} />
        <div className="mh">{name}</div>
        <ul>
          {onSwap && (
            <li>
              <button onClick={act(() => (haptic('open'), onSwap()))}>⇄ Swap… <small>· top 3 from your binder, or search</small></button>
            </li>
          )}
          {pin && !isCmdr && (
            <>
              <li>
                <button disabled={!pin.canIn && pin.side !== 'in'} onClick={act(() => (haptic(pin.side === 'in' ? 'undo' : 'success'), pin.onPin('in')))}>
                  {pin.side === 'in' ? '📌 Unpin (always in)' : '📌 Always in'}
                  {!pin.canIn && pin.side !== 'in' && <small> · cards you own only</small>}
                </button>
              </li>
              <li>
                <button onClick={act(() => (haptic(pin.side === 'out' ? 'undo' : 'success'), pin.onPin('out')))}>{pin.side === 'out' ? '💀 Use it again' : '💀 Never use'}</button>
              </li>
            </>
          )}
          {d && isCmdr && (
            <li>
              <button aria-expanded={picking} onClick={() => (haptic('select'), setPicking(!picking))}>
                ⇄ Change commander… {picking ? '▲' : '▼'}
              </button>
              {picking && (
                <ul className="sub">
                  <li>
                    <input type="search" className="subq" value={q} onChange={(e) => setQ(e.target.value)} placeholder="search legends…" aria-label="Search legendary creatures" autoFocus />
                  </li>
                  {shownLegends.map((c) => (
                    <li key={c.name}>
                      <button
                        onClick={act(async () => {
                          haptic('success');
                          const before = { cards: d.cards, commander: d.commander };
                          if (!c.inDeck) await addToDeck(d, c.name);
                          await setCommander(d, c.name);
                          toast({ text: `${c.name} leads the deck now`, undo: () => db.decks.update(d.id!, before) });
                        })}
                      >
                        {c.name} <small>{c.inDeck ? '· in this deck' : '· in your binder'}</small>
                      </button>
                    </li>
                  ))}
                  {!shownLegends.length && (
                    <li>
                      <small>No legendary creature of yours matches.</small>
                    </li>
                  )}
                </ul>
              )}
            </li>
          )}
          {d && !isCmdr && (
            <li>
              <button onClick={act(() => (haptic('success'), setCommander(d, name)))}>{d.commander ? `★ Make it the commander (replaces ${d.commander.split(' // ')[0]})` : '★ Set as commander'}</button>
            </li>
          )}
          {others.length > 0 && !isCmdr && (
            <li>
              <button aria-expanded={adding} onClick={() => (haptic('select'), setAdding(!adding))}>
                ＋ Add to a deck… {adding ? '▲' : '▼'}
              </button>
              {adding && (
                <ul className="sub">
                  {others.map((x) => (
                    <li key={x.id}>
                      <button onClick={act(async () => (haptic('success'), toast({ text: `Added ${name} to ${x.name}`, undo: await addToDeck(x, name) })))}>{x.name}</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
          {using.length > 0 && !basic && (
            <li className="using">
              <small>also in:</small>{' '}
              {using.map((x, i) => (
                <span key={x.id}>
                  {i > 0 && ', '}
                  <button className="inl" onClick={act(() => (haptic('open'), openDeck(x.name)))}>
                    {x.name}
                  </button>
                </span>
              ))}
            </li>
          )}
          <li className="sep" />
          {d && c && (
            <li>
              <button onClick={act(() => (haptic('success'), setFoil(d, profile, name, !c.foil)))}>
                {c.foil ? 'Switch to non-foil' : '✦ Switch to foil'}
                <small>{owned ? ' · your binder copy too' : ' · deck only (not owned)'}</small>
              </button>
            </li>
          )}
          {d && c && (c.qty > 1 || basic) && (
            <li className="qtyrow">
              <span>Copies: {c.qty}</span>
              <button aria-label="One copy fewer" onClick={() => (haptic('tap'), changeQty(d, name, -1))}>
                −
              </button>
              <button aria-label="One copy more" onClick={() => (haptic('tap'), changeQty(d, name, 1))}>
                +
              </button>
            </li>
          )}
          <li>
            <button
              onClick={() =>
                navigator.clipboard
                  ?.writeText(name)
                  .then(() => (haptic('success'), setCopied(true)))
                  .then(() => setTimeout(onClose, 600))
              }
            >
              {copied ? 'Copied ✓' : 'Copy card name'}
            </button>
          </li>
          {link(shopUrl(name), 'Open in shop')}
          {link(`https://edhrec.com/${isCmdr ? 'commanders' : 'cards'}/${slug(name.split(' // ')[0])}`, isCmdr ? 'Open on EDHREC' : 'Best commanders for it (EDHREC)')}
          {link(scryfallUrl(name), 'Open on Scryfall')}
          {(d || (owned > 0 && !basic)) && <li className="sep" />}
          {d && c && (
            <li>
              <button className="danger" onClick={act(async () => (haptic('warn'), toast({ text: `Removed ${name} from the deck`, undo: await removeFromDeck(d, name) })))}>
                Remove from deck
              </button>
            </li>
          )}
          {owned > 0 && !basic && (
            <li>
              <button
                className="danger"
                onClick={act(async () => {
                  if (!confirm(`Take one copy of ${name} out of ${binderName}? You own ${owned}.`)) return;
                  haptic('warn');
                  toast({ text: `Removed one ${name} from ${binderName}`, undo: await removeOneFromBinder(profile, name, c?.foil) });
                })}
              >
                Remove one from binder <small>(you own {owned})</small>
              </button>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BASICS } from '../lib/compare';
import { db, type Deck } from '../lib/db';
import { addToDeck, assignCardToList, changeQty, manageBinderLists, moveCardToBinder, removeFromDeck, removeOneFromBinder, setCommander, setFoil, setPrinting } from '../lib/deckedit';
import { printingsOf } from '../lib/scryfall';
import { haptic } from '../lib/haptics';
import { norm, slug } from '../lib/names';
import { openDeck } from '../lib/nav';
import type { PinSide } from '../lib/pins';
import { shopUrl } from '../lib/prices';
import { scryfallUrl } from './shared';

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
  const allBinders = useLiveQuery(() => db.profiles.toArray()) ?? [];
  const currProf = useLiveQuery(() => db.profiles.get(profile), [profile]);
  const binderLists = currProf?.lists ?? [];
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [movingBinder, setMovingBinder] = useState(false);
  const [movingList, setMovingList] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [addingList, setAddingList] = useState(false);
  // Keep the menu on screen: open left / up near the right / bottom edge.
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(16, Math.min(at.x, innerWidth - r.width - 16)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y, adding, movingBinder, movingList]);
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
  // Change artwork: pick the printing you own (Scryfall's paper printings, loaded when opened)
  const [arts, setArts] = useState<Awaited<ReturnType<typeof printingsOf>> | null | 'loading'>(null);
  const myRows = useLiveQuery(() => db.entries.where('profile').equals(profile).toArray(), [profile])?.filter((e) => norm(e.name) === norm(name)) ?? [];
  const mine = new Set(myRows.map((e) => e.cardId));
  const openArts = async () => {
    haptic('select');
    if (arts) return setArts(null);
    setArts('loading');
    setArts(await printingsOf(name.split(' // ')[0]));
  };
  const shownLegends = legends.filter((c) => norm(c.name).includes(norm(q))).slice(0, 8);
  const basic = BASICS.has(norm(name));
  const toast = (t: Toast) => onToast?.(t);
  const act = (f: () => unknown) => () => (f(), onClose());
  const link = (href: string, text: string) => (
    <li>
      <a href={href} target="_blank" rel="noreferrer" onContextMenu={(e) => e.preventDefault()} onClick={() => (haptic('tap'), onClose())}>
        <span className="cmenu-main">{text}</span>
        <span className="cmenu-arr">↗</span>
      </a>
    </li>
  );
  return (
    <>
      <div className="backdrop menuback" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="cardmenu" role="menu" aria-label={`${name} options`} style={pos} onContextMenu={(e) => e.preventDefault()} onClick={(e) => e.stopPropagation()}>
        <div className="mh">{name}</div>
        <ul>
          {onSwap && (
            <li>
              <button onClick={act(() => (haptic('open'), onSwap()))}>
                <span className="cmenu-main">SWAP…</span>
                <small className="cmenu-meta">top 3 or search</small>
              </button>
            </li>
          )}
          {pin && !isCmdr && (
            <>
              <li>
                <button disabled={!pin.canIn && pin.side !== 'in'} onClick={act(() => (haptic(pin.side === 'in' ? 'undo' : 'success'), pin.onPin('in')))}>
                  <span className="cmenu-main">{pin.side === 'in' ? 'UNPIN (ALWAYS IN)' : 'ALWAYS IN'}</span>
                  {!pin.canIn && pin.side !== 'in' && <small className="cmenu-meta">owned only</small>}
                </button>
              </li>
              <li>
                <button onClick={act(() => (haptic(pin.side === 'out' ? 'undo' : 'success'), pin.onPin('out')))}>
                  <span className="cmenu-main">{pin.side === 'out' ? 'ALLOW CARD' : 'NEVER USE'}</span>
                </button>
              </li>
            </>
          )}
          {d && isCmdr && (
            <li>
              <button aria-expanded={picking} onClick={() => (haptic('select'), setPicking(!picking))}>
                <span className="cmenu-main">CHANGE COMMANDER…</span>
                <span className="cmenu-meta">{picking ? '▲' : '▼'}</span>
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
              <button onClick={act(() => (haptic('success'), setCommander(d, name)))}>
                <span className="cmenu-main">{d.commander ? 'MAKE COMMANDER' : 'SET AS COMMANDER'}</span>
                {d.commander && <small className="cmenu-meta">replaces {d.commander.split(' // ')[0]}</small>}
              </button>
            </li>
          )}
          {others.length > 0 && !isCmdr && (
            <li>
              <button aria-expanded={adding} onClick={() => (haptic('select'), setAdding(!adding))}>
                <span className="cmenu-main">+ ADD TO A DECK…</span>
                <span className="cmenu-meta">{adding ? '▲' : '▼'}</span>
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
              <span className="using-lead">ALSO IN:</span>
              <div className="using-pills">
                {using.map((x) => (
                  <button key={x.id} className="deck-chip" onClick={act(() => (haptic('open'), openDeck(x.name)))}>
                    {x.name}
                  </button>
                ))}
              </div>
            </li>
          )}
          {owned > 0 && (
            <>
              <li>
                <button aria-expanded={movingBinder} onClick={() => (haptic('select'), setMovingBinder(!movingBinder))}>
                  <span className="cmenu-main">MOVE TO BINDER…</span>
                  <span className="cmenu-meta">{movingBinder ? '▲' : '▼'}</span>
                </button>
                {movingBinder && (
                  <ul className="sub">
                    {/* Unassigned Cards option if not currently on profile 0 */}
                    {profile !== 0 && (
                      <li>
                        <button
                          onClick={act(async () => {
                            haptic('success');
                            const undo = await moveCardToBinder(profile, 0, name, c?.foil, false);
                            toast({ text: `Moved one ${name} to Unassigned Cards`, undo });
                          })}
                        >
                          Unassigned Cards <small>· unassigned</small>
                        </button>
                      </li>
                    )}
                    {allBinders
                      .filter((b) => b.id !== profile && b.id !== 0)
                      .map((b) => (
                        <li key={b.id}>
                          <button
                            onClick={act(async () => {
                              haptic('success');
                              const undo = await moveCardToBinder(profile, b.id, name, c?.foil, false);
                              toast({ text: `Moved one ${name} to ${b.name}`, undo });
                            })}
                          >
                            {b.name}
                          </button>
                        </li>
                      ))}
                    {allBinders.filter((b) => b.id !== profile).length === 0 && profile === 0 && (
                      <li>
                        <small>No other binder available.</small>
                      </li>
                    )}
                  </ul>
                )}
              </li>

              <li>
                <button aria-expanded={movingList} onClick={() => (haptic('select'), setMovingList(!movingList))}>
                  <span className="cmenu-main">MOVE TO LIST…</span>
                  <span className="cmenu-meta">{movingList ? '▲' : '▼'}</span>
                </button>
                {movingList && (
                  <ul className="sub">
                    <li>
                      <button
                        onClick={act(async () => {
                          haptic('success');
                          const undo = await assignCardToList(profile, name, null, c?.foil);
                          toast({ text: `${name}: moved to Unlisted`, undo });
                        })}
                      >
                        NO LIST (UNLISTED)
                      </button>
                    </li>
                    {binderLists.map((l) => (
                      <li key={l}>
                        <button
                          onClick={act(async () => {
                            haptic('success');
                            const undo = await assignCardToList(profile, name, l, c?.foil);
                            toast({ text: `${name}: assigned to ${l}`, undo });
                          })}
                        >
                          {l}
                        </button>
                      </li>
                    ))}
                    {!addingList ? (
                      <li>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAddingList(true);
                          }}
                        >
                          + CREATE NEW LIST…
                        </button>
                      </li>
                    ) : (
                      <li className="newlistrow" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          className="subq"
                          value={newListName}
                          onChange={(e) => setNewListName(e.target.value)}
                          placeholder="List name…"
                          autoFocus
                          onKeyDown={async (e) => {
                            if (e.key === 'Enter' && newListName.trim()) {
                              e.preventDefault();
                              const trimmed = newListName.trim();
                              await manageBinderLists(profile, 'add', trimmed);
                              haptic('success');
                              const undo = await assignCardToList(profile, name, trimmed, c?.foil);
                              toast({ text: `${name}: moved to new list ${trimmed}`, undo });
                              onClose();
                            } else if (e.key === 'Escape') {
                              setAddingList(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="u-btn primary"
                          style={{ minHeight: '30px', padding: '0 8px', fontSize: '12px' }}
                          disabled={!newListName.trim()}
                          onClick={async () => {
                            const trimmed = newListName.trim();
                            if (!trimmed) return;
                            await manageBinderLists(profile, 'add', trimmed);
                            haptic('success');
                            const undo = await assignCardToList(profile, name, trimmed, c?.foil);
                            toast({ text: `${name}: moved to new list ${trimmed}`, undo });
                            onClose();
                          }}
                        >
                          SAVE
                        </button>
                      </li>
                    )}
                  </ul>
                )}
              </li>
            </>
          )}
          {owned > 0 && (
            <li>
              <button aria-expanded={!!arts} onClick={openArts}>
                <span className="cmenu-main">CHANGE ARTWORK…</span>
                <small className="cmenu-meta">printing {arts ? '▲' : '▼'}</small>
              </button>
              {arts === 'loading' && <p className="small artsload">Loading printings from Scryfall…</p>}
              {arts && arts !== 'loading' && (
                <ul className="artgrid" aria-label="Printings">
                  {arts.length === 0 && <li className="small">Scryfall has no other printing.</li>}
                  {arts.map((p) => (
                    <li key={p.id}>
                      <button
                        aria-pressed={mine.has(p.id)}
                        title={`${p.setName} #${p.cn}`}
                        onClick={act(async () => (haptic('success'), toast({ text: `${name}: ${p.setName} art`, undo: await setPrinting(profile, name, p, p.set, p.cn) })))}
                      >
                        {p.img && <img src={p.img} alt={`${p.setName} #${p.cn}`} loading="lazy" />}
                        <small>
                          {p.set.toUpperCase()} {p.cn}
                        </small>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )}
          <li className="sep" />
          {d && c && (
            <li>
              <button onClick={act(() => (haptic('success'), setFoil(d, profile, name, !c.foil)))}>
                <span className="cmenu-main">{c.foil ? 'SWITCH TO NON-FOIL' : 'SWITCH TO FOIL'}</span>
                <small className="cmenu-meta">{owned ? 'binder copy too' : 'deck only'}</small>
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
              <span className="cmenu-main">{copied ? 'COPIED TO CLIPBOARD' : 'COPY CARD NAME'}</span>
              {copied && <span className="cmenu-meta">✓</span>}
            </button>
          </li>
          {link(shopUrl(name), 'Open in shop')}
          {link(`https://edhrec.com/${isCmdr ? 'commanders' : 'cards'}/${slug(name.split(' // ')[0])}`, isCmdr ? 'Open on EDHREC' : 'Best commanders for it (EDHREC)')}
          {link(scryfallUrl(name), 'Open on Scryfall')}
          {(d || (owned > 0 && !basic)) && <li className="sep" />}
          {d && c && (
            <li>
              <button className="danger" onClick={act(async () => (haptic('warn'), toast({ text: `Removed ${name} from the deck`, undo: await removeFromDeck(d, name) })))}>
                <span className="cmenu-main">REMOVE FROM DECK</span>
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
                <span className="cmenu-main">REMOVE ONE FROM BINDER</span>
                <small className="cmenu-meta">(you own {owned})</small>
              </button>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

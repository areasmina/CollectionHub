import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { BRACKETS, BUDGETS, fetchPage, imgOf, pagePath, type EdhCard, type EdhPage } from '../lib/edhrec';
import { norm, slug as toSlug } from '../lib/names';
import { cad, rateNote, shopUrl } from '../lib/prices';
import { cardsByIds, cheapest, withCheapest } from '../lib/scryfall';
import { rankSubs, type SubCard } from '../lib/subs';
import { CardLine, CardTile, money, priceSum, Segs, usd, type Shared } from './shared';
import { Doodles, ownColour, PageDecor, Pips, Ransom, RiseBars, Tape, Xgrain } from './zine';

// The 'As Commander' popularity view is hidden for now; set true to bring the View switch back.
const SHOW_AS_COMMANDER = false;

const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ids = (p: EdhPage | null) => p?.lists.flatMap((l) => l.cards.map((c) => c.id).filter(Boolean) as string[]) ?? [];

export function CommanderView({ name, s, onBack, no }: { name: string; s: Shared; onBack: () => void; no?: number }) {
  const slug = toSlug(name);
  const [kind, setKind] = useState<'commander' | 'average'>(SHOW_AS_COMMANDER ? 'commander' : 'average');
  const [bracket, setBracket] = useState('');
  const [budget, setBudget] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState<EdhPage | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null); // EDHREC recommendations behind an average deck
  const [tags, setTags] = useState<EdhPage['tags']>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const path = pagePath(kind, slug, bracket, tag, budget);
  const profile = useLiveQuery(() => db.profiles.get(s.profile), [s.profile]);
  const swaps = profile?.swaps?.[path] ?? {};
  const bought = new Set(profile?.bought ?? []);

  useEffect(() => {
    fetchPage(pagePath('commander', slug))
      .then((p) => setTags(p.tags))
      .catch(() => setTags([]));
  }, [slug]);
  useEffect(() => {
    let live = true;
    setPage(null);
    setRecs(null);
    setError('');
    setMenuFor(null);
    fetchPage(path)
      .then((p) => live && setPage(p))
      .catch((e) => live && setError(e.message));
    if (kind === 'average')
      fetchPage(pagePath('commander', slug, bracket, tag, budget))
        .catch(() => fetchPage(pagePath('commander', slug)))
        .then((p) => live && setRecs(p))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);

  // EDHREC lists carry Scryfall ids but no prices: prices/images/types from Scryfall (cached a week), cheapest printing's price.
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const want = [...ids(page), ...ids(recs)];
    let live = true;
    if (want.length)
      cardsByIds(want)
        .then(async (m) => {
          if (live) setCards(m);
          const cheap = await cheapest([...m.values()].map((c) => c.name));
          if (live) setCards(new Map([...m].map(([id, c]) => [id, withCheapest(c, cheap)!])));
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [page, recs]);

  const all = page?.lists.flatMap((l) => l.cards) ?? [];
  const names = [...new Set(all.map((c) => c.name))];
  const sum = summarize(names, s.mine, s.other);
  const missing = [...new Map(all.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => [c.name, c])).values()];
  const cardOf = (c: EdhCard) => (c.id ? cards.get(c.id) : undefined);
  const missingCost = priceSum(missing.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));

  // Replacement candidates: owned cards EDHREC recommends for this commander that the deck doesn't already use.
  const inDeck = new Set([...names, ...Object.values(swaps)].map(norm));
  const recInfo = new Map<string, SubCard>();
  // A card's category is its type list (Creatures, Mana Artifacts…), not the highlight lists (Top Cards, High Lift…) that come first.
  const META = /^(new cards|top cards|high synergy|high lift|game changers)/i;
  for (const l of recs?.lists ?? [])
    for (const c of l.cards) {
      const sc = cardOf(c);
      const prev = recInfo.get(norm(c.name));
      // Highlight lists aren't a role: such a card is matched on type and mana value instead.
      if (!prev || (!prev.category && !META.test(l.header))) recInfo.set(norm(c.name), { name: c.name, category: META.test(l.header) ? undefined : l.header, type: sc?.type, cmc: sc?.cmc, synergy: c.synergy, incl: c.potential ? (c.decks ?? 0) / c.potential : undefined });
    }
  const candidates = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !inDeck.has(norm(c.name)));
  const recCard = new Map((recs?.lists ?? []).flatMap((l) => l.cards).map((c) => [norm(c.name), c]));
  const suggest = (c: EdhCard) => {
    const info = recInfo.get(norm(c.name));
    const sc = cardOf(c);
    return rankSubs({ name: c.name, category: info?.category, type: sc?.type ?? info?.type, cmc: sc?.cmc ?? info?.cmc }, candidates);
  };

  async function setSwap(missingName: string, replacement: string | null) {
    const p = (await db.profiles.get(s.profile))!;
    const deck = { ...(p.swaps?.[path] ?? {}) };
    if (replacement) deck[missingName] = replacement;
    else delete deck[missingName];
    await db.profiles.update(s.profile, { swaps: { ...(p.swaps ?? {}), [path]: deck } });
    setMenuFor(null);
  }
  async function toggleBought(cardName: string) {
    const p = (await db.profiles.get(s.profile))!;
    const set = new Set(p.bought ?? []);
    const k = norm(cardName);
    if (set.has(k)) set.delete(k);
    else set.add(k);
    await db.profiles.update(s.profile, { bought: [...set] });
  }

  async function saveDeck() {
    if (!page) return;
    const list = page.lists.flatMap((l) => l.cards.map((c) => ({ name: swaps[c.name] ?? c.name, qty: c.qty ?? 1 })));
    await db.decks.add({ profile: s.profile, name: `${name} (EDHREC average)`, commander: name, cards: [{ name, qty: 1 }, ...list], updated: Date.now() });
    setSaved('Saved to Decks.');
  }

  const toBuy = missing.filter((c) => !bought.has(norm(c.name)));
  const toBuyCost = priceSum(toBuy.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));
  const pricesIn = cards.size > 0;
  const cmdr = useLiveQuery(() => db.cards.where('key').equals(norm(name)).first(), [name]);
  const ci = cmdr?.ci ?? page?.card?.ci ?? [];
  const bigImg = cmdr?.img?.replace('/small/', '/normal/') ?? imgOf(page?.card?.id, 'normal');
  const label = name.split(' // ')[0];
  // Grid (card images) is the default; the choice is remembered on this device.
  const [view, setViewState] = useState<'grid' | 'list'>(() => {
    try {
      return localStorage.getItem('ch:view') === 'list' ? 'list' : 'grid';
    } catch {
      return 'grid';
    }
  });
  const setView = (v: 'grid' | 'list') => {
    setViewState(v);
    setMenuFor(null);
    try {
      localStorage.setItem('ch:view', v);
    } catch {
      /* per-device convenience only */
    }
  };
  const Item = view === 'grid' ? CardTile : CardLine;

  const receipt = kind === 'average' && missing.length > 0 && (
    <aside className="receipt gbox" id="shop" aria-label="Shopping list">
      <Doodles n={377} count={1} spots={[[64, 2]]} paper />
      <h2>*** TO BUY ***</h2>
      <hr />
      <div className="sub">your picks · ≈CA$ at your shop</div>
      <ul>
        {missing.map((c) => {
          const done = bought.has(norm(c.name));
          return (
            <li key={c.name} className={done ? 'done' : ''}>
              <label>
                <input type="checkbox" checked={done} onChange={() => toggleBought(c.name)} aria-label={`Got ${c.name}`} />
                <span className="nm">
                  {c.qty && c.qty > 1 ? `${c.qty}× ` : ''}
                  {c.name}
                  {swaps[c.name] && <small> · using {swaps[c.name]} for now</small>}
                </span>
              </label>
              <span className="pr">
                <a href={shopUrl(c.name)} target="_blank" rel="noreferrer" title={rateNote()} aria-label={`${usd(cardOf(c))}: search ${c.name} on shop.com`}>
                  {usd(cardOf(c))} ↗
                </a>
              </span>
            </li>
          );
        })}
      </ul>
      <hr />
      <div className="total">
        <span>TO BUY ({toBuy.length})</span>
        <span>{pricesIn ? money(toBuyCost) : '≈CA$—'}</span>
      </div>
      <p className="small">{rateNote()}</p>
      <hr />
      <div className="thanks">thank you for building with what you own</div>
    </aside>
  );

  return (
    <>
      <PageDecor seed={711} rays="70% 26%" sheet={{ side: 'right', top: 900, rot: -6 }} />
      <main>
        <button className="backlink" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11 2 L4 8 L11 14" fill="none" stroke="#E60012" strokeWidth="3" />
          </svg>
          COMMANDERS
        </button>

        <section className="chero">
          <span className="worn" aria-hidden="true" />
          <div className="cimg gbox">
            {/* The commander's own card: always full colour with a xerox look (contrast, halftone, grain). */}
            <span className="xart cmdrimg">
              <Tape style={{ top: -13, left: 70, width: 86, height: 24, transform: 'rotate(-6deg)' }} />
              {bigImg && <img src={bigImg} alt={label} />}
              <Xgrain />
            </span>
            <Doodles n={301} count={1} spots={[[60, 62], [-20, 4]]} />
          </div>
          <div className="cright">
            {/* Clicking the commander's name goes back to Discover (the COMMANDERS link does the same for keyboards). */}
            <div className="ctitle" onClick={onBack} title="Back to Discover">
              <div className="banner ht" aria-hidden="true" />
              <h1 aria-label={label}>
                <Ransom text={label.toUpperCase()} size={label.length > 28 ? 44 : 54} seed={11} breakWords />
              </h1>
              <Pips ci={ci} size={30} />
            </div>
            <div className="cmeta">
              <span className="typed">
                {[...tags.slice(0, 3).map((t) => t.value.toUpperCase()), page?.numDecks ? `${page.numDecks.toLocaleString()} DECKS` : ''].filter(Boolean).join(' · ')}
                {' · '}
                <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
                  EDHREC ↗
                </a>
              </span>
              {page && (
                <span className="score">
                  <span className="mono">
                    NO. {no ? String(no).padStart(3, '0') : '—'}
                    <br />
                    {page.numDecks ? page.numDecks.toLocaleString() : '—'} EDHREC DECKS
                  </span>
                  <span className="pct">
                    <span className="bigpct">{sum.pct}%</span>
                    <RiseBars pct={sum.pct} />
                  </span>
                </span>
              )}
            </div>
            {tags.length > 0 && (
              <div className="builtaround">
                <span>built around</span>
                <div className="hscroll" role="group" aria-label="EDHREC tags, scroll sideways for more">
                  {tags.slice(0, 24).map((t) => (
                    <button key={t.slug} aria-pressed={tag === t.slug} onClick={() => setTag(tag === t.slug ? '' : t.slug)}>
                      {t.value.toUpperCase()} {t.count.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="strip" aria-label="Filters and totals">
          <Tape style={{ top: -12, left: -14, width: 84, height: 24, transform: 'rotate(-24deg)' }} />
          <Tape style={{ top: -10, right: 60, width: 84, height: 24, transform: 'rotate(5deg)' }} />
          {SHOW_AS_COMMANDER && (
            <div className="cell">
              <span className="lbl">VIEW</span>
              <Segs label="View" value={kind} options={[['commander', 'AS CMDR'], ['average', 'AVERAGE']]} onChange={(v) => setKind(v as typeof kind)} />
            </div>
          )}
          <div className="cell">
            <span className="lbl">BRACKET</span>
            <Segs label="Bracket" value={bracket} options={BRACKETS.map(([v, t]) => [v, ROMAN[t] ?? t.toUpperCase()])} onChange={setBracket} roman />
          </div>
          <div className="cell">
            <span className="lbl">BUDGET</span>
            <Segs label="Budget" value={budget} options={BUDGETS.map(([v, t]) => [v, t.toUpperCase()])} onChange={setBudget} />
          </div>
          <div className="cell wide">
            <span className="lbl">COLLECTION MATCH</span>
            <div className="match" role="img" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
              <span className="burst" aria-hidden="true" />
              <span className="num">{page ? `${sum.pct}%` : '—'}</span>
              <span className="meter">
                <span className="cells10" aria-hidden="true" style={{ '--own': ownColour(sum.pct) } as React.CSSProperties}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} className={(i + 1) * 10 <= sum.pct + 5 ? 'on' : ''} />
                  ))}
                </span>
                <small>
                  You own {sum.owned} of {sum.total}
                  {page?.numDecks ? ` · ${page.numDecks.toLocaleString()} EDHREC decks` : ''}
                  {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
                </small>
              </span>
            </div>
          </div>
          <div className="cell">
            <span className="lbl">MISSING</span>
            <div className="plate" role="img" aria-label={`Warning: missing cards cost about ${pricesIn ? money(missingCost) : 'an unknown amount'}`}>
              <span className="wedge" aria-hidden="true">
                <svg width="24" height="22" viewBox="0 0 24 22">
                  <path d="M12 1 L23 21 H1 Z" fill="#FFCC00" />
                  <path d="M12 8 V14 M12 16.5 V18" stroke="#0A0A0A" strokeWidth="2.6" strokeLinecap="square" />
                </svg>
              </span>
              <span className="amt">
                <small>≈</small>
                {pricesIn ? cad(missingCost) : 'CA$—'}
              </span>
              <Tape style={{ right: -14, top: -12, width: 46, height: 18, transform: 'rotate(32deg)' }} />
            </div>
          </div>
          <div className="cell">
            <span className="lbl">DECK</span>
            <button className="btn" onClick={saveDeck} disabled={!!saved || !page || kind !== 'average'}>
              {saved ? 'SAVED ✓' : 'SAVE AS DECK'}
            </button>
          </div>
          <span className="hint">
            {kind === 'average' && missing.length > 0 ? 'hover or tap a missing card to swap in one of yours' : 'every card here is in your binder'}
            <span className="cur">_</span>
            {receipt && (
              <a className="jump" href="#shop">
                {' '}
                · shopping list ({toBuy.length}) ↓
              </a>
            )}
          </span>
        </section>

        {error && <p className="error">{error}</p>}
        {!page && !error && <p className="count">Loading EDHREC data…</p>}
        {page && (
          <div className="viewsw" role="group" aria-label="Card view">
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              GRID
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              LIST
            </button>
          </div>
        )}
        {page && (
          <div className="deckgrid after-sw">
            {menuFor && view === 'grid' && <div className="backdrop" onClick={() => setMenuFor(null)} />}
            <div className="lists">
              {page.lists.map((l) => {
                const ls = summarize(l.cards.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={l.header} className="cat" open>
                    <summary>
                      <span className="pm" aria-hidden="true" />
                      <span className="h">{l.header}</span>
                      <span className="dots" aria-hidden="true" />
                      <span className="n">
                        {ls.owned}/{ls.total} owned
                      </span>
                    </summary>
                    <ul className={view === 'grid' ? 'zgrid' : 'zlist'}>
                      {l.cards.map((c) => {
                        const swappable = kind === 'average' && statusOf(c.name, s.mine) !== 'owned';
                        const repl = swaps[c.name];
                        const rc = repl ? recCard.get(norm(repl)) : undefined;
                        const stat = c.potential ? `${pct((c.decks ?? 0) / c.potential)} of decks${c.lift ? ` · ${c.lift.toFixed(1)}x lift` : ''}` : c.qty && c.qty > 1 ? `×${c.qty}` : '';
                        return (
                          <Item
                            key={c.name}
                            name={repl ?? c.name}
                            img={imgOf(rc?.id ?? c.id)}
                            card={rc ? cardOf(rc) : repl ? undefined : cardOf(c)}
                            s={s}
                            note={stat}
                            marker={repl ? c.name : undefined}
                            onOpen={swappable ? () => setMenuFor(c.name) : undefined}
                            onClose={swappable ? () => setMenuFor(null) : undefined}
                          >
                            {menuFor === c.name && (
                              <div className="note-pop" role="dialog" aria-label={`Replace ${c.name}`} onClick={(e) => e.stopPropagation()}>
                                <Tape style={{ top: -12, left: '40%', width: 90, height: 24, transform: 'rotate(4deg)' }} />
                                <div className="nh">
                                  <span>
                                    {repl ? 'SWAPPED FOR ' : 'REPLACE '}
                                    <mark>{c.name.toUpperCase()}</mark>
                                    {repl ? '' : ' WITH ONE OF YOURS'}
                                  </span>
                                  <button className="close" aria-label="Close" onClick={() => setMenuFor(null)}>
                                    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                                      <path d="M2 2 L12 12 M12 2 L2 12" stroke="currentColor" strokeWidth="3" />
                                    </svg>
                                  </button>
                                </div>
                                <ul>
                                  {repl && (
                                    <li>
                                      <button onClick={() => setSwap(c.name, null)}>
                                        <span>
                                          <b>UNDO SWAP</b>
                                          <small>back to {c.name}</small>
                                        </span>
                                      </button>
                                    </li>
                                  )}
                                  {!repl &&
                                    suggest(c).map((sub) => {
                                      const sc = recCard.get(norm(sub.name));
                                      const src = (sc && cardOf(sc)?.img) ?? imgOf(sc?.id);
                                      return (
                                        <li key={sub.name}>
                                          <button onClick={() => setSwap(c.name, sub.name)}>
                                            {src && <img src={src} alt="" loading="lazy" />}
                                            <span>
                                              <b>{sub.name}</b>
                                              <small>{sub.category}</small>
                                            </span>
                                          </button>
                                        </li>
                                      );
                                    })}
                                </ul>
                                {!repl && suggest(c).length === 0 && <p className="small">{recs ? 'No owned card fits this slot.' : 'Loading suggestions…'}</p>}
                              </div>
                            )}
                          </Item>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
            {receipt}
          </div>
        )}
      </main>
    </>
  );
}

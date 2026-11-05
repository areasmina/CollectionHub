import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { BRACKETS, BUDGETS, DEFAULT_BRACKET, imgOf, NoPage, pagePath, showPage, type EdhCard, type EdhPage } from '../lib/edhrec';
import { norm, slug as toSlug } from '../lib/names';
import { cad, fetchedNote, rateNote, shopUrl } from '../lib/prices';
import { cardsByIds, cheapest, withCheapest } from '../lib/scryfall';
import { rankSubs, type SubCard } from '../lib/subs';
import { freeDeckName } from '../lib/nav';
import { orderSections } from '../lib/sections';
import { CardLine, CardTile, DeckLink, HeroStats, money, priceSum, Segs, ShortAlert, snapTick, usd, Pick, useStored, type Shared } from './shared';
import { shortfalls } from '../lib/copies';
import { shows, sortBy, SHOWS, SORTS, type Show, type SortKey } from '../lib/arrange';

// EDHREC's own order first on commander pages.
const CSORTS: [SortKey, string][] = [['list', 'EDHREC ORDER'], ...SORTS];
import { SwapNote } from './SwapNote';
import { Doodles, ownColour, PageDecor, Pips, Ransom, RiseBars, Tape, Xgrain, GridIcon, ListIcon } from './zine';

// The 'As Commander' popularity view is hidden for now; set true to bring the View switch back.
const SHOW_AS_COMMANDER = false;

const ROMAN: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III', '4': 'IV', '5': 'V' };
const pct = (n: number) => `${Math.round(n * 100)}%`;
const ids = (p: EdhPage | null) => [p?.card?.id, ...(p?.lists.flatMap((l) => l.cards.map((c) => c.id)) ?? [])].filter(Boolean) as string[];

export function CommanderView({ name, s, onBack, no }: { name: string; s: Shared; onBack: () => void; no?: number }) {
  const slug = toSlug(name);
  const [kind, setKind] = useState<'commander' | 'average'>(SHOW_AS_COMMANDER ? 'commander' : 'average');
  const [bracket, setBracket] = useState(DEFAULT_BRACKET);
  const [noBracket, setNoBracket] = useState(false); // EDHREC has no page for this bracket: showing all brackets
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
    showPage(pagePath('commander', slug), (p) => setTags(p.tags)).catch(() => setTags([]));
  }, [slug]);
  useEffect(() => {
    let live = true;
    setPage(null);
    setRecs(null);
    setError('');
    setMenuFor(null);
    // Saved pages show at once; pages over a day old are refreshed quietly behind them.
    // No page for this bracket (thin commanders): the same view across all brackets, said under the bracket switch.
    setNoBracket(false);
    showPage(path, (p) => live && setPage(p))
      .catch((e) => {
        if (!(e instanceof NoPage) || !bracket) throw e;
        if (live) setNoBracket(true);
        return showPage(pagePath(kind, slug, '', tag, budget), (p) => live && setPage(p));
      })
      .catch((e) => live && setError(e.message));
    if (kind === 'average')
      showPage(pagePath('commander', slug, bracket, tag, budget), (p) => live && setRecs(p))
        .catch(() => showPage(pagePath('commander', slug, '', tag, budget), (p) => live && setRecs(p)))
        .catch(() => showPage(pagePath('commander', slug), (p) => live && setRecs(p)))
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

  // Average deck: Commander, Planeswalkers, Creatures, Instants, Sorceries, Enchantments, Artifacts, Lands (EDHREC's own order otherwise).
  const sections = page ? (kind === 'average' ? orderSections(page.lists, page.card ? { name, id: page.card.id, qty: 1 } : undefined) : page.lists) : [];
  const all = sections.flatMap((l) => l.cards);
  const names = [...new Set(all.map((c) => c.name))];
  const sum = summarize(names, s.mine, s.other);
  const missing = [...new Map(all.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => [c.name, c])).values()];
  const cardOf = (c: EdhCard) => (c.id ? cards.get(c.id) : undefined);
  const missingCost = priceSum(missing.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));
  const deckCost = priceSum([...new Map(all.map((c) => [c.name, c])).values()].map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));

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
    const deckName = await freeDeckName(s.profile, `${name} (EDHREC average)`);
    await db.decks.add({ profile: s.profile, name: deckName, commander: name, cards: [{ name, qty: 1 }, ...list], updated: Date.now() });
    setSaved(deckName);
  }

  const toBuy = missing.filter((c) => !bought.has(norm(c.name)));
  const toBuyCost = priceSum(toBuy.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));
  const pricesIn = cards.size > 0;
  // If you built this deck too: owned cards your saved decks already use up (saved decks of this commander are the same deck).
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [];
  // Your own decks led by this commander: one tap opens them.
  const mine = decks.filter((d) => d.commander === name).sort((a, b) => b.updated - a.updated);
  const thisDeck = `this ${name.split(' // ')[0]} deck`;
  const short = page
    ? shortfalls([...decks.filter((d) => d.commander !== name), { name: thisDeck, cards: all.map((c) => ({ name: swaps[c.name] ?? c.name, qty: c.qty ?? 1 })) }], s.mine).filter((x) => x.decks.includes(thisDeck))
    : [];
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
  const [sort, setSort] = useStored<SortKey>('ch:csort', 'list', CSORTS.map(([v]) => v));
  const [show, setShow] = useStored<Show>('ch:cshow', 'all', SHOWS.map(([v]) => v));

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
                <input type="checkbox" checked={done} onChange={() => (haptic(done ? 'tap' : 'success'), toggleBought(c.name))} aria-label={`Got ${c.name}`} />
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
      <p className="small">
        {rateNote()} {fetchedNote(missing.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))}.
      </p>
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
              <Tape style={{ top: -12, left: '50%', width: 90, height: 24, transform: 'translateX(-50%) rotate(-3deg)' }} />
              {bigImg && (
                <a href={`https://edhrec.com/commanders/${slug}`} target="_blank" rel="noreferrer" title="Open on EDHREC">
                  <img src={bigImg} alt={`${label}: open on EDHREC`} />
                </a>
              )}
              <Xgrain />
            </span>
            <Doodles n={301} count={1} spots={[[60, 62], [-20, 4]]} />
          </div>
          <div className="cright">
            {/* Clicking the commander's name goes back to Discover (the COMMANDERS link does the same for keyboards). */}
            <div className="ctitle" onClick={onBack} title="Back to Discover">
              <div className="banner ht" aria-hidden="true" />
              <h1 aria-label={label}>
                <Ransom text={label.toUpperCase()} size={label.length > 28 ? 44 : 54} seed={11} />
              </h1>
              <div className="namerow">
                <Pips ci={ci} size={30} />
                {page && <HeroStats price={pricesIn ? deckCost : undefined} fetched={fetchedNote(all.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))} names={names} />}
              </div>
            </div>
            <div className="cmeta">
              {tags.length > 0 && (
                <div className="builtaround">
                  <span>built around</span>
                  <div className="hscroll" role="group" aria-label="EDHREC tags, scroll sideways for more" onScroll={snapTick}>
                    {tags.slice(0, 24).map((t) => (
                      <button key={t.slug} aria-pressed={tag === t.slug} onClick={() => setTag(tag === t.slug ? '' : t.slug)}>
                        {t.value.toUpperCase()} {t.count.toLocaleString()}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <span className="score">
                <span className="mono">
                  NO. {no ? String(no).padStart(3, '0') : '—'}
                  <br />
                  {page?.numDecks ? page.numDecks.toLocaleString() : '—'} DECKS ·{' '}
                  <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
                    EDHREC ↗
                  </a>
                </span>
                {page && (
                  <span className="pct">
                    <span className="bigpct">{sum.pct}%</span>
                    <RiseBars pct={sum.pct} />
                  </span>
                )}
              </span>
            </div>
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
            {noBracket && <small className="bnote">No EDHREC decks for bracket {ROMAN[BRACKETS.find(([v]) => v === bracket)?.[1] ?? '']}: showing all brackets</small>}
          </div>
          <div className="cell">
            <span className="lbl">BUDGET</span>
            <Segs label="Budget" value={budget} options={BUDGETS.map(([v, t]) => [v, t.toUpperCase()])} onChange={setBudget} />
          </div>
          <div className="cell wide">
            <span className="lbl">COLLECTION MATCH</span>
            <div className="match" role="img" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
              <span className="burst" aria-hidden="true" />
              <span className="meter">
                <span className="cells10" aria-hidden="true" style={{ '--own': ownColour(sum.pct) } as React.CSSProperties}>
                  {Array.from({ length: 10 }, (_, i) => (
                    <span key={i} className={(i + 1) * 10 <= sum.pct + 5 ? 'on' : ''} />
                  ))}
                </span>
                <small>
                  {/* The % itself is in the header; this line says what it's made of. */}
                  You own {sum.owned} of {sum.total} cards
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
            {saved ? (
              <DeckLink name={saved}>
                <span className="btn">SAVED ✓ OPEN →</span>
              </DeckLink>
            ) : (
              <button className="btn" onClick={saveDeck} disabled={!page || kind !== 'average'}>
                SAVE AS DECK
              </button>
            )}
          </div>
          <span className="hint">
            {kind === 'average' && missing.length > 0 ? 'click or tap a missing card to swap in one of yours' : 'every card here is in your binder'}
            <span className="cur">_</span>
            {receipt && (
              <a className="jump" href="#shop">
                {' '}
                · shopping list ({toBuy.length}) ↓
              </a>
            )}
            {/* Your decks with this commander sit on this full-width line, so the DECK cell stays as short as the
                others (a long list there left an empty band across the whole strip). */}
            {mine.length > 0 && !saved && (
              <span className="mydecks">
                {' · '}your deck{mine.length > 1 ? 's' : ''}:{' '}
                {mine.map((d, i) => (
                  <span key={d.id}>
                    {i > 0 && ', '}
                    <DeckLink name={d.name} />
                  </span>
                ))}
              </span>
            )}
          </span>
        </section>

        <ShortAlert items={short} />
        {error && <p className="error">{error}</p>}
        {!page && !error && <p className="count">Loading EDHREC data…</p>}
        {page && (
          <div className="deckgrid after-sw">
            {menuFor && <div className="backdrop" onClick={() => setMenuFor(null)} />}
            <div className="lists">
              {/* How the cards are ordered and filtered, right above them */}
              <div className="dtools" role="toolbar" aria-label="Card order and filter">
                <Pick label="SORT" value={sort} options={CSORTS} onChange={(v) => (setSort(v), setMenuFor(null))} />
                <Pick label="SHOW" value={show} options={SHOWS} onChange={(v) => (setShow(v), setMenuFor(null))} />
              </div>
              {sections.map((l, i) => {
                // A swapped-in card is one of yours, so it counts as owned for SHOW.
                const own = (c: EdhCard) => !!swaps[c.name] || statusOf(c.name, s.mine) === 'owned';
                const cs = sortBy(
                  l.cards.filter((c) => shows(show, own(c))),
                  sort,
                  (c) => ({ name: c.name, usd: cardOf(c)?.usd ? Number(cardOf(c)!.usd) : undefined, mv: cardOf(c)?.cmc, owned: own(c) }),
                );
                if (!cs.length) return null;
                const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={l.header} className="cat" open>
                    <summary>
                      <span className="pm" aria-hidden="true" />
                      <span className="h">
                        {l.header} ({cs.reduce((n, c) => n + (c.qty ?? 1), 0)})
                      </span>
                      {pricesIn && (
                        <span className="gval" title="What this group's cards are worth (cheapest printings)">
                          ≈{cad(priceSum(cs.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 }))))}
                        </span>
                      )}
                      <span className="dots" aria-hidden="true" />
                      <span className="n">
                        {ls.owned}/{ls.total} owned
                      </span>
                    </summary>
                    {i === 0 && (
                      // Grid / list sits in the first section (the commander's), in the space beside the card
                      <div className={`viewsw mini${view === 'grid' && cs.length === 1 ? ' over' : ''}`} role="group" aria-label="Card view">
                        <button aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => (haptic('select'), setView('grid'))}>
                          <GridIcon />
                        </button>
                        <button aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => (haptic('select'), setView('list'))}>
                          <ListIcon />
                        </button>
                      </div>
                    )}
                    <ul className={view === 'grid' ? 'zgrid' : 'zlist'}>
                      {cs.map((c) => {
                        const swappable = kind === 'average' && statusOf(c.name, s.mine) !== 'owned' && norm(c.name) !== norm(name);
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
                              <SwapNote
                                name={c.name}
                                missing={{ ...recInfo.get(norm(c.name)), name: c.name, type: cardOf(c)?.type ?? recInfo.get(norm(c.name))?.type, cmc: cardOf(c)?.cmc ?? recInfo.get(norm(c.name))?.cmc }}
                                big={imgOf(c.id, 'normal')}
                                replaced={repl}
                                loading={!recs}
                                options={suggest(c).map((sub) => {
                                  const sc = recCard.get(norm(sub.name));
                                  return { sub, img: (sc && cardOf(sc)?.img) ?? imgOf(sc?.id), big: imgOf(sc?.id, 'normal'), owned: s.mine.get(norm(sub.name)) ?? 0 };
                                })}
                                onPick={(sub) => (haptic('success'), setSwap(c.name, sub))}
                                onUndo={() => (haptic('undo'), setSwap(c.name, null))}
                                onClose={() => setMenuFor(null)}
                              />
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

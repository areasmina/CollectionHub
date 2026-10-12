import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { BRACKETS, BUDGETS, fetchPage, imgOf, pagePath, type EdhCard, type EdhPage } from '../lib/edhrec';
import { norm, slug as toSlug } from '../lib/names';
import { rateNote, shopUrl } from '../lib/prices';
import { cardsByIds, cheapest, withCheapest } from '../lib/scryfall';
import { rankSubs, type SubCard } from '../lib/subs';
import { CardLine, money, priceSum, Seg, Thumb, usd, type Shared } from './shared';

// The 'As Commander' popularity view is hidden for now; set true to bring the View switch back.
const SHOW_AS_COMMANDER = false;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ids = (p: EdhPage | null) => p?.lists.flatMap((l) => l.cards.map((c) => c.id).filter(Boolean) as string[]) ?? [];

export function CommanderView({ name, s, onBack }: { name: string; s: Shared; onBack: () => void }) {
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
      if (!prev || (META.test(prev.category ?? '') && !META.test(l.header))) recInfo.set(norm(c.name), { name: c.name, category: l.header, type: sc?.type, cmc: sc?.cmc, synergy: c.synergy, incl: c.potential ? (c.decks ?? 0) / c.potential : undefined });
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
  const shopping = kind === 'average' && missing.length > 0 && (
    <aside className="shop" id="shop" aria-label="Shopping list">
      <h2>Shopping list</h2>
      <p className="muted small">
        {toBuy.length} to buy · <strong>{money(priceSum(toBuy.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 }))))}</strong>
        <br />
        <span title={rateNote()}>Prices are estimates in CAD ({rateNote()}).</span>
      </p>
      <ul>
        {missing.map((c) => (
          <li key={c.name} className={bought.has(norm(c.name)) ? 'done' : ''}>
            <label>
              <input type="checkbox" checked={bought.has(norm(c.name))} onChange={() => toggleBought(c.name)} />
              <span>
                {c.qty && c.qty > 1 ? `${c.qty}× ` : ''}
                {c.name}
                {swaps[c.name] && <small className="muted"> · using {swaps[c.name]} for now</small>}
              </span>
            </label>
            <span className="right">
              <small title={rateNote()}>{usd(cardOf(c)) || 'no price'}</small>
              <a href={shopUrl(c.name)} target="_blank" rel="noreferrer" aria-label={`Search ${c.name} on shop.com`}>
                shop ↗
              </a>
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );

  return (
    <section>
      <button className="link" onClick={onBack}>
        ← Commanders
      </button>
      <h1>{name}</h1>
      <div className="controls">
        {SHOW_AS_COMMANDER && <Seg label="View" value={kind} options={[['commander', 'As Commander'], ['average', 'Average Deck']]} onChange={(v) => setKind(v as typeof kind)} />}
        <Seg label="Bracket" value={bracket} options={BRACKETS} onChange={setBracket} />
        <Seg label="Budget" value={budget} options={BUDGETS} onChange={setBudget} />
      </div>
      {tags.length > 0 && (
        <div className="chips" aria-label="Tags">
          {tags.slice(0, 24).map((t) => (
            <button key={t.slug} aria-pressed={tag === t.slug} onClick={() => setTag(tag === t.slug ? '' : t.slug)}>
              {t.value} <small>{t.count.toLocaleString()}</small>
            </button>
          ))}
        </div>
      )}
      <p className="muted">
        <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
          Open on EDHREC ↗
        </a>
        {page?.numDecks ? ` · ${page.numDecks.toLocaleString()} decks` : ''}
        {kind === 'average' && missing.length > 0 && ' · hover or tap a greyed card to swap in one of yours'}
      </p>
      {error && <p className="error">{error}</p>}
      {!page && !error && <p className="muted">Loading EDHREC data…</p>}
      {page && (
        <>
          <div className="summary">
            <strong>{sum.pct}%</strong> owned · {sum.owned} of {sum.total} cards in this binder
            {sum.other > 0 && ` · ${sum.other} more in ${s.otherName}`}
            {cards.size > 0 && ` · missing cards ≈ ${money(missingCost)}`}
            {shopping && (
              <a className="shopjump" href="#shop">
                Shopping list ({toBuy.length}) ↓
              </a>
            )}
            {kind === 'average' && (
              <button onClick={saveDeck} disabled={!!saved}>
                {saved || 'Save as deck'}
              </button>
            )}
          </div>
          <div className={shopping ? 'deckgrid' : ''}>
            <div>
              {page.lists.map((l) => {
                const ls = summarize(l.cards.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={l.header} open>
                    <summary>
                      {l.header} <small className="muted">{ls.owned}/{ls.total} owned</small>
                    </summary>
                    <ul className="cards">
                      {l.cards.map((c) => {
                        const swappable = kind === 'average' && statusOf(c.name, s.mine) !== 'owned';
                        const repl = swaps[c.name];
                        const rc = repl ? recCard.get(norm(repl)) : undefined;
                        const open = swappable ? () => setMenuFor(c.name) : undefined;
                        return (
                          <CardLine
                            key={c.name}
                            name={repl ?? c.name}
                            img={imgOf(rc?.id ?? c.id)}
                            card={rc ? cardOf(rc) : repl ? undefined : cardOf(c)}
                            s={s}
                            marker={repl ? c.name : undefined}
                            onOpen={open}
                            onClose={swappable ? () => setMenuFor(null) : undefined}
                            right={
                              c.potential ? (
                                <span title={`${(c.decks ?? 0).toLocaleString()} of ${c.potential.toLocaleString()} decks · synergy ${pct(c.synergy ?? 0)}`}>
                                  {pct((c.decks ?? 0) / c.potential)} <small>{c.lift ? `${c.lift.toFixed(1)}x lift` : `syn ${pct(c.synergy ?? 0)}`}</small>
                                </span>
                              ) : c.qty && c.qty > 1 ? (
                                `×${c.qty}`
                              ) : undefined
                            }
                          >
                            {menuFor === c.name && (
                              <div className="submenu" role="menu" aria-label={`Replace ${c.name}`} onClick={(e) => e.stopPropagation()}>
                                <div className="subhead">
                                  {repl ? `Swapped for ${c.name}` : `Replace ${c.name} with one of yours`}
                                  <button className="icon" aria-label="Close" onClick={() => setMenuFor(null)}>
                                    ✕
                                  </button>
                                </div>
                                {repl && (
                                  <button role="menuitem" onClick={() => setSwap(c.name, null)}>
                                    Undo swap (back to {c.name})
                                  </button>
                                )}
                                {!repl &&
                                  suggest(c).map((sub) => {
                                    const sc = recCard.get(norm(sub.name));
                                    return (
                                      <button key={sub.name} role="menuitem" onClick={() => setSwap(c.name, sub.name)}>
                                        <Thumb src={(sc && cardOf(sc)?.img) ?? imgOf(sc?.id)} size={28} />
                                        <span>
                                          {sub.name}
                                          <small className="muted"> {sub.category}</small>
                                        </span>
                                      </button>
                                    );
                                  })}
                                {!repl && suggest(c).length === 0 && <p className="muted small">{recs ? 'No owned card fits this slot.' : 'Loading suggestions…'}</p>}
                              </div>
                            )}
                          </CardLine>
                        );
                      })}
                    </ul>
                  </details>
                );
              })}
            </div>
            {shopping}
          </div>
        </>
      )}
    </section>
  );
}

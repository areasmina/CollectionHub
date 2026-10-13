import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { importDeck, type ImportResult } from '../lib/actions';
import { BASICS, statusOf, summarize } from '../lib/compare';
import { changeQty, removeFromDeck, removeOneFromBinder, setFoil } from '../lib/deckedit';
import { db, type Card, type Cheap, type Deck, type DeckCard } from '../lib/db';
import { analysis, bracketOf, deckStats, GROUPS, groupOf, isLand, type BracketCall, type DeckStats } from '../lib/deckstats';
import { deckCsv, deckText, download } from '../lib/export';
import { norm, slug } from '../lib/names';
import { cad, fetchedNote, shopUrl } from '../lib/prices';
import { guessCommander } from '../lib/commander';
import { shows, sortBy, SHOWS, SORTS, type Show, type SortKey } from '../lib/arrange';
import { cheapest, gameChangers, resolveRows, withCheapest } from '../lib/scryfall';
import { ImportReport } from './Collection';
import { shortfalls } from '../lib/copies';
import { CardLine, CardTile, HeroStats, priced as atFinish, priceSum, Progress, scryfallUrl, ShortAlert, Pick, useStored, type Shared } from './shared';
import { Doodles, PageDecor, Pips, Ransom, RiseBars, Tape, Title, Xgrain } from './zine';

/** A deck's own note and tags (saved on this device, synced on Push). */
function DeckNotes({ deck }: { deck: Deck }) {
  const [tag, setTag] = useState('');
  const tags = deck.tags ?? [];
  const addTag = () => {
    const t = tag.trim().toLowerCase().slice(0, 30);
    if (t && !tags.includes(t)) db.decks.update(deck.id!, { tags: [...tags, t] });
    setTag('');
  };
  return (
    <section className="decknotes gbox" aria-label="Deck note and tags">
      <Tape style={{ top: -10, left: 24, width: 70, height: 22, transform: 'rotate(-5deg)' }} />
      <label className="notebook">
        <span>note</span>
        <textarea className="ruled" rows={3} placeholder="game plan, who it's for, what to swap next_" defaultValue={deck.note ?? ''} key={deck.id} onBlur={(e) => e.target.value !== (deck.note ?? '') && db.decks.update(deck.id!, { note: e.target.value })} />
      </label>
      <div className="tagrow">
        {tags.map((t) => (
          <button key={t} className="dtag" aria-label={`Remove tag ${t}`} onClick={() => db.decks.update(deck.id!, { tags: tags.filter((x) => x !== t) })}>
            #{t} <span aria-hidden="true">×</span>
          </button>
        ))}
        <input aria-label="New tag" placeholder="+ tag_" value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addTag()} onBlur={addTag} />
      </div>
    </section>
  );
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
type Grouping = 'type' | 'mv' | 'own' | 'none';
const GROUPINGS: [Grouping, string][] = [
  ['type', 'CARD TYPE'],
  ['mv', 'MANA VALUE'],
  ['own', 'OWNED / MISSING'],
  ['none', 'NO GROUPS'],
];

/** Bracket estimate stamp; tap shows the reasons. */
function BracketStat({ call }: { call: BracketCall }) {
  return (
    <details className="scrap bracket">
      <summary aria-label={`Estimated bracket ${call.bracket}. Show why`}>
        <span className="k">BRACKET</span>
        <span className="bstamp">{ROMAN[call.bracket]}</span>
        <span className="caret" aria-hidden="true">
          ▾
        </span>
      </summary>
      <ul className="popnote">
        {call.reasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
        {call.gameChangers.length > 0 && (
          <li>
            Game Changers: <b>{call.gameChangers.join(', ')}</b>
          </li>
        )}
        <li className="small">An estimate from the official bracket rules we can check. Two-card combos aren't checked; bracket I vs II and V depend on how the deck is meant to play.</li>
      </ul>
    </details>
  );
}

/** A deck saved without a commander: suggest the likely one (one tap sets it); the card menu can set any card. */
function PickCommander({ deck, cardOf }: { deck: Deck; cardOf: (name: string) => Card | undefined }) {
  const guess = guessCommander(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })));
  return (
    <aside className="shortalert pickcmdr" role="status">
      <b>⚠ NO COMMANDER</b>{' '}
      {guess ? (
        <>
          This deck has no commander yet. It looks like <mark>{guess}</mark>.{' '}
          <button className="btn" onClick={() => setCommander(deck, guess)}>
            SET AS COMMANDER
          </button>
        </>
      ) : (
        'This deck has no commander yet. Right-click (or long-press) a card and choose Set as commander.'
      )}
    </aside>
  );
}

/** Make a deck card the commander (the previous one stays in the deck as a normal card). */
export const setCommander = (deck: Deck, name: string) => db.decks.update(deck.id!, { commander: name, updated: Date.now() });

/** Card menu (right-click / press and hold): commander, links, foil, copies, remove from deck or binder. */
function CardMenu({ deck, s, at, owned, onClose, onToast }: { deck: Deck; s: Shared; at: { card: DeckCard; x: number; y: number }; owned: number; onClose: () => void; onToast: (t: { text: string; undo?: () => unknown }) => void }) {
  const c = deck.cards.find((x) => x.name === at.card.name) ?? at.card; // live: + / − update the count
  const ref = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  // Keep the note on screen: open left / up when the click is near the right / bottom edge.
  const [pos, setPos] = useState({ left: at.x, top: at.y });
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect();
    setPos({ left: Math.max(8, Math.min(at.x, innerWidth - r.width - 8)), top: Math.max(8, Math.min(at.y, innerHeight - r.height - 8)) });
  }, [at.x, at.y]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', key);
    addEventListener('scroll', onClose, { passive: true });
    return () => (removeEventListener('keydown', key), removeEventListener('scroll', onClose));
  }, []);
  const isCmdr = c.name === deck.commander;
  const many = c.qty > 1 || BASICS.has(norm(c.name));
  const act = (f: () => unknown) => () => (f(), onClose());
  const link = (href: string, text: string) => (
    <li>
      <a href={href} target="_blank" rel="noreferrer" onClick={onClose}>
        {text} ↗
      </a>
    </li>
  );
  return (
    <>
      <div className="backdrop menuback" onClick={onClose} onContextMenu={(e) => (e.preventDefault(), onClose())} />
      <div ref={ref} className="cardmenu" role="menu" aria-label={`${c.name} options`} style={pos}>
        <Tape style={{ top: -11, left: '42%', width: 70, height: 22, transform: 'rotate(4deg)' }} />
        <div className="mh">{c.name}</div>
        <ul>
          {!isCmdr && (
            <li>
              <button onClick={act(() => setCommander(deck, c.name))}>{deck.commander ? `★ Swap commander (replaces ${deck.commander.split(' // ')[0]})` : '★ Set as commander'}</button>
            </li>
          )}
          <li>
            <button
              onClick={() =>
                navigator.clipboard
                  ?.writeText(c.name)
                  .then(() => setCopied(true))
                  .then(() => setTimeout(onClose, 600))
              }
            >
              {copied ? 'Copied ✓' : 'Copy card name'}
            </button>
          </li>
          {link(shopUrl(c.name), 'Open in shop')}
          {link(`https://edhrec.com/${isCmdr ? 'commanders' : 'cards'}/${slug(c.name.split(' // ')[0])}`, 'Open on EDHREC')}
          {link(scryfallUrl(c.name), 'Open on Scryfall')}
          <li className="sep" />
          <li>
            <button onClick={act(() => setFoil(deck, s.profile, c.name, !c.foil))}>
              {c.foil ? 'Switch to non-foil' : '✦ Switch to foil'}
              <small>{owned ? ' · your binder copy too' : ' · deck only (not owned)'}</small>
            </button>
          </li>
          {many && (
            <li className="qtyrow">
              <span>Copies: {c.qty}</span>
              <button aria-label="One copy fewer" onClick={() => changeQty(deck, c.name, -1)}>
                −
              </button>
              <button aria-label="One copy more" onClick={() => changeQty(deck, c.name, 1)}>
                +
              </button>
            </li>
          )}
          <li className="sep" />
          <li>
            <button className="danger" onClick={act(async () => onToast({ text: `Removed ${c.name} from the deck`, undo: await removeFromDeck(deck, c.name) }))}>
              Remove from deck
            </button>
          </li>
          {owned > 0 && !BASICS.has(norm(c.name)) && (
            <li>
              <button
                className="danger"
                onClick={act(async () => {
                  if (!confirm(`Take one copy of ${c.name} out of ${s.binderName}? You own ${owned}.`)) return;
                  onToast({ text: `Removed one ${c.name} from ${s.binderName}`, undo: await removeOneFromBinder(s.profile, c.name, c.foil) });
                })}
              >
                Remove from binder <small>(you own {owned})</small>
              </button>
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

/** Mana curve: non-land cards by mana value (7 = 7+). */
function Curve({ curve }: { curve: number[] }) {
  const max = Math.max(1, ...curve);
  return (
    <div className="curve" role="img" aria-label={`Mana curve: ${curve.map((n, i) => `${n} at ${i === 7 ? '7 or more' : i}`).join(', ')}`}>
      {curve.map((n, i) => (
        <span key={i} className="col">
          <span className="n">{n || ''}</span>
          <span className="bar" style={{ height: `${(n / max) * 100}%` }} />
          <span className="mv">{i === 7 ? '7+' : i}</span>
        </span>
      ))}
    </div>
  );
}

const PIPC: Record<string, string> = { W: '#E9DDB5', U: '#3F6FC6', B: '#2A2A30', R: '#B5463A', G: '#2F7D4A', C: '#8A8A8A' };

/** Side panel: curve, types, colour pips, roles and a short read of the deck. */
function DeckPanel({ st, missingCost, pricesIn, sum, s }: { st: DeckStats; missingCost: number; pricesIn: boolean; sum: ReturnType<typeof summarize>; s: Shared }) {
  const pipTotal = Object.values(st.pips).reduce((a, b) => a + b, 0);
  return (
    <aside className="dpanel" aria-label="Deck analysis">
      <Tape style={{ top: -12, left: 30, width: 80, height: 22, transform: 'rotate(-4deg)' }} />
      <h2>ANALYSIS</h2>
      <div className="dsec">
        <h3>to complete</h3>
        <div className="plate" role="img" aria-label={`Missing cards cost about ${cad(missingCost)}`}>
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
        </div>
        <small className="fetched">
          {sum.missing + sum.other} missing{sum.other > 0 ? ` (${sum.other} in ${s.otherName})` : ''}
        </small>
      </div>
      <div className="dsec">
        <h3>
          mana curve <small>avg {st.avgMv.toFixed(2)}</small>
        </h3>
        <Curve curve={st.curve} />
      </div>
      <div className="dsec">
        <h3>types</h3>
        <ul className="dtypes">
          {GROUPS.filter((g) => st.groups.get(g)).map((g) => (
            <li key={g}>
              <span>{g}</span>
              <span className="dots" aria-hidden="true" />
              <b>{st.groups.get(g)}</b>
            </li>
          ))}
        </ul>
      </div>
      {pipTotal > 0 && (
        <div className="dsec">
          <h3>colour pips</h3>
          <div className="pipbar" role="img" aria-label={Object.entries(st.pips).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}>
            {Object.entries(st.pips)
              .filter(([, n]) => n)
              .map(([k, n]) => (
                <span key={k} style={{ flex: n, background: PIPC[k], color: k === 'W' ? '#1a1a1a' : '#fff' }}>
                  {k} {n}
                </span>
              ))}
          </div>
        </div>
      )}
      <div className="dsec">
        <h3>the read</h3>
        <ul className="dread">
          {analysis(st).map((a) => (
            <li key={a.text} className={a.tone}>
              {a.text}
            </li>
          ))}
        </ul>
        <small className="fetched">Roles are counted from rules text, so treat them as a rough guide.{st.unknown ? ` ${st.unknown} cards still loading.` : ''}</small>
      </div>
    </aside>
  );
}

function DeckView({ deck, s, onBack, short }: { deck: Deck; s: Shared; onBack: () => void; short: ReturnType<typeof shortfalls> }) {
  const sum = summarize(deck.cards.map((c) => c.name), s.mine, s.other);
  const byKey =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(deck.cards.map((c) => norm(c.name))).sortBy('key')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, c])), [deck]) ??
    new Map<string, Card>();
  const cheap = useLiveQuery(async () => new Map((await db.cheap.bulkGet(deck.cards.map((c) => norm(c.name)))).filter(Boolean).map((c) => [c!.key, c!])), [deck]) ?? new Map<string, Cheap>();
  const cardOf = (name: string) => withCheapest(byKey.get(norm(name)), cheap);
  const [gc, setGc] = useState<Set<string> | null | undefined>(undefined);
  // Decks saved from EDHREC hold names only: look up any card not cached yet (images), then cheapest prices.
  useEffect(() => {
    resolveRows(deck.cards.map((c) => ({ name: c.name, qty: c.qty })), () => {})
      .then(() => cheapest(deck.cards.map((c) => c.name)))
      .catch(() => {});
    gameChangers().then(setGc);
  }, [deck.id]);
  const [view, setView] = useStored<'grid' | 'list'>('ch:view', 'grid', ['grid', 'list']);
  const [grouping, setGrouping] = useStored<Grouping>('ch:dgroup', 'type', GROUPINGS.map(([v]) => v));
  const [sort, setSort] = useStored<SortKey>('ch:dsort', 'mv', SORTS.map(([v]) => v));
  const [show, setShow] = useStored<Show>('ch:dshow', 'all', SHOWS.map(([v]) => v));
  // Foil deck cards are priced at the foil price of the printing on file.
  const cardFor = (c: DeckCard) => (c.foil ? atFinish(cardOf(c.name), true) : cardOf(c.name));
  const missingCost = priceSum(deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ card: cardFor(c), qty: c.qty })));
  const deckCost = priceSum(deck.cards.map((c) => ({ card: cardFor(c), qty: c.qty })));
  const [menu, setMenu] = useState<{ card: DeckCard; x: number; y: number } | null>(null);
  const [toast, setToast] = useState<{ text: string; undo?: () => unknown } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const pricesIn = byKey.size > 0;
  const file = (ext: string) => `${deck.name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const st = deckStats(deck.cards, cardOf, deck.commander);
  const call = bracketOf(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc ?? null);
  const cmdr = deck.commander ? byKey.get(norm(deck.commander)) : undefined;
  const ci = cmdr?.ci ?? [...new Set(deck.cards.flatMap((c) => byKey.get(norm(c.name))?.ci ?? []))];

  // Moxfield-style sections: by card type or mana value (commander first), by ownership, or one list.
  const owned = (n: string) => statusOf(n, s.mine) === 'owned';
  const keyOf = (c: DeckCard) => {
    const card = cardOf(c.name);
    if (grouping === 'none') return 'All cards';
    if (grouping === 'own') {
      const st = statusOf(c.name, s.mine, s.other);
      return st === 'owned' ? 'Owned' : st === 'other' ? `In ${s.otherName}` : 'Missing';
    }
    if (c.name === deck.commander) return 'Commander';
    if (grouping === 'type') return groupOf(card?.type);
    if (!card) return 'Other';
    if (isLand(card.type)) return 'Lands';
    const mv = Math.round(card.cmc ?? 0);
    return mv >= 7 ? 'Mana value 7+' : `Mana value ${mv}`;
  };
  const order =
    grouping === 'type'
      ? [...GROUPS]
      : grouping === 'mv'
        ? ['Commander', ...Array.from({ length: 7 }, (_, i) => `Mana value ${i}`), 'Mana value 7+', 'Lands', 'Other']
        : grouping === 'own'
          ? ['Owned', `In ${s.otherName}`, 'Missing']
          : ['All cards'];
  const sections = new Map<string, DeckCard[]>(order.map((k) => [k, []]));
  const shown = deck.cards.filter((c) => shows(show, owned(c.name)));
  const sorted = sortBy(shown, sort, (c) => {
    const card = cardOf(c.name);
    return { name: c.name, usd: card?.usd ? Number(card.usd) : undefined, mv: card ? (isLand(card.type) ? 99 : card.cmc) : undefined, owned: owned(c.name) };
  });
  for (const c of sorted) sections.get(keyOf(c))?.push(c);
  const Item = view === 'grid' ? CardTile : CardLine;

  return (
    <>
      <PageDecor seed={902} rays="80% 14%" sheet={{ side: 'left', top: 700, rot: 8 }} />
      <main>
        <button className="backlink" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <path d="M11 2 L4 8 L11 14" fill="none" stroke="#E60012" strokeWidth="3" />
          </svg>
          DECKS
        </button>

        <section className={`chero dhero${cmdr?.img ? '' : ' noimg'}`}>
          <span className="worn" aria-hidden="true" />
          {cmdr?.img && (
            <div className="cimg gbox">
              <span className="xart cmdrimg">
                <Tape style={{ top: -12, left: '50%', width: 90, height: 24, transform: 'translateX(-50%) rotate(-3deg)' }} />
                <a href={scryfallUrl(cmdr.name)} target="_blank" rel="noreferrer" title="Open on Scryfall">
                  <img src={cmdr.img.replace('/small/', '/normal/')} alt={`${cmdr.name}: open on Scryfall`} />
                </a>
                <Xgrain />
              </span>
            </div>
          )}
          <div className="cright">
            <div className="ctitle">
              <div className="banner ht" aria-hidden="true" />
              <h1 aria-label={deck.name}>
                <Ransom text={deck.name.toUpperCase().slice(0, 48)} size={deck.name.length > 28 ? 38 : 50} seed={33} />
              </h1>
              <div className="namerow">
                <Pips ci={ci} size={30} />
                <HeroStats price={pricesIn ? deckCost : undefined} fetched={fetchedNote(deck.cards.map((c) => cardOf(c.name)?.priceAt ?? cardOf(c.name)?.at))} names={deck.cards.map((c) => c.name)}>
                  <BracketStat call={call} />
                </HeroStats>
              </div>
            </div>
            <div className="cmeta">
              <span className="typed">
                {[deck.commander ? `COMMANDER: ${deck.commander.split(' // ')[0].toUpperCase()}` : '', `${st.total} CARDS`, `${st.lands} LANDS`, st.avgMv ? `AVG MV ${st.avgMv.toFixed(2)}` : ''].filter(Boolean).join(' · ')}
              </span>
              <span className="score">
                <span className="mono">
                  YOU OWN {sum.owned} OF {sum.total}
                  <br />
                  IN {s.binderName.toUpperCase()}
                </span>
                <span className="pct">
                  <span className="bigpct">{sum.pct}%</span>
                  <RiseBars pct={sum.pct} />
                </span>
              </span>
            </div>
          </div>
          {sum.pct === 100 && <span className="stamp">READY TO SLEEVE!</span>}
        </section>

        {!deck.commander && <PickCommander deck={deck} cardOf={cardOf} />}
        <ShortAlert items={short.filter((x) => x.decks.includes(deck.name))} />

        <div className="dtools" role="toolbar" aria-label="Deck view">
          <div className="viewsw" role="group" aria-label="Card view">
            <button aria-pressed={view === 'grid'} onClick={() => setView('grid')}>
              GRID
            </button>
            <button aria-pressed={view === 'list'} onClick={() => setView('list')}>
              LIST
            </button>
          </div>
          <Pick label="GROUP" value={grouping} options={GROUPINGS} onChange={setGrouping} />
          <Pick label="SORT" value={sort} options={SORTS} onChange={setSort} />
          <Pick label="SHOW" value={show} options={SHOWS} onChange={setShow} />
          <span className="grow" />
          <button className="sticker" onClick={() => download(file('txt'), deckText(deck))}>
            EXPORT TEXT
          </button>
          <button className="sticker" onClick={() => download(file('csv'), deckCsv(deck), 'text/csv')}>
            CSV
          </button>
          <button
            className="stencil"
            onClick={async () => {
              if (confirm(`Delete deck "${deck.name}"?`)) {
                await db.decks.delete(deck.id!);
                onBack();
              }
            }}
          >
            DELETE
          </button>
        </div>

        <div className="deckgrid after-sw">
          <div className="lists">
            {[...sections]
              .filter(([, cs]) => cs.length)
              .map(([h, cs]) => {
                const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={h} className="cat" open>
                    <summary>
                      <span className="pm" aria-hidden="true" />
                      <span className="h">
                        {h} ({cs.reduce((n, c) => n + c.qty, 0)})
                      </span>
                      <span className="dots" aria-hidden="true" />
                      <span className="n">
                        {ls.owned}/{ls.total} owned
                      </span>
                    </summary>
                    <ul className={view === 'grid' ? 'zgrid' : 'zlist'}>
                      {cs.map((c) => (
                        <Item
                          key={c.name}
                          name={c.name}
                          card={cardFor(c)}
                          s={s}
                          note={[c.foil ? '✦ FOIL' : '', c.qty > 1 ? `×${c.qty}` : '', call.gameChangers.includes(c.name) ? 'Game Changer' : ''].filter(Boolean).join(' · ')}
                          onMenu={(x, y) => setMenu({ card: c, x, y })}
                          foil={c.foil}
                        />
                      ))}
                    </ul>
                  </details>
                );
              })}
          </div>
          <div className="dside">
            <DeckPanel st={st} missingCost={missingCost} pricesIn={pricesIn} sum={sum} s={s} />
            <DeckNotes deck={deck} />
          </div>
        </div>
        {menu && <CardMenu deck={deck} s={s} at={menu} owned={s.mine.get(norm(menu.card.name)) ?? 0} onClose={() => setMenu(null)} onToast={setToast} />}
        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button onClick={() => (toast.undo!(), setToast(null))}>
                UNDO
              </button>
            )}
          </div>
        )}
      </main>
    </>
  );
}

export function Decks(s: Shared) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const cmdrs =
    useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? '')).filter(Boolean)).toArray()).map((c) => [c.key, c])), [decks]) ?? new Map<string, Card>();
  // Deck prices from cards already cached here (a deck opened once has them all).
  const allNames = decks.flatMap((d) => d.cards.map((c) => norm(c.name)));
  const priced =
    useLiveQuery(async () => {
      const [cs, ch] = await Promise.all([db.cards.where('key').anyOf(allNames).toArray(), db.cheap.bulkGet(allNames)]);
      const cheap = new Map(ch.filter(Boolean).map((c) => [c!.key, c!]));
      // Same printing choice as the deck page (newest fetched wins).
      return new Map(cs.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, withCheapest(c, cheap)!]));
    }, [decks]) ?? new Map<string, Card>();
  const [open, setOpen] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const short = shortfalls(decks, s.mine);
  const deck = decks.find((d) => d.id === open);
  if (deck) return <DeckView deck={deck} s={s} short={short} onBack={() => setOpen(null)} />;

  async function add() {
    setError('');
    setBusy({ done: 0, total: 0 });
    try {
      const r = await importDeck(s.profile, name.trim(), text, (done, total) => setBusy({ done, total }));
      setResult({ format: 'text', added: r.deck.cards.reduce((n, c) => n + c.qty, 0), unmatched: r.unmatched, errors: r.errors });
      setName('');
      setText('');
    } catch (e) {
      setError(`Import failed: ${(e as Error).message}`);
    }
    setBusy(null);
  }

  return (
    <>
      <PageDecor seed={902} rays="80% 14%" sheet={{ side: 'left', top: 700, rot: 8 }} />
      <main>
        <section style={{ display: 'inline-block', marginTop: 24 }}>
          <Title text="DECKS" label="Decks" size={72} seed={33} />
        </section>
        <p className="count" style={{ color: 'var(--text)' }}>
          {decks.length} {decks.length === 1 ? 'deck' : 'decks'} in {s.binderName}
          <span className="cur">_</span>
        </p>
        <ShortAlert items={short} />
        <ul className="dgrid">
          {decks.map((d, i) => {
            const sum = summarize(d.cards.map((c) => c.name), s.mine, s.other);
            // No commander set: show the deck's most expensive card instead of a blank tile.
            const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
            const c = lead ?? d.cards.map((x) => priced.get(norm(x.name))).reduce<Card | undefined>((best, x) => (x?.img && Number(x.usd ?? 0) > Number(best?.usd ?? -1) ? x : best), undefined);
            const art = d.commander ?? c?.name ?? '';
            return (
              <li key={d.id}>
                <button className="dcard gbox" onClick={() => setOpen(d.id!)}>
                  {i === 0 && <Doodles n={433} count={2} spots={[[64, 50], [70, -8]]} paper />}
                  <span className="rule" aria-hidden="true" />
                  <span className="ytape" aria-hidden="true" />
                  <span className={statusOf(art, s.mine) === 'owned' ? 'xart owned' : 'xart'} aria-hidden="true">
                    {c?.img && <img src={c.img.replace('/small/', '/normal/')} alt="" loading="lazy" />}
                    {statusOf(art, s.mine) !== 'owned' && <Xgrain />}
                  </span>
                  <span className="t">
                    <b>{d.name}</b>
                    <span>
                      {d.cards.reduce((n, x) => n + x.qty, 0)} cards · {sum.pct}% owned
                    </span>
                    {priced.size > 0 && <span className={`price tapey y${i % 5} t${(i * 3) % 4}`}>≈{cad(priceSum(d.cards.map((x) => ({ card: x.foil ? atFinish(priced.get(norm(x.name)), true) : priced.get(norm(x.name)), qty: x.qty }))))}</span>}
                    {d.tags?.length ? <span className="dtags">{d.tags.map((t) => `#${t}`).join(' ')}</span> : null}
                    {lead && <Pips ci={lead.ci} size={24} />}
                    {!d.commander && <span className="nocmdr">no commander set: open the deck to pick one</span>}
                  </span>
                  {sum.pct === 100 && <span className="stamp">READY TO SLEEVE!</span>}
                </button>
              </li>
            );
          })}
          <li className="dempty">
            your next deck goes here.
            <br />
            save one from a commander page
            <br />
            or paste a list below ↓
          </li>
        </ul>

        <section className="addpage graph gbox">
          <Doodles n={477} count={2} spots={[[70, 4], [78, 60]]} paper />
          <span className="holes" aria-hidden="true" />
          <Tape style={{ top: -10, right: 50, width: 100, height: 24, transform: 'rotate(6deg)' }} />
          <div className="hd">
            <div className="stripe" aria-hidden="true" />
            <h2>ADD A DECK</h2>
          </div>
          <label>
            deck name
            <input placeholder="e.g. Atraxa superfriends_" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="btn ink file">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M3 12 V15 H15 V12 M9 3 V11 M5 7 L9 3 L13 7" fill="none" stroke="currentColor" strokeWidth="2" />
            </svg>
            CHOOSE A FILE
            <input
              type="file"
              accept=".txt,.csv,text/plain,text/csv"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                setText(await f.text());
                if (!name) setName(f.name.replace(/\.\w+$/, ''));
              }}
            />
          </label>
          <label>
            …or paste the list
            <textarea className="graph" rows={7} placeholder={"Commander\n1 Atraxa, Praetors' Voice\n\nDeck\n1 Sol Ring_"} value={text} onChange={(e) => setText(e.target.value)} />
          </label>
          <button className="btn save" disabled={!name.trim() || !text.trim() || !!busy} onClick={add}>
            SAVE DECK
          </button>
          {busy && <Progress {...busy} />}
          {error && <p className="error">{error}</p>}
          {result && <ImportReport r={result} />}
        </section>
      </main>
    </>
  );
}

import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { importDeck, type ImportResult } from '../lib/actions';
import { BASICS, statusOf, summarize } from '../lib/compare';
import { replaceInDeck, savePin, setCommander } from '../lib/deckedit';
import { noPins, pinOf } from '../lib/pins';
import { rankSubs, recInfoOf, type SubCard } from '../lib/subs';
import { pagePath, showPage, type EdhPage } from '../lib/edhrec';
import { SwapNote, type SwapOption } from './SwapNote';
import { CardMenu } from './CardMenu';
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
import { freeDeckName, onOpenDeck, takeDeck } from '../lib/nav';
import { CardLine, CardTile, HeroStats, priced as atFinish, priceSum, Progress, scryfallUrl, ShortAlert, Pick, DeckLight, useBinder, useStored, useMenuPress, type Shared } from './shared';
import { Doodles, PageDecor, Pips, Ransom, RiseBars, Tape, Title, Xgrain, GridIcon, ListIcon } from './zine';

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
      {/* straddles the paper's top edge (the section's 16px padding puts the paper's edge at y = 16) */}
      <Tape style={{ top: 5, left: 22, width: 64, height: 22, transform: 'rotate(-5deg)' }} />
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

/** GROUP box: how sections are split, plus a "show only" filter in the same picker (one less box). */
function GroupPick({ grouping, show, onGroup, onShow }: { grouping: Grouping; show: Show; onGroup: (g: Grouping) => void; onShow: (v: Show) => void }) {
  const tag = show === 'owned' ? ' · OWNED' : show === 'missing' ? ' · MISSING' : '';
  return (
    <label className="sbox pick">
      <span className="tab">GROUP</span>
      <select
        value={grouping}
        aria-label={`Group by, and which cards to show${tag ? `: ${show} only` : ''}`}
        onChange={(e) => {
          haptic('select');
          const v = e.target.value;
          if (v.startsWith('show:')) onShow(v.slice(5) as Show);
          else onGroup(v as Grouping);
        }}
      >
        <optgroup label="Group by">
          {GROUPINGS.map(([v, t]) => (
            <option key={v} value={v}>
              {t}
              {tag}
            </option>
          ))}
        </optgroup>
        <optgroup label="Show">
          {SHOWS.map(([v, t]) => (
            <option key={v} value={`show:${v}`}>
              {show === v ? '✓ ' : '\u2003'}
              {t}
            </option>
          ))}
        </optgroup>
      </select>
      <span className="arrow" aria-hidden="true">
        <span>▼</span>
      </span>
    </label>
  );
}

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
          <button className="btn" onClick={() => (haptic('success'), setCommander(deck, guess))}>
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

/** Card menu (right-click / press and hold): commander, links, foil, copies, remove from deck or binder. */
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

/** Side panel: curve, types, colour pips, roles, a short read of the deck, then what the missing cards cost. */
function DeckPanel({ deck, st, missingCost, pricesIn, sum, s }: { deck: Deck; st: DeckStats; missingCost: number; pricesIn: boolean; sum: ReturnType<typeof summarize>; s: Shared }) {
  const pipTotal = Object.values(st.pips).reduce((a, b) => a + b, 0);
  // Phones / tablets (analysis sits above the cards): folds to one line, remembered. Desktop: always open.
  const [fold, setFold] = useStored<'open' | 'closed'>('ch:analysis', 'closed', ['open', 'closed']);
  const low = analysis(st).filter((a) => a.tone !== 'ok').length;
  return (
    <aside className={`dpanel ${fold}`} aria-label="Deck analysis">
      <Tape style={{ top: -12, left: 30, width: 80, height: 22, transform: 'rotate(-4deg)' }} />
      <h2>
        <button className="dfold" aria-expanded={fold === 'open'} onClick={() => (haptic('open'), setFold(fold === 'open' ? 'closed' : 'open'))}>
          ANALYSIS
          <span className="dsum">
            avg {st.avgMv.toFixed(2)} · {low ? `${low} to look at` : 'looks solid'}
            {pricesIn && sum.missing + sum.other > 0 ? ` · ${cad(missingCost)} to complete` : ''}
          </span>
          <span className="pm" aria-hidden="true" />
        </button>
      </h2>
      <div className="dbody">
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
      <div className="dsec dnotes">
        <h3>note &amp; tags</h3>
        <DeckNotes deck={deck} />
      </div>
      </div>
    </aside>
  );
}


/** Everything you do to the deck itself (not how its cards are shown), tucked behind one button. */
/** A deck in the Decks list: tap opens it; right-click or press and hold opens the deck menu. */
function DeckTile({ onClick, onMenu, label, children }: { onClick: () => void; onMenu: (x: number, y: number) => void; label: string; children: ReactNode }) {
  const press = useMenuPress(onMenu);
  return (
    <button className="dcard gbox hasmenu" onClick={onClick} {...press} aria-label={`${label}: open (right-click or hold for options)`}>
      {children}
    </button>
  );
}

type MenuAt = { x: number; y: number; anchor?: DOMRect }; // a point (right-click / hold) or under the DECK box


function DeckMenu({ deck, at, onClose, onDeleted, onOpen }: { deck: Deck; at: MenuAt; onClose: () => void; onDeleted?: () => void; onOpen: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const file = (ext: string) => `${deck.name.replace(/[^\w-]+/g, '_')}.${ext}`;
  const [copied, setCopied] = useState(false);
  // Phones: the system share sheet (WhatsApp, Messages…). Elsewhere: the decklist goes to the clipboard.
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
  // Keep it on screen: under (or above) the DECK box, else at the pressed spot.
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
      {(
        <>
          <div className="backdrop menuback" onClick={close} onContextMenu={(e) => (e.preventDefault(), close())} />
          <div ref={ref} className="cardmenu deckmenu" role="menu" aria-label={`${deck.name} options`} style={pos}>
            <Tape style={{ top: -11, left: '42%', width: 70, height: 22, transform: 'rotate(4deg)' }} />
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
                  ✎ Rename
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
                  ⧉ Duplicate <small>a copy you can change freely</small>
                </button>
              </li>
              <li>
                <button role="menuitem" onClick={share}>
                  {copied ? '✓ Copied' : canShare ? '⇪ Share' : '⎘ Copy decklist'} <small>{copied ? 'paste it anywhere' : canShare ? 'send the decklist to a friend' : 'paste into a chat, Moxfield…'}</small>
                </button>
              </li>
              <li className="sep" role="separator" />
              <li>
                <button role="menuitem" onClick={act(() => download(file('txt'), deckText(deck)))}>
                  ↓ Export as text <small>paste into Moxfield, Archidekt…</small>
                </button>
              </li>
              <li>
                <button role="menuitem" onClick={act(() => download(file('csv'), deckCsv(deck), 'text/csv'))}>
                  ↓ Export as CSV <small>for spreadsheets</small>
                </button>
              </li>
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
                  ✕ Delete deck
                </button>
              </li>
            </ul>
          </div>
        </>
      )}
    </>
  );
}

function DeckView({ deck, s, onBack, onOpen, short }: { deck: Deck; s: Shared; onBack: () => void; onOpen: (id: number) => void; short: ReturnType<typeof shortfalls> }) {
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
  const [deckMenu, setDeckMenu] = useState<MenuAt | null>(null);
  const heroPress = useMenuPress((x, y) => setDeckMenu({ x, y }));
  const [toast, setToast] = useState<{ text: string; undo?: () => unknown } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const pricesIn = byKey.size > 0;
  const st = deckStats(deck.cards, cardOf, deck.commander);
  const call = bracketOf(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc ?? null);
  const cmdr = deck.commander ? byKey.get(norm(deck.commander)) : undefined;
  const ci = cmdr?.ci ?? [...new Set(deck.cards.flatMap((c) => byKey.get(norm(c.name))?.ci ?? []))];

  // The Forge: tap any card for the swap window (top 3 of your cards EDHREC plays with this commander, a search over
  // your binder in the deck's colours, pins). A swap changes this deck at once, with an undo.
  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null);
  useEffect(() => {
    let live = true;
    setRecs(null);
    if (deck.commander) showPage(pagePath('commander', slug(deck.commander)), (p) => live && setRecs(p)).catch(() => {});
    return () => void (live = false);
  }, [deck.commander]);
  const binder = useBinder(s.profile);
  const binderCard = new Map(binder.map((c) => [c.key, c]));
  const prof = useLiveQuery(() => db.profiles.get(s.profile), [s.profile]);
  const pins = (deck.commander && prof?.pins?.[deck.commander]) || noPins();
  const never = new Set(pins.out.map(norm));
  const inDeck = new Set(deck.cards.map((c) => norm(c.name)));
  const recInfo = recInfoOf(recs?.lists ?? [], norm, (c) => binderCard.get(norm(c.name)) ?? byKey.get(norm(c.name)));
  const candidates = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !inDeck.has(norm(c.name)) && !never.has(norm(c.name)));
  const slotInfo = (name: string): SubCard => {
    const card = cardOf(name);
    return { ...recInfo.get(norm(name)), name, type: card?.type, cmc: card?.cmc };
  };
  const optionOf = (sub: SubCard): SwapOption => {
    const img = binderCard.get(norm(sub.name))?.img;
    return { sub, img, big: img?.replace('/small/', '/normal/'), owned: s.mine.get(norm(sub.name)) ?? 0 };
  };
  const forgePool = () =>
    binder.filter((b) => b.ci.every((x) => ci.includes(x)) && !inDeck.has(b.key) && !never.has(b.key)).map((b) => optionOf({ ...recInfo.get(b.key), name: b.name, type: b.type, cmc: b.cmc }));
  async function swapIn(from: string, to: string) {
    haptic('success');
    setSwapFor(null);
    setToast({ text: `Swapped ${from} for ${to}`, undo: await replaceInDeck(deck, from, to) });
  }

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

        <section className={`chero dhero hasmenu${cmdr?.img ? '' : ' noimg'}`} {...heroPress} title="Right-click (or press and hold) for deck options">
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
              <DeckLight deck={deck} />
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

        {deckMenu && <DeckMenu deck={deck} at={deckMenu} onClose={() => setDeckMenu(null)} onDeleted={onBack} onOpen={onOpen} />}

        <div className="deckgrid after-sw">
          {swapFor && <div className="backdrop" onClick={() => setSwapFor(null)} />}
          <div className="lists">
            <p className="forgehint">
              <b>⚒ THE FORGE</b> tap any card to swap it from your binder · hold or right-click for more
            </p>
            {/* How the cards are split and ordered, right above them */}
            <div className="dtools" role="toolbar" aria-label="Deck view">
              <GroupPick grouping={grouping} show={show} onGroup={setGrouping} onShow={setShow} />
              <Pick label="SORT" value={sort} options={SORTS} onChange={setSort} />
            </div>
            {[...sections]
              .filter(([, cs]) => cs.length)
              .map(([h, cs], i) => {
                const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={h} className="cat" open>
                    <summary>
                      <span className="pm" aria-hidden="true" />
                      <span className="h">
                        {h} ({cs.reduce((n, c) => n + c.qty, 0)})
                      </span>
                      {pricesIn && (
                        <span className="gval" title="What this group's cards are worth (cheapest printings, foils at foil price)">
                          ≈{cad(priceSum(cs.map((c) => ({ card: cardFor(c), qty: c.qty }))))}
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
                      {cs.map((c) => (
                        <Item
                          key={c.name}
                          name={c.name}
                          card={cardFor(c)}
                          s={s}
                          note={[c.foil ? '✦ FOIL' : '', c.qty > 1 ? `×${c.qty}` : '', call.gameChangers.includes(c.name) ? 'Game Changer' : ''].filter(Boolean).join(' · ')}
                          onMenu={(x, y) => setMenu({ card: c, x, y })}
                          foil={c.foil}
                          quiet={owned(c.name)}
                          onOpen={c.name === deck.commander || BASICS.has(norm(c.name)) ? undefined : () => setSwapFor(c.name)}
                        >
                          {swapFor === c.name && (
                            <SwapNote
                              name={c.name}
                              missing={slotInfo(c.name)}
                              big={cardOf(c.name)?.img?.replace('/small/', '/normal/')}
                              options={rankSubs(slotInfo(c.name), candidates).map(optionOf)}
                              pool={forgePool()}
                              loading={!!deck.commander && !recs}
                              pin={pinOf(pins, c.name)}
                              canPinIn={owned(c.name)}
                              cmdr={(deck.commander ?? deck.name).split(' // ')[0]}
                              onPick={(to) => swapIn(c.name, to)}
                              onUndo={() => setSwapFor(null)}
                              onPin={deck.commander ? (side) => (savePin(s.profile, deck.commander!, c.name, side), setSwapFor(null)) : undefined}
                              onClose={() => setSwapFor(null)}
                            />
                          )}
                        </Item>
                      ))}
                    </ul>
                  </details>
                );
              })}
          </div>
          <div className="dside">
            <DeckPanel deck={deck} st={st} missingCost={missingCost} pricesIn={pricesIn} sum={sum} s={s} />
          </div>
        </div>
        {menu && (
          <CardMenu
            name={menu.card.name}
            at={menu}
            profile={s.profile}
            binderName={s.binderName}
            owned={s.mine.get(norm(menu.card.name)) ?? 0}
            deck={deck}
            onSwap={menu.card.name === deck.commander || BASICS.has(norm(menu.card.name)) ? undefined : () => setSwapFor(menu.card.name)}
            pin={deck.commander ? { side: pinOf(pins, menu.card.name), canIn: owned(menu.card.name), onPin: (side) => savePin(s.profile, deck.commander!, menu.card.name, side) } : undefined}
            onClose={() => setMenu(null)}
            onToast={setToast}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <span>{toast.text}</span>
            {toast.undo && (
              <button onClick={() => (haptic('undo'), toast.undo!(), setToast(null))}>
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
  const [listMenu, setListMenu] = useState<{ id: number; at: MenuAt } | null>(null);
  const menuDeck = listMenu && decks.find((d) => d.id === listMenu.id);
  // Opened from elsewhere (a deck name on another screen): wait for the decks to load, then open it.
  const [navTick, setNavTick] = useState(0);
  useEffect(() => onOpenDeck(() => setNavTick((n) => n + 1)), []);
  useEffect(() => {
    const name = takeDeck((n) => decks.some((d) => d.name === n));
    const d = name && decks.find((x) => x.name === name);
    if (d) (setOpen(d.id!), scrollTo(0, 0));
  }, [decks, navTick]);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  const short = shortfalls(decks, s.mine);
  const deck = decks.find((d) => d.id === open);
  if (deck) return <DeckView deck={deck} s={s} short={short} onBack={() => setOpen(null)} onOpen={setOpen} />;

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
          <Title text="MY DECKS" label="My decks" size={72} seed={33} />
        </section>
        <p className="count" style={{ color: 'var(--text)' }}>
          {decks.length} {decks.length === 1 ? 'deck' : 'decks'} in {s.binderName}
          <span className="cur">_</span>
        </p>
        <ShortAlert items={short} />
        {menuDeck && listMenu && <DeckMenu deck={menuDeck} at={listMenu.at} onClose={() => setListMenu(null)} onOpen={(id) => (setListMenu(null), setOpen(id))} />}
        <ul className="dgrid">
          {decks.map((d, i) => {
            const sum = summarize(d.cards.map((c) => c.name), s.mine, s.other);
            // No commander set: show the deck's most expensive card instead of a blank tile.
            const lead = d.commander ? cmdrs.get(norm(d.commander)) : undefined;
            const c = lead ?? d.cards.map((x) => priced.get(norm(x.name))).reduce<Card | undefined>((best, x) => (x?.img && Number(x.usd ?? 0) > Number(best?.usd ?? -1) ? x : best), undefined);
            const art = d.commander ?? c?.name ?? '';
            return (
              <li key={d.id} className={`dtile${d.inactive ? ' off' : ''}`}>
                <DeckLight deck={d} />
                <DeckTile onClick={() => setOpen(d.id!)} onMenu={(x, y) => setListMenu({ id: d.id!, at: { x, y } })} label={d.name}>
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
                </DeckTile>
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

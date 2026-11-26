import { useLiveQuery } from 'dexie-react-hooks';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { binderCandidates } from '../../brain/candidates';
import { inUseChip } from '../../brain/chips';
import { offIdentity } from '../../brain/identity';
import { pinCard, recordTaste } from '../../brain/store';
import { commanderThemes } from '../../brain/themes';
import { bracketFit, readiness } from '../../brain/validate';
import { AGGRESSION, killCheck } from '../../brain/win';
import { allocate } from '../../lib/allocation';
import { onlyOk, ONLYS, shows, sortBy, SHOWS, SORTS, type Only, type Show, type SortKey } from '../../lib/arrange';
import { commanderSlug, pairIdentity } from '../../lib/commander';
import { BASICS, statusOf, summarize } from '../../lib/compare';
import { notOffered } from '../../lib/collsearch';
import { takenBy, type shortfalls } from '../../lib/copies';
import { db, type Card, type Cheap, type Deck, type DeckCard } from '../../lib/db';
import { deckColour } from '../../lib/deckcolor';
import { addToDeck, removeFromDeck, replaceInDeck } from '../../lib/deckedit';
import { deckShareOf } from '../../lib/deckshare';
import { analysis, bracketOf, deckStats, GROUPS, groupOf, isLand, refShapeOf, type RefShape } from '../../lib/deckstats';
import { BRACKETS, fetchFiltered, pagePath, showPage, type CardFilter, type EdhPage } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { norm, slug } from '../../lib/names';
import { setBack } from '../../lib/nav';
import { addCounts, calculateDeckOwnership } from '../../lib/ownership';
import { noPins, pinOf, PIN_FILTER_MIN_DECKS, withPins } from '../../lib/pins';
import { cad, fetchedNote, PRICE_METHOD, toCad } from '../../lib/prices';
import { cardsByIds, cheapest, gameChangers, resolveRows, withCheapest } from '../../lib/scryfall';
import { searchByText } from '../../lib/search';
import { rankSubs, recInfoOf, type SubCard } from '../../lib/subs';
import { CardMenu } from '../../views/CardMenu';
import { BuyList, ForgeCube, ForgeMeters, ForgeSuggest, ForgeTop, useDeckDrop, useForgeMode } from '../../views/Forge';
import { JumpRail, jumpId } from '../../views/JumpRail';
import { Meter } from '../../views/parts';
import {
  CardLine,
  CardTile,
  ChipPick,
  CmdrCard,
  CycleBtn,
  DeckLight,
  OutsideLinks,
  priced as atFinish,
  priceSum,
  SaltStat,
  SetChips,
  ShortAlert,
  ToolBar,
  useBinder,
  useMenuPress,
  useStored,
  VIEW_KEY,
  type Shared,
} from '../../views/shared';
import { SwapNote, type SwapOption } from '../../views/SwapNote';
import { ReadyTiles } from '../../views/Verdict';
import { CompactIcon, GridIcon, heroRoom, ListIcon, Pips, Ransom } from '../../views/zine';
import { DeckMenu, type MenuAt } from './DeckMenu';
import { BracketStat, GROUPINGS, GroupPick, PickCommander, type Grouping } from './DeckMetaParts';
import { DeckPanel } from './DeckPanel';
import { HistoryDrawer } from './HistoryDrawer';

const HandSheet = lazy(() => import('../hand/HandSheet').then((m) => ({ default: m.HandSheet })));
const RuleZeroModal = lazy(() => import('../rulezero/RuleZeroModal').then((m) => ({ default: m.RuleZeroModal })));
const BalanceSheet = lazy(() => import('../balance/BalanceSheet').then((m) => ({ default: m.BalanceSheet })));

export function DeckView({
  deck,
  s,
  onBack,
  onOpen,
  short,
}: {
  deck: Deck;
  s: Shared;
  onBack: () => void;
  onOpen: (id: number) => void;
  short: ReturnType<typeof shortfalls>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const siblings = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [deck];
  const sum = { ...summarize(deck.cards.map((c) => c.name), s.mine, s.other), ...deckShareOf(siblings, deck.id, s.mine) };
  const takenOthers = takenBy(siblings.filter((d) => d.id !== deck.id), s.mine);
  const ownDetails = calculateDeckOwnership(deck.cards, s.mine, addCounts(s.mine, s.other));
  useEffect(() => {
    setBack(onBack);
    return () => void setBack(null);
  }, [deck.id]);
  const cardsRaw = useLiveQuery(
    async () => new Map((await db.cards.where('key').anyOf(deck.cards.map((c) => norm(c.name))).sortBy('key')).sort((a, b) => (a.at ?? 0) - (b.at ?? 0)).map((c) => [c.key, c])),
    [deck],
  );
  const byKey = cardsRaw ?? new Map<string, Card>();
  const cheap = useLiveQuery(async () => new Map((await db.cheap.bulkGet(deck.cards.map((c) => norm(c.name)))).filter(Boolean).map((c) => [c!.key, c!])), [deck]) ?? new Map<string, Cheap>();
  const cardOf = (name: string) => withCheapest(byKey.get(norm(name)), cheap);
  const [gc, setGc] = useState<Set<string> | null | undefined>(undefined);
  useEffect(() => {
    resolveRows(deck.cards.map((c) => ({ name: c.name, qty: c.qty })), () => {})
      .then(() => cheapest(deck.cards.map((c) => c.name)))
      .catch(() => {});
    gameChangers().then(setGc);
  }, [deck.id]);
  const [view, setView] = useStored<'grid' | 'list' | 'compact'>(VIEW_KEY, 'grid', ['grid', 'list', 'compact']);
  const [zoom, setZoom] = useStored<'s' | 'm' | 'l'>('ch:cmdrzoom', 'm', ['s', 'm', 'l']);
  const [openSearch, setOpenSearch] = useState(0);
  const [grouping, setGrouping] = useStored<Grouping>('ch:dgroup', 'type', GROUPINGS.map(([v]) => v));
  const [sort, setSort] = useStored<SortKey>('ch:dsort', 'mv', SORTS.map(([v]) => v));
  const [q, setQ] = useState('');
  const [show, setShow] = useStored<Show>('ch:dshow', 'all', SHOWS.map(([v]) => v));
  const [only, setOnly] = useState<Only>('all');
  const [swapHint, setSwapHint] = useStored<'show' | 'done'>('ch:swaphint', 'show', ['show', 'done']);
  const cardFor = (c: DeckCard) => (c.foil ? atFinish(cardOf(c.name), true) : cardOf(c.name));
  const missingCost = priceSum(deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ card: cardFor(c), qty: c.qty })));
  const deckCost = priceSum(deck.cards.map((c) => ({ card: cardFor(c), qty: c.qty })));
  const buyItems = deck.cards.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => ({ name: c.name, qty: c.qty, cad: toCad(cardFor(c)?.usd) }));
  const cubeRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{ card: DeckCard; x: number; y: number } | null>(null);
  const [deckMenu, setDeckMenu] = useState<MenuAt | null>(null);
  const [handOpen, setHandOpen] = useState(false);
  const [ruleZeroOpen, setRuleZeroOpen] = useState(false);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [compactHero, setCompactHero] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:compact_hero') === 'true';
    } catch {
      return false;
    }
  });
  const toggleCompactHero = () => {
    setCompactHero((v) => {
      try {
        localStorage.setItem('ch:forge:compact_hero', String(!v));
      } catch {}
      return !v;
    });
  };
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  const heroPress = useMenuPress((x, y) => setDeckMenu({ x, y }));
  const [toast, setToastNow] = useState<{ text: string; undo?: () => unknown } | null>(null);
  const [last, setLast] = useState<{ text: string; run: () => void } | null>(null);
  const setToast = (t: { text: string; undo?: () => unknown } | null) => {
    setToastNow(t);
    if (t?.undo) setLast({ text: t.text, run: () => (t.undo!(), setLast(null), setToastNow(null)) });
  };
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToastNow(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  useForgeMode(true);
  const [anExpanded, setAnExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:an_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const [sugExpanded, setSugExpanded] = useState(() => {
    try {
      return localStorage.getItem('ch:forge:sug_expanded') !== 'false';
    } catch {
      return true;
    }
  });
  const toggleAn = () => {
    setAnExpanded((v) => {
      try {
        localStorage.setItem('ch:forge:an_expanded', String(!v));
      } catch {}
      return !v;
    });
  };
  const toggleSug = () => {
    setSugExpanded((v) => {
      try {
        localStorage.setItem('ch:forge:sug_expanded', String(!v));
      } catch {}
      return !v;
    });
  };
  const pricesIn = byKey.size > 0;
  const st = deckStats(deck.cards, cardOf, deck.commander);
  const hydrating = deck.cards.length > 0 && (cardsRaw === undefined || (st.total > 0 && st.unknown >= st.total));
  const call = bracketOf(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc ?? null);
  const cmdr = deck.commander ? byKey.get(norm(deck.commander)) : undefined;
  const partner = deck.partner ? byKey.get(norm(deck.partner)) : undefined;
  const ci = cmdr ? pairIdentity(cmdr.ci, partner?.ci) : [...new Set(deck.cards.flatMap((c) => byKey.get(norm(c.name))?.ci ?? []))];
  const cmdrSlug = deck.commander ? commanderSlug(deck.commander, deck.partner) : '';
  const aim = Number(BRACKETS.find(([v]) => v === deck.source)?.[2]) || 4;
  const aggression = (({ upgraded: 'patient', optimized: 'hungry', cedh: 'lethal' }) as Record<string, 'patient' | 'hungry' | 'lethal'>)[deck.source ?? ''] ?? 'hungry';
  const ready = readiness({ deck: deck.cards, cardOf, commander: deck.commander, partner: deck.partner, identity: ci, bracket: aim, aggression });
  const fit = bracketFit(call, aim);
  const refBracket = deck.source === 'cedh' ? 'cedh' : call.bracket >= 4 ? (st.lands <= 30 ? 'cedh' : 'optimized') : call.bracket === 3 ? 'upgraded' : 'core';
  const [ref, setRef] = useState<RefShape | undefined>();
  useEffect(() => {
    let live = true;
    setRef(undefined);
    const label = `EDHREC's ${refBracket === 'cedh' ? 'cEDH' : `bracket ${{ core: 2, upgraded: 3, optimized: 4 }[refBracket]}`} average deck`;
    if (cmdrSlug) showPage(pagePath('average', cmdrSlug, refBracket), (p) => live && setRef(refShapeOf(p, label))).catch(() => {});
    return () => void (live = false);
  }, [cmdrSlug, refBracket]);
  const kill = killCheck(deck.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), refBracket === 'cedh' ? 5 : Math.max(call.bracket, 2));
  const banned = deck.cards.filter((c) => cardOf(c.name)?.legal === false).map((c) => c.name);
  const offColour = cmdr ? offIdentity(deck.cards.map((c) => c.name).filter((n) => n !== deck.commander && n !== deck.partner), ci, (n) => cardOf(n)?.ci) : [];
  const read = [
    ...(offColour.length ? [{ tone: 'low' as const, text: `${offColour.length} ${offColour.length === 1 ? 'card is' : 'cards are'} outside ${(deck.commander ?? '').split(' // ')[0]}'s colours: ${offColour.slice(0, 5).join(', ')}${offColour.length > 5 ? '…' : ''}. Swap ${offColour.length === 1 ? 'it' : 'them'} out before you play.` }] : []),
    ...(banned.length ? [{ tone: 'low' as const, text: `${banned.length} ${banned.length === 1 ? "card isn't" : "cards aren't"} legal in Commander: ${banned.slice(0, 5).join(', ')}${banned.length > 5 ? '…' : ''}. Swap ${banned.length === 1 ? 'it' : 'them'} out before you play.` }] : []),
    ...analysis(st, { bracket: refBracket === 'cedh' ? 5 : call.bracket, ref }),
    { tone: (kill.verdict === 'lethal' ? 'ok' : 'low') as 'ok' | 'low', text: kill.says },
  ];

  const [swapFor, setSwapFor] = useState<string | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null);
  useEffect(() => {
    let live = true;
    setRecs(null);
    if (cmdrSlug) showPage(pagePath('commander', cmdrSlug), (p) => live && setRecs(p)).catch(() => {});
    return () => void (live = false);
  }, [cmdrSlug]);
  const prof = useLiveQuery(() => db.profiles.get(s.profile), [s.profile]);
  const pins = (deck.commander && prof?.pins?.[deck.commander]) || noPins();
  const [cf, setCf] = useState<CardFilter>({ inc: [], exc: [] });
  const [filtered, setFiltered] = useState<{ page: EdhPage; applied: boolean; pins?: boolean } | null>(null);
  const fq = withPins(cf, pins);
  const fqKey = JSON.stringify(fq);
  const pinned = fq.inc.length + fq.exc.length > cf.inc.length + cf.exc.length;
  useEffect(() => {
    setFiltered(null);
    if (!recs || (!fq.inc.length && !fq.exc.length)) return;
    let live = true;
    const at = pagePath('commander', cmdrSlug);
    void (async () => {
      const r = await fetchFiltered(at, fq, recs);
      if (!pinned || (r.applied && (r.page.numDecks ?? 0) >= PIN_FILTER_MIN_DECKS)) return live && setFiltered({ ...r, pins: pinned });
      const plain = cf.inc.length || cf.exc.length ? await fetchFiltered(at, cf, recs) : { page: recs, applied: false };
      if (live) setFiltered(plain);
    })();
    return () => void (live = false);
  }, [recs, fqKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = filtered?.page ?? recs;
  const [edhCards, setEdhCards] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const want = (sugg?.lists ?? []).flatMap((l) => l.cards.map((c) => c.id)).filter(Boolean) as string[];
    let live = true;
    if (want.length)
      cardsByIds(want.slice(0, 400), undefined, (partial) => {
        if (live) setEdhCards((prev) => new Map([...prev, ...[...partial.values()].map((c) => [c.key, c] as const)]));
      })
        .then(async (m) => {
          if (!live) return;
          const named = new Map([...m.values()].map((c) => [c.key, c]));
          setEdhCards((prev) => new Map([...prev, ...named]));
          await cheapest([...m.values()].map((c) => c.name), (ch) => {
            if (live) setEdhCards((prev) => new Map([...prev, ...[...named].map(([k, c]) => [k, withCheapest(c, ch)!] as const)]));
          });
        })
        .catch(() => {});
    return () => void (live = false);
  }, [sugg]);
  const binder = useBinder(s.profile);
  const binderCard = new Map(binder.map((c) => [c.key, c]));
  const never = new Set(pins.out.map(norm));
  const inDeck = new Set(deck.cards.map((c) => norm(c.name)));
  const recInfo = recInfoOf(sugg?.lists ?? [], norm, (c) => binderCard.get(norm(c.name)) ?? byKey.get(norm(c.name)) ?? edhCards.get(norm(c.name)));
  const listed = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !never.has(norm(c.name)));
  const candidates = binderCandidates(listed, binder, ci, never).filter((c) => !inDeck.has(norm(c.name)));
  const slotInfo = (name: string): SubCard => {
    const card = cardOf(name);
    return { ...recInfo.get(norm(name)), name, type: card?.type, cmc: card?.cmc };
  };
  const others = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [];
  const alloc = allocate(others, s.mine);
  const deckCol = new Map(others.map((d) => [d.name, deckColour(d)]));
  const optionOf = (sub: SubCard): SwapOption => {
    const bc = binderCard.get(norm(sub.name));
    const img = bc?.img;
    const use = inUseChip(alloc, sub.name, (d) => d === deck.name);
    return { sub, img, big: img?.replace('/small/', '/normal/'), owned: s.mine.get(norm(sub.name)) ?? 0, text: bc?.text, inUse: use && { ...use, colour: deckCol.get(use.deck) } };
  };
  const forgePool = () =>
    binder.filter((b) => b.ci.every((x) => ci.includes(x)) && !inDeck.has(b.key) && !never.has(b.key)).map((b) => optionOf({ ...recInfo.get(b.key), name: b.name, type: b.type, cmc: b.cmc }));
  async function swapIn(from: string, to: string) {
    setSwapHint('done');
    if (cmdr && offIdentity([to], ci, (n) => binderCard.get(norm(n))?.ci ?? cardOf(n)?.ci).length) return;
    haptic('success');
    const key = deck.commander ?? deck.name;
    void recordTaste(s.profile, from, 'cut', key).then(() => recordTaste(s.profile, to, 'add', key));
    setSwapFor(null);
    setPlacing(null);
    setToast({ text: `Swapped ${from} for ${to}`, undo: await replaceInDeck(deck, from, to) });
  }
  const [placing, setPlacing] = useState<string | null>(null);
  const forgeCands = [...recInfo.values()].filter((c) => !never.has(norm(c.name))).concat(binderCandidates([], binder, ci, never));
  const anyCard = (n: string) => byKey.get(norm(n)) ?? binderCard.get(norm(n)) ?? edhCards.get(norm(n));
  const swapCtx = { deck: deck.cards, cardOf: anyCard, commander: deck.commander, bracket: aim, aggression, taste: prof?.brain?.taste, focus: commanderThemes(cmdr, recs?.tags)[0], taken: takenOthers };
  const sugImg = (n: string) => binderCard.get(norm(n))?.img ?? edhCards.get(norm(n))?.img ?? byKey.get(norm(n))?.img;
  async function addCard(n: string) {
    if (cmdr && offIdentity([n], ci, (x: string) => anyCard(x)?.ci).length) return;
    void recordTaste(s.profile, n, 'add', deck.commander ?? deck.name);
    setPlacing(null);
    setToast({ text: `Added ${n}`, undo: await addToDeck(deck, n) });
  }
  async function cutCard(n: string) {
    if (n === deck.commander || n === deck.partner) return;
    void recordTaste(s.profile, n, 'cut', deck.commander ?? deck.name);
    setToast({ text: `Cut ${n}`, undo: await removeFromDeck(deck, n) });
  }
  const drop = useDeckDrop((onto, card) => onto !== deck.commander && void swapIn(onto, card), (card) => void addCard(card));

  const shortHere = short.filter((x) => x.decks.includes(deck.name));
  const owned = (n: string) => statusOf(n, s.mine) === 'owned';
  const keyOf = (c: DeckCard) => {
    const card = cardOf(c.name);
    if (grouping === 'none') return 'All cards';
    if (grouping === 'own') {
      const st = statusOf(c.name, s.mine, s.other);
      return st === 'owned' ? 'Owned' : st === 'other' ? `In ${s.otherName}` : 'Missing';
    }
    if (c.name === deck.commander || c.name === deck.partner) return 'Commander';
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
  const shown = searchByText(deck.cards.filter((c) => shows(show, owned(c.name)) && onlyOk(only, { gc: !!gc?.has(norm(c.name)), cad: toCad(cardFor(c)?.usd) })), q, (c) => ({ name: c.name, type: cardOf(c.name)?.type, text: cardOf(c.name)?.text }));
  const sorted = sortBy(shown, sort, (c) => {
    const card = cardOf(c.name);
    return { name: c.name, usd: card?.usd ? Number(card.usd) : undefined, mv: card ? (isLand(card.type) ? 99 : card.cmc) : undefined, owned: owned(c.name) };
  });
  for (const c of sorted) if (c.name !== deck.commander) sections.get(keyOf(c))?.push(c);
  const Item = view === 'grid' ? CardTile : CardLine;

  return (
    <>
      <main className="dpage forgemain">
        {!compactHero && (
          <section className={`vhero dhero hasmenu${cmdr?.img ? '' : ' noimg'}`} {...heroPress} aria-label={`${deck.name}: deck`} title="Right-click (or press and hold) for deck options">
            {cmdr?.img && (
              <div className="vcard">
                <CmdrCard
                  src={cmdr.img.replace('/small/', '/normal/')}
                  name={cmdr.name}
                  onMenu={(x, y) => setMenu({ card: deck.cards.find((c) => c.name === deck.commander) ?? { name: cmdr.name, qty: 1 }, x, y })}
                />
              </div>
            )}
            <div className="vinfo">
              <div className="vname">
                <span className="vslash" aria-hidden="true" />
                <h1 aria-label={deck.name} {...heroPress}>
                  <Ransom text={deck.name.replace(/_+/g, ' ').trim().toUpperCase().slice(0, 48)} size={narrow ? (deck.name.length > 16 ? 22 : 28) : deck.name.length > 28 ? 34 : 46} seed={33} room={narrow && cmdr?.img ? heroRoom() : undefined} />
                </h1>
                <DeckLight deck={deck} />
              </div>
              <div className="vmeta" onClick={(e) => e.stopPropagation()}>
                <Pips ci={ci} size={20} />
                {deck.commander && <span>{deck.commander.split(' // ')[0]}</span>}
                <span>{st.total} cards</span>
                {!hydrating && <span>{st.lands} lands</span>}
                {!hydrating && st.avgMv > 0 && <span>avg MV {st.avgMv.toFixed(2)}</span>}
                <SaltStat names={deck.cards.map((c) => c.name)} />
                <BracketStat call={call} cedh={deck.source === 'cedh'} />
                {deck.commander && <OutsideLinks commander={deck.commander} edhrecPath={`commanders/${slug(deck.commander)}`} />}
              </div>
              <div className="vmatch" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
                <b className="num">{sum.pct}%</b>
                <span className="vbar">
                  <Meter pct={sum.pct} label={`Collection match ${sum.pct}%`} />
                  <small>
                    collection match · you own {sum.owned} of {sum.total}
                    {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
                  </small>
                </span>
              </div>
              {hydrating ? (
                <p className="small muted" role="status" style={{ margin: '8px 0 0' }}>
                  Loading card data &amp; readiness checks…
                </p>
              ) : (
                <ReadyTiles ready={ready} fit={fit} cardNames={deck.cards.map((c) => c.name)} />
              )}
            </div>
          </section>
        )}

        <section className="dstrip" aria-label="Deck status" style={{ paddingInline: 12 }}>
          <p className="dstatus" role="status">
            {pricesIn && (
              <span className="dcost" title={`${PRICE_METHOD} ${fetchedNote(deck.cards.map((c) => cardOf(c.name)?.priceAt ?? cardOf(c.name)?.at))}`}>
                deck ≈{cad(deckCost)}
              </span>
            )}
            {ownDetails.missingToBuy > 0 ? (
              <span className="dmiss">
                {ownDetails.missingToBuy} to buy{pricesIn ? ` ≈${cad(missingCost)}` : ''}
                {ownDetails.ownedElsewhere > 0 ? ` · ${ownDetails.ownedElsewhere} in ${s.otherName}` : ''}
                {` · ${ownDetails.assignedHere} in this deck`}
              </span>
            ) : ownDetails.ownedElsewhere > 0 ? (
              <span className="dmiss">
                all owned · {ownDetails.assignedHere} here · {ownDetails.ownedElsewhere} in {s.otherName}
              </span>
            ) : (
              <span>every card is yours ({ownDetails.assignedHere} in this deck)</span>
            )}
          </p>
          <div className="dacts" style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <ShortAlert items={shortHere} inline currentDeck={deck.name} />
            <button type="button" className="u-btn ghost" onClick={() => (haptic('open'), setBalanceOpen(true))}>
              BALANCE
            </button>
            <button type="button" className="u-btn ghost" onClick={() => (haptic('open'), setHandOpen(true))}>
              HAND &amp; ODDS
            </button>
            <button type="button" className="u-btn ghost" onClick={() => (haptic('open'), setRuleZeroOpen(true))}>
              RULE ZERO
            </button>
            {deck.id && (
              <button type="button" className="u-btn ghost" onClick={() => (haptic('open'), setHistoryOpen(true))}>
                HISTORY
              </button>
            )}
            <button type="button" className="u-btn ghost" onClick={() => (haptic('select'), toggleCompactHero())}>
              {compactHero ? 'SHOW HEADER' : 'COMPACT HEADER'}
            </button>
          </div>
        </section>

        {balanceOpen && (
          <Suspense fallback={null}>
            <BalanceSheet
              deck={deck}
              ctx={swapCtx}
              candidates={candidates}
              identity={ci}
              pinned={pins.in}
              never={never}
              recOf={slotInfo}
              cardOf={anyCard}
              call={call}
              aggression={aggression}
              gameChangers={gc}
              onToast={setToast}
              onClose={() => setBalanceOpen(false)}
            />
          </Suspense>
        )}

        {handOpen && (
          <Suspense fallback={null}>
            <HandSheet deckName={deck.name} cards={deck.cards} commander={deck.commander} partner={deck.partner} st={st} cardOf={cardOf} onClose={() => setHandOpen(false)} />
          </Suspense>
        )}
        {ruleZeroOpen && (
          <Suspense fallback={null}>
            <RuleZeroModal
              deckName={deck.name}
              commander={deck.commander}
              commanderImg={cmdr?.img}
              ci={ci}
              ownedPct={sum.pct}
              st={st}
              call={call}
              cedh={deck.source === 'cedh'}
              onClose={() => setRuleZeroOpen(false)}
            />
          </Suspense>
        )}

        {!deck.commander && <PickCommander deck={deck} cardOf={cardOf} />}

        {deckMenu && <DeckMenu deck={deck} at={deckMenu} onClose={() => setDeckMenu(null)} onDeleted={onBack} onOpen={onOpen} onHistory={() => setHistoryOpen(true)} />}
        {historyOpen && deck.id && <HistoryDrawer deck={deck} onClose={() => setHistoryOpen(false)} />}

        <ForgeTop label={deck.name} sub={`${st.total} cards${deck.commander ? ` · ${deck.commander.split(' // ')[0]}` : ''}`} undo={last ?? undefined} onLeave={onBack} reserved={deck.alloc === 'reserved'} />

        <ForgeCube grid={cubeRef} buyCount={buyItems.reduce((n, c) => n + c.qty, 0)} />
        <div ref={cubeRef} className={`deckgrid after-sw forge-split${!anExpanded ? ' an-contracted' : ''}${!sugExpanded ? ' sug-contracted' : ''}`} data-zoom={zoom}>
          {swapFor && <div className="backdrop" onClick={() => setSwapFor(null)} />}
          <div className={`dside forge-analysis${!anExpanded ? ' is-contracted' : ''}`}>
            <DeckPanel
              deck={deck}
              st={st}
              read={read}
              meters={
                <ForgeMeters
                  st={st}
                  range={(r) => (r === 'tutors' ? undefined : AGGRESSION[aggression][r])}
                  expanded={anExpanded}
                  onToggleExpand={toggleAn}
                />
              }
            />
          </div>
          <div className="lists" {...drop}>
            <ToolBar
              q={q}
              setQ={setQ}
              now={[GROUPINGS.find(([v]) => v === grouping)?.[1], SORTS.find(([v]) => v === sort)?.[1], only !== 'all' ? ONLYS.find(([v]) => v === only)?.[1] : ''].filter(Boolean).join(' · ')}
              extra={
                <label className="sortsel">
                  <select aria-label="Sort cards" value={sort} onChange={(e) => (haptic('select'), setSort(e.target.value as SortKey))}>
                    {SORTS.map(([v, t]) => (
                      <option key={v} value={v}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
              }
              quick={
                <>
                  <CycleBtn name="Only" cls="qonly-btn" value={only} options={ONLYS} onChange={setOnly} />
                  <CycleBtn
                    name="View"
                    cls="qview-btn"
                    value={view}
                    options={[['grid', 'GRID'], ['list', 'LIST'], ['compact', 'COMPACT']] as [typeof view, string][]}
                    onChange={setView}
                    icons={{ grid: <GridIcon />, list: <ListIcon />, compact: <CompactIcon /> }}
                  />
                  {view === 'grid' && (
                    <button
                      type="button"
                      className="u-btn ghost qzoom-btn"
                      title={{ s: 'Size: Small. Tap for Medium', m: 'Size: Medium. Tap for Large', l: 'Size: Large. Tap for Small' }[zoom]}
                      aria-label={`Card size ${zoom.toUpperCase()}: tap to cycle size`}
                      onClick={() => {
                        haptic('select');
                        setZoom(zoom === 's' ? 'm' : zoom === 'm' ? 'l' : 's');
                      }}
                    >
                      SIZE {zoom.toUpperCase()}
                    </button>
                  )}
                  {binder.length > 0 && (
                    <button type="button" className="u-btn ghost qadd-btn" title="Search your own cards and put them in this deck" onClick={() => (haptic('open'), setOpenSearch((n) => n + 1))}>
                      + MY CARDS
                    </button>
                  )}
                </>
              }
            >
              <GroupPick grouping={grouping} show={show} onGroup={setGrouping} onShow={setShow} />
              <ChipPick label="SORT" value={sort} options={SORTS} onChange={setSort} />
              <ChipPick label="ONLY" value={only} options={ONLYS} onChange={setOnly} />
            </ToolBar>
            <SetChips
              chips={[
                ...(show !== 'all' ? [{ label: show.toUpperCase() + ' ONLY', off: () => setShow('all') }] : []),
                ...(only !== 'all' ? [{ label: ONLYS.find(([v]) => v === only)?.[1] ?? only, off: () => setOnly('all') }] : []),
              ]}
            />
            <JumpRail headers={[...sections].filter(([, cs]) => cs.length).map(([h]) => h)} />
            {swapHint === 'show' && <p className="forgehint">tap a card to swap it · drag a suggestion onto a card to swap, or onto the list to add · drag a card out to cut it</p>}
            {[...sections]
              .filter(([, cs]) => cs.length)
              .map(([h, cs]) => {
                const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                return (
                  <details key={h} id={jumpId(h)} className="cat" open>
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

                    <ul className={view === 'grid' ? 'zgrid' : view === 'compact' ? 'zlist zcompact' : 'zlist'} data-zoom={view === 'grid' ? zoom : undefined}>
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
                          drag={c.name !== deck.commander}
                          onOpen={c.name === deck.commander || (BASICS.has(norm(c.name)) && !placing) ? undefined : () => (placing ? void swapIn(c.name, placing) : setSwapFor(c.name))}
                        >
                          {swapFor === c.name && (
                            <SwapNote
                              name={c.name}
                              missing={slotInfo(c.name)}
                              big={cardOf(c.name)?.img?.replace('/small/', '/normal/')}
                              ctx={swapCtx}
                              options={rankSubs(slotInfo(c.name), candidates, 3, swapCtx).map(optionOf)}
                              pool={forgePool()}
                              loading={!!deck.commander && !recs}
                              pin={pinOf(pins, c.name)}
                              canPinIn={owned(c.name)}
                              cmdr={(deck.commander ?? deck.name).split(' // ')[0]}
                              onPick={(to) => swapIn(c.name, to)}
                              onUndo={() => setSwapFor(null)}
                              onPin={deck.commander ? (side) => (void pinCard(s.profile, deck.commander!, c.name, side), setSwapFor(null)) : undefined}
                              deck={deck.cards.map((x) => x.name)}
                              bracket={call.bracket}
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
          <div className="dside forge-buy">
            <BuyList items={buyItems} binder={s.binderName} />
          </div>
          <div className={`dside forge-suggestions${!sugExpanded ? ' is-contracted' : ''}`}>
            <ForgeSuggest
              profile={s.profile}
              deck={deck.cards}
              commander={deck.commander}
              bracket={aim}
              aggression={aggression}
              candidates={forgeCands}
              cardOf={anyCard}
              ownedOf={(n) => s.mine.get(norm(n)) ?? 0}
              taken={takenOthers}
              imgOf={sugImg}
              themes={recs?.tags ?? []}
              cf={cf}
              onCf={deck.commander ? setCf : undefined}
              cfNote={filtered?.pins && !(cf.inc.length + cf.exc.length) ? `From ${filtered.page.numDecks?.toLocaleString()} EDHREC decks that fit your pins.` : cf.inc.length + cf.exc.length ? (!filtered ? 'Asking EDHREC…' : filtered.applied ? `From ${filtered.page.numDecks?.toLocaleString()} EDHREC decks.` : "EDHREC didn't filter this page from the app.") : undefined}
              placing={placing}
              onPlace={setPlacing}
              onAdd={(n) => void addCard(n)}
              onCut={(n) => void cutCard(n)}
              loading={!!deck.commander && !recs}
              expanded={sugExpanded}
              onToggleExpand={toggleSug}
              openSearch={openSearch}
              whyNot={(text) => notOffered(text, binder, cmdr ? ci : undefined, inDeck, never)}
            />
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
            pin={deck.commander ? { side: pinOf(pins, menu.card.name), canIn: owned(menu.card.name), onPin: (side) => pinCard(s.profile, deck.commander!, menu.card.name, side) } : undefined}
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

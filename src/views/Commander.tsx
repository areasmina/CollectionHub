import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useRef, useState } from 'react';
import { CardSpin } from './CardSpin';
import { BASICS, statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { BRACKETS, BUDGETS, fetchFiltered, filterWebUrl, imgOf, NoPage, pagePath, showPage, type CardFilter, type EdhCard, type EdhPage } from '../lib/edhrec';
import { norm, slug as toSlug } from '../lib/names';
import { cad, fetchedNote, rateNote, shopUrl, toCad } from '../lib/prices';
import { searchByText } from '../lib/search';
import { cardsByIds, cheapest, withCheapest } from '../lib/scryfall';
import { rankSubs, recInfoOf, type SubCard } from '../lib/subs';
import { binderCandidates } from '../brain/candidates';
import { recordTaste, setWild } from '../brain/store';
import { comboBreaks, nearCombos } from '../brain/combos';
import { comboAllowed } from '../brain/win';
import { pickWildcards, seedOf, wildcardCandidates, WILDCARD_DEFAULT } from '../brain/wildcard';
import { arrange, noPins, pinOf, type PinSide } from '../lib/pins';
import { savePin } from '../lib/deckedit';
import { canLeave, freeDeckName, openDeck, setBack, setLeaveGuard } from '../lib/nav';
import { orderSections, regroup } from '../lib/sections';
import { groupOf } from '../lib/deckstats';
import { allocate } from '../lib/allocation';
import { deckColour } from '../lib/deckcolor';
import { inUseChip } from '../brain/chips';
import { BUY_CAPS, coverage, coverageText, overCap, OWN_MODES, ownedOnly, type OwnMode } from '../brain/modes';
import { CardLine, CardTile, CmdrCard, DeckLink, HeroStats, money, priceSum, Segs, ShortAlert, snapTick, usd, Pick, ToolBar, OptRow, useBinder, useStored, type Shared } from './shared';
import { shortfalls } from '../lib/copies';
import { shows, sortBy, SHOWS, SORTS, type Show, type SortKey } from '../lib/arrange';

// EDHREC's own order first on commander pages.
const CSORTS: [SortKey, string][] = [['list', 'EDHREC ORDER'], ...SORTS];
import { SwapNote } from './SwapNote';
import { CardMenu, type Toast } from './CardMenu';
import { Doodles, ownColour, PageDecor, Pips, Ransom, RiseBars, Tape, Xgrain, GridIcon, ListIcon } from './zine';

// The 'As Commander' popularity view is hidden for now; set true to bring the View switch back.
/** Where a deck opened from Discover starts: MED power (bracket 4) and MAX budget ($$$). */
const OPEN_BRACKET = 'optimized';
const OPEN_BUDGET = 'expensive';
const SHOW_AS_COMMANDER = false;

const pct = (n: number) => `${Math.round(n * 100)}%`;
const ids = (p: EdhPage | null) => [p?.card?.id, ...(p?.lists.flatMap((l) => l.cards.map((c) => c.id)) ?? [])].filter(Boolean) as string[];

/** Tags shown before "+N MORE": EDHREC's biggest archetypes. */
const TAGS_SHOWN = 6;

export function CommanderView({ name, s, onBack: back, no }: { name: string; s: Shared; onBack: () => void; no?: number }) {
  const onBack = () => void canLeave().then((ok) => ok && back());
  // Phones: a smaller ransom name, so the hero doesn't fill the first screen.
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  // The pill menu's back arrow goes back to the commander list.
  useEffect(() => {
    setBack(onBack);
    return () => void setBack(null);
  }, []);
  const slug = toSlug(name);
  const [kind, setKind] = useState<'commander' | 'average'>(SHOW_AS_COMMANDER ? 'commander' : 'average');
  // A deck opened from Discover starts at MED power and MAX ($$$) budget (owner's call, Nov 6); thin commanders fall back.
  const [bracket, setBracket] = useState(OPEN_BRACKET);
  const [noBracket, setNoBracket] = useState(false); // EDHREC has no page for this bracket: showing all brackets
  const [budget, setBudget] = useState(OPEN_BUDGET);
  const [noBudget, setNoBudget] = useState(false); // no page at this budget: showing any budget
  const [tag, setTag] = useState('');
  const [allTags, setAllTags] = useState(false);
  const [page, setPage] = useState<EdhPage | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null); // EDHREC recommendations behind an average deck
  // EDHREC's With card / Without card: suggestions come from decks that do / don't run those cards
  const [cf, setCf] = useState<CardFilter>({ inc: [], exc: [] });
  const [cfDraft, setCfDraft] = useState({ inc: '', exc: '' });
  const [filtered, setFiltered] = useState<{ page: EdhPage; applied: boolean } | null>(null);
  useEffect(() => {
    setFiltered(null);
    if (!recs || (!cf.inc.length && !cf.exc.length)) return;
    let live = true;
    void fetchFiltered(pagePath('commander', slug, bracket, tag, budget), cf, recs).then((r) => live && setFiltered(r));
    return () => void (live = false);
  }, [recs, cf, slug, bracket, tag, budget]);
  const sugg = filtered?.page ?? recs;
  const [tags, setTags] = useState<EdhPage['tags']>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ slot: string; name: string; x: number; y: number } | null>(null); // card menu
  const [toast, setToast] = useState<Toast | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);
  const path = pagePath(kind, slug, bracket, tag, budget);
  const profile = useLiveQuery(() => db.profiles.get(s.profile), [s.profile]);
  const swaps = profile?.swaps?.[path] ?? {};
  const pins = profile?.pins?.[name] ?? noPins();
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
    setNoBudget(false);
    // Fallbacks, in order: this power at any budget, then every bracket at any budget.
    showPage(path, (p) => live && setPage(p))
      .catch((e) => {
        if (!(e instanceof NoPage) || !budget) throw e;
        if (live) setNoBudget(true);
        return showPage(pagePath(kind, slug, bracket, tag, ''), (p) => live && setPage(p));
      })
      .catch((e) => {
        if (!(e instanceof NoPage) || !bracket) throw e;
        if (live) setNoBracket(true);
        return showPage(pagePath(kind, slug, '', tag, ''), (p) => live && setPage(p));
      })
      .catch((e) => live && setError(e.message));
    if (kind === 'average')
      showPage(pagePath('commander', slug, bracket, tag, budget), (p) => live && setRecs(p))
        .catch(() => showPage(pagePath('commander', slug, bracket, tag, ''), (p) => live && setRecs(p)))
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
  const deckCost = priceSum([...new Map(all.map((c) => [c.name, c])).values()].map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));

  // Your binder (the swap window's search, and pinned cards' types).
  const binder = useBinder(s.profile);
  const never = new Set([...pins.out, ...cf.exc].map(norm));
  const recInfo = recInfoOf(sugg?.lists ?? [], norm, (c) => cardOf(c as EdhCard));
  // Replacement candidates: owned cards EDHREC recommends for this commander, minus the ones you never use.
  const owned = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !never.has(norm(c.name)));
  const recCard = new Map((sugg?.lists ?? []).flatMap((l) => l.cards).map((c) => [norm(c.name), c]));
  const slotInfo = (c: EdhCard): SubCard => {
    const info = recInfo.get(norm(c.name));
    const sc = cardOf(c);
    return { ...info, name: c.name, type: sc?.type ?? info?.type, cmc: sc?.cmc ?? info?.cmc };
  };
  const byName = new Map(all.map((c) => [c.name, c]));
  const binderType = new Map(binder.map((c) => [c.key, c.type]));
  // OWNED ONLY / PREFER OWNED and the buy cap (per device): see brain/modes.ts for the rules.
  const [ownMode, setOwnMode] = useStored<OwnMode>('ch:own', 'prefer', OWN_MODES.map(([v]) => v));
  const [capS, setCap] = useStored('ch:buycap', '0', BUY_CAPS.map(([v]) => v));
  const cap = Number(capS);
  // The deck after your swaps and pins (slot = EDHREC's card).
  const eff = arrange(
    [...byName.values()].map((c) => ({ name: c.name, qty: c.qty ?? 1, type: slotInfo(c).type, incl: recInfo.get(norm(c.name))?.incl })),
    swaps,
    pins,
    (slot, used) => rankSubs(slotInfo(byName.get(slot)!), owned.filter((o) => !used.has(norm(o.name))), 1)[0]?.name,
    { commander: name, typeOf: (n) => binderType.get(norm(n)) },
  );
  // OWNED ONLY: slots still holding a card you don't own take the best owned stand-in (never the commander).
  if (kind === 'average' && ownMode === 'owned')
    for (const [slot, r] of ownedOnly(
      [...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => ({ slot: k, name: v.name, qty: byName.get(k)?.qty ?? 1 })),
      (n) => statusOf(n, s.mine) === 'owned',
      (slot, used) => rankSubs(slotInfo(byName.get(slot)!), owned.filter((o) => !used.has(norm(o.name))), 1)[0]?.name,
      norm,
    ))
      eff.set(slot, { name: r, why: 'auto' });
  const nameIn = (c: EdhCard) => eff.get(c.name)?.name ?? c.name;
  const inDeck = new Set([...eff.values()].map((x) => norm(x.name)));
  const candidates = owned.filter((c) => !inDeck.has(norm(c.name)));
  // The swap window's top 3: owned cards EDHREC lists here, plus the rest of your binder in these colours.
  const suggest = (c: EdhCard) => rankSubs(slotInfo(c), binderCandidates(candidates, binder, ci, never).filter((x) => !inDeck.has(norm(x.name))));
  const binderCard = new Map(binder.map((c) => [c.key, c]));
  const optionOf = (sub: SubCard) => {
    const sc = recCard.get(norm(sub.name));
    const bc = binderCard.get(norm(sub.name));
    const img = (sc && cardOf(sc)?.img) ?? bc?.img ?? imgOf(sc?.id);
    const use = inUseChip(alloc, sub.name, (d) => sameCmdr.has(d));
    const inUse = use && { ...use, colour: deckCol.get(use.deck) };
    return { sub, img, big: sc?.id ? imgOf(sc.id, 'normal') : img?.replace('/small/', '/normal/'), owned: s.mine.get(norm(sub.name)) ?? 0, text: bc?.text ?? (sc && cardOf(sc)?.text), inUse };
  };

  // A card swapped in sits with its own type (a creature for a sorcery joins the Creatures), so the deck stays organised.
  const placed =
    kind === 'average'
      ? regroup(sections, (c) => {
          const now = nameIn(c);
          if (now === c.name) return undefined;
          const rc = recCard.get(norm(now));
          const g = groupOf((rc && cardOf(rc)?.type) ?? binderCard.get(norm(now))?.type);
          return g === 'Other' || g === 'Commander' ? undefined : g;
        })
      : sections;
  // The commander isn't repeated as a one-card section: its big card at the top is its menu.
  const listed = placed.filter((l) => l.header !== 'Commander');

  async function setSwap(missingName: string, replacement: string | null) {
    const p = (await db.profiles.get(s.profile))!;
    const deck = { ...(p.swaps?.[path] ?? {}) };
    const was = deck[missingName] ?? missingName;
    if (replacement) deck[missingName] = replacement;
    else delete deck[missingName];
    if (replacement) void recordTaste(s.profile, was, 'cut', name).then(() => recordTaste(s.profile, replacement, 'add', name));
    await db.profiles.update(s.profile, { swaps: { ...(p.swaps ?? {}), [path]: deck } });
    setMenuFor(null);
  }
  async function setPin(card: string, side: PinSide) {
    await savePin(s.profile, name, card, side);
    void recordTaste(s.profile, card, side === 'in' ? 'always' : 'never', name);
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

  // one save at a time: a double tap on FORGE IT used to race freeDeckName and make two decks
  const savingRef = useRef(false);
  const [saving, setSaving] = useState(false);
  async function saveDeck(open = true) {
    if (!page || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const list = page.lists.flatMap((l) => l.cards.map((c) => ({ name: nameIn(c), qty: c.qty ?? 1 })));
      const deckName = await freeDeckName(s.profile, `${name} (${forging ? 'forged' : 'EDHREC average'})`);
      await db.decks.add({ profile: s.profile, name: deckName, commander: name, source: bracket || undefined, cards: [{ name, qty: 1 }, ...list], updated: Date.now() });
      await clearSwaps(); // the forge is done: the deck is yours now
      setSaved(deckName);
      haptic('success');
      if (open) openDeck(deckName);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function clearSwaps() {
    const p = (await db.profiles.get(s.profile))!;
    const { [path]: _, ...rest } = p.swaps ?? {};
    await db.profiles.update(s.profile, { swaps: rest });
  }

  // The forging zone: your first swap on this deck starts it; leaving asks whether to keep the deck.
  const changes = Object.keys(swaps).length;
  const forging = kind === 'average' && changes > 0;
  const [leaving, setLeaving] = useState<((go: boolean) => void) | null>(null);
  const live = useRef({ forging, saveDeck, clearSwaps });
  live.current = { forging, saveDeck, clearSwaps };
  useEffect(() => {
    setLeaveGuard(() => (live.current.forging ? new Promise<boolean>((go) => (haptic('warn'), setLeaving(() => go))) : Promise.resolve(true)));
    return () => setLeaveGuard(null);
  }, []);
  const leave = async (choice: 'save' | 'drop' | 'stay') => {
    const go = leaving!;
    setLeaving(null);
    if (choice === 'save') await live.current.saveDeck(false);
    if (choice === 'drop') (haptic('undo'), await live.current.clearSwaps());
    go(choice !== 'stay');
  };

  const toBuy = missing.filter((c) => !bought.has(norm(c.name)));
  // The swap tip shows on the first visit only: seen once, it stays off from the next visit on.
  const [tip, setTip] = useStored<'show' | 'off'>('ch:swaptip', 'show', ['show', 'off']);
  useEffect(() => () => setTip('off'), []); // eslint-disable-line react-hooks/exhaustive-deps
  const toBuyCost = priceSum(toBuy.map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));
  const pricesIn = cards.size > 0;
  // If you built this deck too: owned cards your saved decks already use up (saved decks of this commander are the same deck).
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [];
  // Your own decks led by this commander: one tap opens them.
  const mine = decks.filter((d) => d.commander === name).sort((a, b) => b.updated - a.updated);
  const thisDeck = `this ${name.split(' // ')[0]} deck`;
  // Copies your other decks use, for the swap window's "in <deck>" chip (saved decks of this commander are this deck).
  const alloc = allocate(decks, s.mine);
  const sameCmdr = new Set(mine.map((d) => d.name));
  const deckCol = new Map(decks.map((d) => [d.name, deckColour(d)]));
  const short = page
    ? shortfalls([...decks.filter((d) => d.commander !== name), { name: thisDeck, cards: all.map((c) => ({ name: nameIn(c), qty: c.qty ?? 1 })) }], s.mine).filter((x) => x.decks.includes(thisDeck))
    : [];
  const cmdr = useLiveQuery(() => db.cards.where('key').equals(norm(name)).first(), [name]);
  const ci = cmdr?.ci ?? page?.card?.ci ?? [];
  // EDHREC bracket slug -> bracket number for the rules (All = 4: no combo is off limits there).
  const bracketNum = Number(BRACKETS.find(([v]) => v === bracket)?.[2]) || 4;
  // WILDCARD (1 slot by default, off per commander): a seeded random pick among owned cards with evidence only.
  const wildSet = profile?.brain?.wild?.[norm(name)] ?? {};
  const wildOn = !wildSet.off && (profile?.brain?.wildcards ?? WILDCARD_DEFAULT) > 0;
  const deckNames = [name, ...[...eff.values()].map((x) => x.name)];
  const wild = (() => {
    if (!wildOn || !page) return undefined;
    const binderKeys = new Set(binder.map((b) => b.key));
    const near = nearCombos(deckNames, binderKeys)
      .filter((n) => !never.has(norm(n.add)))
      .map((n) => ({ add: n.add, owned: n.owned, allowed: comboAllowed(n.combo, bracketNum), cards: n.combo.cards }));
    const pick = pickWildcards(wildcardCandidates(candidates, near), 1, seedOf(name) + (wildSet.roll ?? 0), inDeck)[0];
    if (!pick) return undefined;
    // It takes the slot of the least played non-land card that is still EDHREC's own, not pinned and no combo piece.
    const slot = [...eff.entries()]
      .filter(([k, v]) => k !== name && v.name === k && byName.has(k) && !/\bLand\b/.test(slotInfo(byName.get(k)!).type ?? '') && !pins.in.includes(k) && !comboBreaks(k, deckNames).length)
      .sort((a, b) => (recInfo.get(norm(a[0]))?.incl ?? 1) - (recInfo.get(norm(b[0]))?.incl ?? 1))[0]?.[0];
    return slot ? { ...pick, slot } : undefined;
  })();
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
  const [q, setQ] = useState(''); // search the deck by name or rules text
  const [show, setShow] = useStored<Show>('ch:cshow', 'all', SHOWS.map(([v]) => v));

  // B) The receipt's back: the PULL list, the cards of this deck to take out of your binder (basics left out).
  const pull = [...new Map([...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => [norm(v.name), { name: v.name, qty: byName.get(k)?.qty ?? 1 }])).values()]
    .filter((c) => statusOf(c.name, s.mine) === 'owned' && !BASICS.has(norm(c.name)))
    .sort((x, y) => x.name.localeCompare(y.name));
  const [side, setSide] = useState<'buy' | 'pull'>('buy');
  const pullSide = side === 'pull' || missing.length === 0;
  const [pulled, setPulled] = useState<Set<string>>(new Set());
  const printReceipt = () => {
    haptic('tap');
    document.documentElement.classList.add('printing');
    const done = () => (document.documentElement.classList.remove('printing'), window.removeEventListener('afterprint', done));
    window.addEventListener('afterprint', done);
    window.print();
  };
  const receipt = kind === 'average' && (missing.length > 0 || pull.length > 0) && (
    <aside className={`receipt gbox${pullSide ? ' back' : ''}`} id="shop" aria-label={pullSide ? 'Pull list' : 'Shopping list'}>
      <div className="rflip" role="group" aria-label="Receipt side">
        {missing.length > 0 && (
          <button aria-pressed={!pullSide} onClick={() => (haptic('select'), setSide('buy'))}>
            TO BUY
          </button>
        )}
        <button aria-pressed={pullSide} onClick={() => (haptic('select'), setSide('pull'))}>
          PULL
        </button>
        <button className="rprint" onClick={printReceipt} aria-label="Print this list" title="Print this list">
          PRINT
        </button>
      </div>
      {pullSide ? (
        <>
          <h2>*** PULL LIST ***</h2>
          <hr />
          <div className="sub">
            {pull.reduce((n, c) => n + c.qty, 0)} cards from your binder · tick them as you pull
          </div>
          <ul>
            {pull.map((c) => {
              const done = pulled.has(norm(c.name));
              const use = inUseChip(alloc, c.name, (d) => sameCmdr.has(d));
              return (
                <li key={c.name} className={done ? 'done' : ''}>
                  <label>
                    <input type="checkbox" checked={done} onChange={() => (haptic(done ? 'tap' : 'success'), setPulled((p) => { const n = new Set(p); if (done) n.delete(norm(c.name)); else n.add(norm(c.name)); return n; }))} aria-label={`Pulled ${c.name}`} />
                    <span className="nm">
                      {c.qty > 1 ? `${c.qty}× ` : ''}
                      {c.name}
                      {use && <small> · {use.lock ? '🔒 ' : ''}{use.text}</small>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <hr />
          <div className="total">
            <span>PULLED</span>
            <span>
              {pulled.size}/{pull.length}
            </span>
          </div>
          <hr />
          <div className="thanks">thank you for building with what you own</div>
        </>
      ) : (
        <>
      <Doodles n={377} count={1} spots={[[78, 44]]} paper />
      <h2>*** TO BUY ***</h2>
      <hr />
      <div className="sub">
        {missing.length} missing{pricesIn && toBuyCost > 0 ? ` · ≈${cad(toBuyCost)} to complete` : ''} · ≈CA$ at your shop
      </div>
      <ul>
        {missing.map((c) => {
          const done = bought.has(norm(c.name));
          const over = overCap(toCad(cardOf(c)?.usd), cap);
          return (
            <li key={c.name} className={`${done ? 'done' : ''}${over ? ' over' : ''}`}>
              <label>
                <input type="checkbox" checked={done} onChange={() => (haptic(done ? 'tap' : 'success'), toggleBought(c.name))} aria-label={`Got ${c.name}`} />
                <span className="nm">
                  {c.qty && c.qty > 1 ? `${c.qty}× ` : ''}
                  {c.name}
                  {groupOf(cardOf(c)?.type) !== 'Other' && <small className="ty"> · {groupOf(cardOf(c)?.type).replace(/s$/, '').replace(/ie$/, 'y')}</small>}
                  {nameIn(c) !== c.name && <small> · using {nameIn(c)} for now</small>}
                  {over && <small className="overcap"> · over CA${cap}</small>}
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
    </>
      )}
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
              {bigImg && <CmdrCard src={bigImg} name={label} onMenu={(x, y) => setCtx({ slot: name, name, x, y })} />}
              <Xgrain />
            </span>
            <Doodles n={301} count={1} spots={[[60, 62], [-20, 4]]} />
          </div>
          <div className="cright">
            {/* Clicking the commander's name goes back to Discover (the COMMANDERS link does the same for keyboards). */}
            <div className="ctitle" onClick={onBack} title="Back to Discover">
              <div className="banner ht" aria-hidden="true" />
              <h1 aria-label={label}>
                <Ransom text={label.toUpperCase()} size={narrow ? (label.length > 28 ? 30 : 36) : label.length > 28 ? 44 : 54} seed={11} />
              </h1>
              {/* One tight row: colours · rank · decks · EDHREC (then the quiet deck price and salt) */}
              <div className="namerow">
                <Pips ci={ci} size={30} />
                <p className="cstamp" onClick={(e) => e.stopPropagation()}>
                  <b>NO.{no ? String(no).padStart(3, '0') : '—'}</b>
                  <span>{page?.numDecks ? page.numDecks.toLocaleString() : '—'} DECKS</span>
                  <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
                    EDHREC ↗
                  </a>
                </p>
                {page && <HeroStats price={pricesIn ? deckCost : undefined} fetched={fetchedNote(all.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))} names={names} />}
              </div>
            </div>
          </div>
        </section>

        <section className="strip" aria-label="Collection match and themes">
          <Tape style={{ top: -12, left: -14, width: 84, height: 24, transform: 'rotate(-24deg)' }} />
          <Tape style={{ top: -10, right: 60, width: 84, height: 24, transform: 'rotate(5deg)' }} />
          {SHOW_AS_COMMANDER && (
            <div className="cell">
              <span className="lbl">VIEW</span>
              <Segs label="View" value={kind} options={[['commander', 'AS CMDR'], ['average', 'AVERAGE']]} onChange={(v) => setKind(v as typeof kind)} />
            </div>
          )}
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
                  You own {sum.owned} of {sum.total} cards
                  {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
                </small>
              </span>
              {/* The % sits inside the red burst on the right, so the bar runs clean from the left. */}
              <span className="num">{page ? `${sum.pct}%` : '—'}</span>
            </div>
          </div>
            {/* Built around (EDHREC themes) sits with the deck settings, so the commander header stays clean */}
            {tags.length > 0 && (
              <div className="builtaround">
                <span>built around</span>
                <div className="hscroll" role="group" aria-label="EDHREC tags, scroll sideways for more" onScroll={snapTick}>
                  {/* EDHREC's top tags only; the rest one tap away (the chosen one always shows) */}
                  {tags.slice(0, 24).filter((t, i) => allTags || i < TAGS_SHOWN || tag === t.slug).map((t) => (
                    <button key={t.slug} aria-pressed={tag === t.slug} onClick={() => setTag(tag === t.slug ? '' : t.slug)}>
                      {t.value.toUpperCase()} <small>{t.count.toLocaleString()}</small>
                    </button>
                  ))}
                  {tags.length > TAGS_SHOWN && (
                    <button className="tagmore" aria-expanded={allTags} onClick={() => (haptic('select'), setAllTags(!allTags))}>
                      {allTags ? 'LESS' : `+${Math.min(tags.length, 24) - TAGS_SHOWN} MORE`}
                    </button>
                  )}
                </div>
              </div>
            )}
          <span className={`hint${short.length ? ' warn' : ''}`}>
            <ShortAlert items={short} inline />
            {/* A one-time tip: shown on the first visit, then gone (✕ hides it at once) */}
            {tip !== 'off' && (
              <span className="tip">
                {kind === 'average' ? (missing.length > 0 ? 'tip: tap any card to swap it · missing ones first' : 'tip: tap any card to swap or pin it') : 'every card here is in your binder'}
                <span className="cur">_</span>
                <button className="tipx" aria-label="Hide this tip" onClick={() => (haptic('tap'), setTip('off'))}>
                  ✕
                </button>
              </span>
            )}
            {receipt && missing.length > 0 && !(pricesIn && toBuyCost > 0) && (
              <a className="jump" href="#shop">
                {' '}
                · {toBuy.length} to buy{pricesIn ? ` ≈${money(toBuyCost)}` : ''} ↓
              </a>
            )}
            {/* Your decks with this commander sit on this full-width line, so the DECK cell stays as short as the
                others (a long list there left an empty band across the whole strip). */}
            {pins.in.length + pins.out.length > 0 && (
              <span className="pinsline">
                {' · '}pins:{' '}
                {(['in', 'out'] as const).flatMap((side) =>
                  pins[side].map((n) => (
                    <button key={side + n} className="pinchip" onClick={() => (haptic('undo'), setPin(n, side))} aria-label={`Unpin ${n}`} title="Tap to unpin">
                      {side === 'in' ? '📌' : '💀'} {n} ×
                    </button>
                  )),
                )}
              </span>
            )}
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

        {page && (wild || wildSet.off) && (
          <section className="wildcard" aria-label="WILDCARD">
            <b className="wtag">WILDCARD</b>
            {wild && !wildSet.off ? (
              <>
                <span className="wtxt">
                  <b>{wild.name}</b> <small>{wild.why} · for {wild.slot}</small>
                </span>
                <button className="btn" onClick={() => (haptic('success'), setSwap(wild.slot, wild.name))}>
                  SWAP IN
                </button>
                <button className="btn ink" onClick={() => setWild(s.profile, name, { roll: (wildSet.roll ?? 0) + 1 })} aria-label="Reroll the wildcard">
                  ↻ REROLL
                </button>
                <button className="btn ink" onClick={() => setWild(s.profile, name, { off: true })}>
                  OFF
                </button>
              </>
            ) : (
              <button className="btn ink" onClick={() => setWild(s.profile, name, { off: false })}>
                TURN ON
              </button>
            )}
          </section>
        )}
        {forging && (
          <div className="forgebar" role="status">
            <img src="/card-spin.webp" alt="" width={46} height={67} aria-hidden="true" />
            <span className="ft">
              <b>⚒ FORGING</b>
              <small>
                {changes} {changes === 1 ? 'swap' : 'swaps'} · leave and we’ll ask to save
              </small>
            </span>
            <button className="btn forge" onClick={() => saveDeck()} disabled={saving}>
              SAVE DECK
            </button>
            <button className="btn ink" onClick={() => (haptic('undo'), clearSwaps())}>
              DISCARD
            </button>
          </div>
        )}
        {leaving && (
          <>
            <div className="backdrop leaveback" onClick={() => leave('stay')} />
            <div className="note-pop leavenote" role="alertdialog" aria-label="Save this deck?" onClick={(e) => e.stopPropagation()}>
              <div className="lhead">
                <img src="/card-spin.webp" alt="" width={40} height={58} aria-hidden="true" />
                <div>
                  <div className="nh">
                    <span>
                      SAVE THIS <mark>DECK?</mark>
                    </span>
                  </div>
                  <p className="small">
                    {changes} {changes === 1 ? 'swap' : 'swaps'} to {label}. Saved decks keep tuning in the Forge.
                  </p>
                </div>
              </div>
              <div className="leavebtns">
                <button className="btn forge" onClick={() => leave('save')}>
                  SAVE
                </button>
                <button className="btn ink" onClick={() => leave('drop')}>
                  DISCARD
                </button>
                <button className="lkeep" onClick={() => leave('stay')}>
                  keep forging
                </button>
              </div>
            </div>
          </>
        )}
        {ctx && (
          <CardMenu
            name={ctx.name}
            at={ctx}
            profile={s.profile}
            binderName={s.binderName}
            owned={s.mine.get(norm(ctx.name)) ?? 0}
            onSwap={kind === 'average' && norm(ctx.slot) !== norm(name) ? () => setMenuFor(ctx.slot) : undefined}
            pin={norm(ctx.slot) !== norm(name) ? { side: pinOf(pins, ctx.name), canIn: statusOf(ctx.name, s.mine) === 'owned', onPin: (side) => setPin(ctx.name, side) } : undefined}
            onClose={() => setCtx(null)}
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
        {error && <p className="error">{error}</p>}
        {!page && !error && <CardSpin label="Loading EDHREC data…" />}
        {page && (
          <div className="deckgrid after-sw">
            {menuFor && <div className="backdrop" onClick={() => setMenuFor(null)} />}
            <div className="lists">
              {/* The one slim bar (owner's rule): search, then ⋮ with POWER, BUDGET, SORT, SHOW, VIEW and EDHREC's With / Without card */}
              <ToolBar q={q} setQ={setQ} now={[BRACKETS.find(([v]) => v === bracket)?.[1].toUpperCase(), budget ? BUDGETS.find(([v]) => v === budget)?.[1].toUpperCase() : '', kind === 'average' && ownMode === 'owned' ? 'OWNED' : '', kind === 'average' && cap ? '≤$' + cap : ''].filter(Boolean).join(' · ')}>
                <OptRow label="POWER">
                  <Segs label="Power" value={bracket} options={BRACKETS.map(([v, t, b]) => [v, t.toUpperCase(), b ? `Bracket ${b}` : 'Every bracket'])} onChange={setBracket} />
                </OptRow>
                <OptRow label="BUDGET">
                  <Segs label="Budget" value={budget} options={BUDGETS.map(([v, t]) => [v, t.toUpperCase()])} onChange={setBudget} />
                </OptRow>
                {kind === 'average' && (
                  <OptRow label="CARDS">
                    <Segs label="Cards" value={ownMode} options={OWN_MODES.map(([v, t]) => [v, t, v === 'owned' ? 'Only cards you own: missing ones get your best stand-in' : 'Your cards win unless a missing one is clearly better'])} onChange={(v) => setOwnMode(v as OwnMode)} />
                  </OptRow>
                )}
                {kind === 'average' && (
                  <OptRow label="BUY UNDER">
                    <Segs label="Buy under" value={capS} options={BUY_CAPS.map(([v, t]) => [v, v === '0' ? t : `CA${t}`, v === '0' ? 'No price cap on buy suggestions' : `Mark buy suggestions over CA${t} each (the deck never changes)`])} onChange={setCap} />
                  </OptRow>
                )}
                <OptRow label="VIEW">
                  <div className="viewsw mini" role="group" aria-label="Card view">
                    <button aria-pressed={view === 'grid'} aria-label="Grid view" title="Grid view" onClick={() => (haptic('select'), setView('grid'))}>
                      <GridIcon />
                    </button>
                    <button aria-pressed={view === 'list'} aria-label="List view" title="List view" onClick={() => (haptic('select'), setView('list'))}>
                      <ListIcon />
                    </button>
                  </div>
                </OptRow>
                <Pick label="SORT" value={sort} options={CSORTS} onChange={(v) => (setSort(v), setMenuFor(null))} />
                <Pick label="SHOW" value={show} options={SHOWS} onChange={(v) => (setShow(v), setMenuFor(null))} />
                    {/* EDHREC's With card / Without card: suggestions from decks that do / don't run a card */}
                    <form
                      className="cfilter"
                      onSubmit={(e) => {
                        e.preventDefault();
                        haptic('select');
                        setCf({ inc: cfDraft.inc.trim() ? [cfDraft.inc.trim()] : [], exc: cfDraft.exc.trim() ? [cfDraft.exc.trim()] : [] });
                      }}
                    >
                      <label className="sbox">
                        <span className="tab">WITH</span>
                        <input list="cfnames" value={cfDraft.inc} onChange={(e) => setCfDraft({ ...cfDraft, inc: e.target.value })} placeholder="card in the deck_" aria-label="With card" />
                      </label>
                      <label className="sbox">
                        <span className="tab">WITHOUT</span>
                        <input list="cfnames" value={cfDraft.exc} onChange={(e) => setCfDraft({ ...cfDraft, exc: e.target.value })} placeholder="card left out_" aria-label="Without card" />
                      </label>
                      <datalist id="cfnames">
                        {[...recCard.values()].slice(0, 300).map((c) => (
                          <option key={c.name} value={c.name} />
                        ))}
                      </datalist>
                      <div className="cfbtns">
                        <button className="btn">APPLY</button>
                        {(cf.inc.length > 0 || cf.exc.length > 0) && (
                          <button type="button" className="btn secondary" onClick={() => (haptic('undo'), setCf({ inc: [], exc: [] }), setCfDraft({ inc: '', exc: '' }))}>
                            CLEAR
                          </button>
                        )}
                      </div>
                      {(cf.inc.length > 0 || cf.exc.length > 0) && (
                        <p className="small cfnote" role="status">
                          {!filtered
                            ? 'Asking EDHREC…'
                            : filtered.applied
                              ? `Suggestions from ${filtered.page.numDecks?.toLocaleString()} EDHREC decks${cf.inc.length ? ` with ${cf.inc.join(', ')}` : ''}${cf.exc.length ? ` without ${cf.exc.join(', ')}` : ''}.`
                              : `EDHREC didn't filter this page from the app${cf.exc.length ? `; ${cf.exc.join(', ')} is left out of your suggestions` : ''}.`}{' '}
                          <a href={filterWebUrl(pagePath('commander', slug, bracket, tag, budget), cf)} target="_blank" rel="noreferrer">
                            Open filtered on EDHREC ↗
                          </a>
                        </p>
                      )}
                    </form>
              </ToolBar>
              {kind === 'average' && (
                <p className="coverage" role="status">
                  {coverageText(coverage([...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => ({ slot: k, name: v.name, qty: byName.get(k)?.qty ?? 1 })), (n) => statusOf(n, s.mine) === 'owned'))}
                  {ownMode === 'owned' && <span className="cmode"> · owned only</span>}
                </p>
              )}
              {noBudget && !noBracket && <small className="bnote">No EDHREC decks at this budget: showing any budget</small>}
              {noBracket && <small className="bnote">No EDHREC decks at {BRACKETS.find(([v]) => v === bracket)?.[1].toLowerCase()} power: showing all brackets</small>}
              {listed.map((l) => {
                // A swapped-in card is one of yours, so it counts as owned for SHOW.
                const own = (c: EdhCard) => statusOf(nameIn(c), s.mine) === 'owned';
                const cs = sortBy(
                  searchByText(l.cards.filter((c) => shows(show, own(c))), q, (c) => ({ name: nameIn(c), type: cardOf(c)?.type, text: cardOf(c)?.text })),
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
                    
                    <ul className={view === 'grid' ? 'zgrid' : 'zlist'}>
                      {cs.map((c) => {
                        // Every card can be swapped (the commander can't): missing ones for yours, yours for better fits.
                        const swappable = kind === 'average' && norm(c.name) !== norm(name);
                        const slot = eff.get(c.name);
                        const repl = slot && slot.name !== c.name ? slot.name : undefined;
                        const rc = repl ? recCard.get(norm(repl)) : undefined;
                        const bc = repl && !rc ? binderCard.get(norm(repl)) : undefined;
                        const now = repl ?? c.name;
                        const pin = pinOf(pins, now);
                        const mark = repl ? `${slot!.why === 'pin' ? '📌' : slot!.why === 'never' ? '💀' : slot!.why === 'auto' ? '≈' : '↔'} for ${c.name}` : pin === 'in' ? '📌 always in' : pin === 'out' ? '💀 no card of yours fits' : undefined;
                        const stat = c.potential ? `${pct((c.decks ?? 0) / c.potential)} of decks${c.lift ? ` · ${c.lift.toFixed(1)}x lift` : ''}` : c.qty && c.qty > 1 ? `×${c.qty}` : '';
                        return (
                          <Item
                            key={c.name}
                            name={now}
                            img={bc?.img ?? imgOf(rc?.id ?? c.id)}
                            card={rc ? cardOf(rc) : bc ?? (repl ? undefined : cardOf(c))}
                            s={s}
                            note={stat}
                            marker={repl ? c.name : undefined}
                            markText={mark}
                            quiet={statusOf(now, s.mine) === 'owned'}
                            onOpen={swappable ? () => setMenuFor(c.name) : undefined}
                            onMenu={(x, y) => setCtx({ slot: c.name, name: now, x, y })}
                            onClose={swappable ? () => setMenuFor(null) : undefined}
                          >
                            {menuFor === c.name && (
                              <SwapNote
                                name={c.name}
                                missing={slotInfo(c)}
                                big={imgOf(c.id, 'normal')}
                                replaced={repl}
                                loading={!recs}
                                options={suggest(c).map(optionOf)}
                                pool={binder
                                  .filter((b) => b.ci.every((x) => ci.includes(x)) && !inDeck.has(b.key) && !never.has(b.key) && b.key !== norm(name))
                                  .map((b) => optionOf({ ...recInfo.get(b.key), name: b.name, type: b.type, cmc: b.cmc }))}
                                pin={pin}
                                canPinIn={statusOf(now, s.mine) === 'owned'}
                                cmdr={label}
                                onPick={(sub) => (haptic('success'), setSwap(c.name, sub))}
                                onUndo={() => (haptic('undo'), setSwap(c.name, null))}
                                onPin={(side) => setPin(now, side)}
                                onClose={() => setMenuFor(null)}
                                deck={[name, ...[...eff.values()].map((x) => x.name)]}
                                bracket={bracketNum}
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

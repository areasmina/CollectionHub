import { haptic } from '../lib/haptics';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CardSpin } from './CardSpin';
import { BASICS, statusOf, summarize } from '../lib/compare';
import { db, type Card } from '../lib/db';
import { BRACKETS, GEARS, cachedPage, fetchFiltered, filterWebUrl, imgOf, NoPage, pagePath, showPage, type CardFilter, type EdhCard, type EdhPage } from '../lib/edhrec';
import { norm, slug as toSlug } from '../lib/names';
import { cad, fetchedNote, rateNote, shopUrl, toCad } from '../lib/prices';
import { searchByText } from '../lib/search';
import { cardsByIds, cheapest, withCheapest } from '../lib/scryfall';
import { rankSubs, recInfoOf, type SubCard } from '../lib/subs';
import { binderCandidates } from '../brain/candidates';
import { recordTaste, setWild } from '../brain/store';
import { comboBreaks, nearCombos } from '../brain/combos';
import { identityGate, offIdentity } from '../brain/identity';
import { comboAllowed } from '../brain/win';
import { brainData } from '../brain/data';
import { pickWildcards, seedOf, wildcardCandidates, WILDCARD_DEFAULT } from '../brain/wildcard';
import { detectCardSynergies, type CardSynergyMatch } from '../brain/themes';
import { arrange, noPins, pinOf, PIN_FILTER_MIN_DECKS, withPins, type PinSide } from '../lib/pins';
import { savePin } from '../lib/deckedit';
import { canLeave, freeDeckName, openDeck, setBack, setLeaveGuard } from '../lib/nav';
import { orderSections, regroup } from '../lib/sections';
import { groupOf } from '../lib/deckstats';
import { allocate } from '../lib/allocation';
import { bracketFit, karstenLands, readiness } from '../brain/validate';
import { buildDeck } from '../brain/build';
import { commanderThemes, themeOf } from '../brain/themes';
import { whyCard } from '../brain/why';
import { bracketOf } from '../lib/deckstats';
import { gameChangers } from '../lib/scryfall';
import { ReadyTiles } from './Verdict';
import { deckColour } from '../lib/deckcolor';
import { inUseChip } from '../brain/chips';
import { buyGroups, BUY_CAPS, coverage, coverageText, overCap, OWN_MODES, ownedOnly, type OwnMode } from '../brain/modes';
import { CardLine, CardTile, CmdrCard, DeckLink, money, priceSum, Segs, SaltStat, ShortAlert, usd, Pick, ToolBar, OptRow, useBinder, useStored, type Shared } from './shared';
import { shortfalls } from '../lib/copies';
import { onlyOk, ONLYS, shows, sortBy, SHOWS, SORTS, type Only, type Show, type SortKey } from '../lib/arrange';

// EDHREC's own order first on commander pages.
const CSORTS: [SortKey, string][] = [['list', 'EDHREC ORDER'], ...SORTS];
import { SwapNote } from './SwapNote';
import { ForgeMeters, ForgeSuggest, ForgeTop, useDeckDrop, useForgeMode } from './Forge';
import { AGGRESSION } from '../brain/win';
import { deckStats } from '../lib/deckstats';
import { CardMenu, type Toast } from './CardMenu';
import { CompactIcon, Pips, Ransom, RiseBars, GridIcon, ListIcon } from './zine';
import { Menu, Meter, Sheet } from './parts';

// The 'As Commander' popularity view is hidden for now; set true to bring the View switch back.
/** Where a deck opened from Discover starts: MED power (bracket 4) and MAX budget ($$$). */
const OPEN_BRACKET = 'optimized';
const OPEN_BUDGET = 'expensive';
/** The POWER dial also sets how hungry the build checks are (Min = patient, Med = hungry, Max = lethal). */
const AGGRESSION_OF: Record<string, 'patient' | 'hungry' | 'lethal'> = { '': 'hungry', upgraded: 'patient', optimized: 'hungry', cedh: 'lethal' };
const SHOW_AS_COMMANDER = false;
type View = 'grid' | 'list' | 'compact';

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
  const [cfFocus, setCfFocus] = useState<'inc' | 'exc' | null>(null);
  const [filtered, setFiltered] = useState<{ page: EdhPage; applied: boolean; pins?: boolean } | null>(null);
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
  // Your pins drive EDHREC's filter too (decks with your 📌 cards, without your 💀 ones); thin answers drop the pins.
  const fq = withPins(cf, pins);
  const fqKey = JSON.stringify(fq);
  const pinned = fq.inc.length + fq.exc.length > cf.inc.length + cf.exc.length;
  useEffect(() => {
    setFiltered(null);
    if (!recs || (!fq.inc.length && !fq.exc.length)) return;
    let live = true;
    const at = pagePath('commander', slug, bracket, tag, budget);
    void (async () => {
      const r = await fetchFiltered(at, fq, recs);
      if (!pinned || (r.applied && (r.page.numDecks ?? 0) >= PIN_FILTER_MIN_DECKS)) return live && setFiltered({ ...r, pins: pinned });
      // too few decks with the pins: your own With / Without cards alone, or the plain page
      const plain = cf.inc.length || cf.exc.length ? await fetchFiltered(at, cf, recs) : { page: recs, applied: false };
      if (live) setFiltered(plain);
    })();
    return () => void (live = false);
  }, [recs, fqKey, slug, bracket, tag, budget]); // eslint-disable-line react-hooks/exhaustive-deps
  const sugg = filtered?.page ?? recs;

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
    // Instant preview: if the exact bracket/budget page isn't cached yet, show the cached unfiltered average deck right away while the exact one loads.
    if (bracket || budget) {
      void (async () => {
        const exact = await cachedPage(path);
        if (exact) return;
        const base = await cachedPage(pagePath(kind, slug, '', tag, ''));
        if (live && base) {
          setPage((cur) => cur ?? base.page);
          if (base.page.tags?.length) setTags((cur) => (cur.length ? cur : base.page.tags));
        }
      })();
    }
    const onMainPage = (p: EdhPage) => {
      if (!live) return;
      setPage(p);
      if (p.tags?.length) setTags((cur) => (cur.length ? cur : p.tags));
    };
    const onRecsPage = (p: EdhPage) => {
      if (!live) return;
      setRecs(p);
      if (p.tags?.length) setTags((cur) => (cur.length ? cur : p.tags));
    };
    // Priority 1: fetch the actual deck (`page`) FIRST so it never queues behind tags or recommendations.
    showPage(path, onMainPage)
      .catch((e) => {
        if (!(e instanceof NoPage) || !budget) throw e;
        if (live) setNoBudget(true);
        return showPage(pagePath(kind, slug, bracket, tag, ''), onMainPage);
      })
      .catch((e) => {
        if (!(e instanceof NoPage) || !bracket) throw e;
        if (live) setNoBracket(true);
        return showPage(pagePath(kind, slug, '', tag, ''), onMainPage);
      })
      .catch((e) => live && setError(e.message));
    // Priority 2: recommendations and unfiltered tags run right behind the main deck.
    if (kind === 'average')
      showPage(pagePath('commander', slug, bracket, tag, budget), onRecsPage)
        .catch(() => showPage(pagePath('commander', slug, bracket, tag, ''), onRecsPage))
        .catch(() => showPage(pagePath('commander', slug, '', tag, budget), onRecsPage))
        .catch(() => showPage(pagePath('commander', slug), onRecsPage))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [path]);
  useEffect(() => {
    showPage(pagePath('commander', slug), (p) => setTags(p.tags)).catch(() => setTags([]));
  }, [slug]);

  // EDHREC lists carry Scryfall ids but no prices: prices/images/types from Scryfall (cached a week), cheapest printing's price.
  // Load the 99-card deck (`page`) first and only look up cheapest printings for cards in the deck (not all 250 recommendations).
  const [cards, setCards] = useState<Map<string, Card>>(new Map());
  useEffect(() => {
    const want = ids(page);
    let live = true;
    if (want.length)
      cardsByIds(want, undefined, (partial) => {
        if (live) setCards((prev) => new Map([...prev, ...partial]));
      })
        .then(async (m) => {
          if (!live) return;
          setCards((prev) => new Map([...prev, ...m]));
          const nonBasics = [...m.values()].map((c) => c.name).filter((n) => !BASICS.has(norm(n)));
          await cheapest(nonBasics, (ch) => {
            if (live) setCards((prev) => new Map([...prev, ...[...m].map(([id, c]) => [id, withCheapest(c, ch)!] as const)]));
          });
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [page]);
  useEffect(() => {
    const pageSet = new Set(ids(page));
    const want = ids(recs).filter((id) => !pageSet.has(id));
    let live = true;
    if (want.length)
      cardsByIds(want, undefined, (partial) => {
        if (live) setCards((prev) => new Map([...prev, ...partial]));
      }).catch(() => {});
    return () => {
      live = false;
    };
  }, [recs]);

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
  // Colour identity is a hard rule on every path in: candidates, WILDCARD, saved swaps and pins (identity.ts).
  const cmdr = useLiveQuery(() => db.cards.where('key').equals(norm(name)).first(), [name]);
  const ciKnown = cmdr?.ci ?? page?.card?.ci;
  const ci = ciKnown ?? [];
  const binderCi = new Map(binder.map((c) => [c.key, c.ci]));
  const ciOf = (n: string) => binderCi.get(norm(n));
  // Until the commander's identity is known nothing new is offered, and saved swaps are left as they are.
  const fits = ciKnown ? identityGate(ci, ciOf) : () => false;
  const off = new Set(ciKnown ? offIdentity([...Object.values(swaps), ...pins.in], ci, ciOf).map(norm) : []);
  const swapsOk = Object.fromEntries(Object.entries(swaps).filter(([, r]) => !off.has(norm(r))));
  const pinsOk = { ...pins, in: pins.in.filter((p) => !off.has(norm(p))) };
  // Replacement candidates: owned cards EDHREC recommends for this commander, minus the ones you never use.
  const owned = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !never.has(norm(c.name)) && fits(c.name));
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
    swapsOk,
    pinsOk,
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
  const tagLabel = tags.find((t) => t.slug === tag)?.value;
  const autoThemes = commanderThemes(cmdr ?? (page?.card?.id ? cards.get(page.card.id) : undefined), tags);
  const focusStack = tagLabel ? [themeOf(tagLabel), ...autoThemes.filter((t) => t.label.toLowerCase() !== tagLabel.toLowerCase())] : autoThemes;
  const suggest = (c: EdhCard, ctx?: Parameters<typeof rankSubs>[3]) => rankSubs(slotInfo(c), binderCandidates(candidates, binder, ci, never).filter((x) => !inDeck.has(norm(x.name))), 3, ctx);
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
    let p = await db.profiles.get(s.profile);
    if (!p) {
      p = { id: s.profile, name: s.binderName ?? 'Binder 1' };
      await db.profiles.put(p);
    }
    const deck = { ...(p.swaps?.[path] ?? {}) };
    const was = deck[missingName] ?? missingName;
    if (replacement && !fits(replacement)) return; // never write a card outside the commander's colours
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
    let p = await db.profiles.get(s.profile);
    if (!p) {
      p = { id: s.profile, name: s.binderName ?? 'Binder 1' };
      await db.profiles.put(p);
    }
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
    let p = await db.profiles.get(s.profile);
    if (!p) return;
    const { [path]: _, ...rest } = p.swaps ?? {};
    await db.profiles.update(s.profile, { swaps: rest });
  }

  // The forging zone: your first swap on this deck (or clicking ⚒ FORGE & EDIT) starts it; leaving with unsaved swaps asks whether to keep the deck.
  const [manualForge, setManualForge] = useState(false);
  const changes = Object.keys(swapsOk).length;
  const forging = kind === 'average' && (changes > 0 || manualForge);
  const [leaving, setLeaving] = useState<((go: boolean) => void) | null>(null);
  const live = useRef({ changes, saveDeck, clearSwaps });
  live.current = { changes, saveDeck, clearSwaps };
  useEffect(() => {
    setLeaveGuard(() => (live.current.changes > 0 ? new Promise<boolean>((go) => (haptic('warn'), setLeaving(() => go))) : Promise.resolve(true)));
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
  const [buyOpen, setBuyOpen] = useState(false);
  const closeBuy = useCallback(() => setBuyOpen(false), []);
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
      .filter((n) => !never.has(norm(n.add)) && fits(n.add))
      .map((n) => ({ add: n.add, owned: n.owned, allowed: comboAllowed(n.combo, bracketNum), cards: n.combo.cards }));
    const pick = pickWildcards(wildcardCandidates(candidates, near), 1, seedOf(name) + (wildSet.roll ?? 0), inDeck)[0];
    if (!pick) return undefined;
    // It takes the slot of the least played non-land card that is still EDHREC's own, not pinned and no combo piece.
    const slot = [...eff.entries()]
      .filter(([k, v]) => k !== name && v.name === k && byName.has(k) && !/\bLand\b/.test(slotInfo(byName.get(k)!).type ?? '') && !pins.in.includes(k) && !comboBreaks(k, deckNames).length)
      .sort((a, b) => (recInfo.get(norm(a[0]))?.incl ?? 1) - (recInfo.get(norm(b[0]))?.incl ?? 1))[0]?.[0];
    return slot ? { ...pick, slot } : undefined;
  })();
  // Build Readiness, Bracket Fit and "Why this card?" (brain/validate.ts, brain/why.ts: logic there, shown here).
  const [gc, setGc] = useState<Set<string> | null>(null);
  useEffect(() => void gameChangers().then((g) => setGc(g ?? null)).catch(() => {}), []);
  const edhByNorm = new Map([...all, ...(sugg?.lists ?? []).flatMap((l) => l.cards)].map((c) => [norm(c.name), c as EdhCard]));
  const cardByName = (n: string) => {
    const ec = edhByNorm.get(norm(n));
    return (ec && cardOf(ec)) ?? binderCard.get(norm(n)) ?? (norm(n) === norm(name) ? cmdr : undefined);
  };
  const deckNow = [{ name, qty: 1 }, ...[...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => ({ name: v.name, qty: byName.get(k)?.qty ?? 1 }))];
  const aggression = AGGRESSION_OF[bracket] ?? 'hungry';
  const ready = page && kind === 'average' ? readiness({ deck: deckNow, cardOf: cardByName, commander: name, identity: ci, bracket: bracketNum, aggression }) : undefined;
  const fit = page && kind === 'average' ? bracketFit(bracketOf(deckNow.map((c) => ({ name: c.name, card: cardByName(c.name) })), gc), bracketNum) : undefined;
  const brainCtx = { deck: deckNow, cardOf: cardByName, commander: name, bracket: bracketNum, aggression, taste: profile?.brain?.taste, focus: focusStack[0] };
  const whyOf = (slot: string) => {
    const sl = eff.get(slot);
    const now = sl?.name ?? slot;
    const how = sl && sl.name !== slot ? (sl.why === 'pin' ? 'pin' : sl.why === 'auto' || sl.why === 'never' ? 'stand-in' : 'swap') : undefined;
    return whyCard({ name: now, ctx: brainCtx, rec: recInfo.get(norm(now)), how, slot: how ? slot : undefined, gc });
  };
  async function forgeFromBinder() {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const pool = binderCandidates(owned, binder, ci, never);
      const landsN = karstenLands({ avgMv: forgeSt.avgMv || 3.1, cheapFlow: forgeSt.roles.ramp + forgeSt.roles.draw, bracket: bracketNum });
      const built = buildDeck({ commander: name, identity: ci, owned: pool, cardOf: cardByName, bracket: bracketNum, aggression, gc, focus: focusStack, pins: pinsOk, lands: landsN });
      const deckName = await freeDeckName(s.profile, `${name} (binder build)`);
      await db.decks.add({ profile: s.profile, name: deckName, commander: name, source: bracket || undefined, cards: built.cards, updated: Date.now() });
      haptic('success');
      openDeck(deckName);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  // The Forge on the commander page: focus mode from your first swap; suggestions go into slots (drag, or tap then tap).
  useForgeMode(forging);
  const [placing, setPlacing] = useState<string | null>(null);
  const slotOf = new Map([...eff].map(([slot, x]) => [norm(x.name), slot]));
  const swapInto = (onto: string, card: string) => {
    const slot = slotOf.get(norm(onto)) ?? onto;
    if (norm(slot) === norm(name) || !byName.has(slot)) return;
    haptic('success');
    setPlacing(null);
    void setSwap(slot, card);
  };
  const drop = useDeckDrop(swapInto);
  const forgeSt = deckStats(deckNow, cardByName, name);
  const lastSwap = Object.keys(swapsOk).pop();
  const undoLast = lastSwap ? { text: `${swapsOk[lastSwap]} for ${lastSwap}`, run: () => void setSwap(lastSwap, null) } : undefined;
  const bigImg = cmdr?.img?.replace('/small/', '/normal/') ?? imgOf(page?.card?.id, 'normal');
  const label = name.split(' // ')[0];
  const pw = BRACKETS.find(([v]) => v === bracket);
  const powerLabel = pw && (pw[2] ? `${pw[1].toUpperCase()} · B${pw[2]}` : pw[1].toUpperCase());
  // Grid (card images) is the default; the choice is remembered on this device.
  // Phones start on the compact list (name · mana · price · owned), owner's call Nov 6.
  const [view, setViewState] = useState<View>(() => {
    try {
      const v = localStorage.getItem('ch:view');
      return v === 'list' || v === 'grid' || v === 'compact' ? v : narrow ? 'compact' : 'grid';
    } catch {
      return narrow ? 'compact' : 'grid';
    }
  });
  const setView = (v: View) => {
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
  const [show, setShow] = useState<Show>('all');
  useEffect(() => {
    setShow('all');
  }, [slug]);
  const [only, setOnly] = useState<Only>('all'); // Game Changers / price bands, for this visit

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
  // TO BUY marks: completes a two-card combo with a card in this deck (Commander Spellbook data)
    const activePinnedName = cf.inc[0] || pins.in[0];
  const activePinnedCard = activePinnedName ? cardByName(activePinnedName) : undefined;
  const synergyHint = activePinnedName ? detectCardSynergies(activePinnedName, activePinnedCard, tags) : null;

  const comboWith = (n: string) => brainData().combos?.get(norm(n))?.map((k) => k.cards.find((x) => norm(x) !== norm(n))!).find((o) => o && deckNames.some((d) => norm(d) === norm(o)));
  // What the deck takes from your binder and what's left to buy: said once, in the strip.
  const covText = coverageText(coverage([...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => ({ slot: k, name: v.name, qty: byName.get(k)?.qty ?? 1 })), (n) => statusOf(n, s.mine) === 'owned'));
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
      <h2>*** TO BUY ***</h2>
      <hr />
      <div className="sub">
        {missing.length} missing{pricesIn && toBuyCost > 0 ? ` · ≈${cad(toBuyCost)} to complete` : ''} · ≈CA$ at your shop
      </div>
      {buyGroups(missing, (c) => recInfo.get(norm(c.name))?.incl, (c) => toCad(cardOf(c)?.usd)).map((g) => (
        <div key={g.label} className="rgroup">
          <div className="rgh">
            <span>{g.label}</span>
            {pricesIn && g.total > 0 && <span>≈{cad(g.total)}</span>}
          </div>
          <ul>
            {g.items.map((c) => {
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
                  {gc?.has(norm(c.name)) && <small className="rmark gc" title="Game Changer (bracket 4 and up)"> GC</small>}
                  {comboWith(c.name) && <small className="rmark combo" title={`Combo with ${comboWith(c.name)}`}> COMBO</small>}
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
        </div>
      ))}
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
      <main className="dpage">
        {/* THE OVERHAUL, deck view: hero → one strip → one toolbar → flat grid. The hero is the loud frame (ransom name,
            one red slash); everything under it is quiet. Each fact once: match % here, deck cost in the strip. */}
        <section className="vhero" aria-label={`${label}: commander`}>
          <div className="vcard">
            {bigImg && <CmdrCard src={bigImg} name={label} onMenu={(x, y) => setCtx({ slot: name, name, x, y })} />}
          </div>
          <div className="vinfo">
            {/* the one red slash sits behind the name only, never behind text you read */}
            <div className="vname">
              <span className="vslash" aria-hidden="true" />
              <h1 aria-label={label}>
                <Ransom text={label.toUpperCase()} size={narrow ? (label.length > 28 ? 26 : 32) : label.length > 28 ? 40 : 52} seed={11} />
              </h1>
            </div>
            {/* the quiet monospace line: colours · rank · decks · salt · EDHREC · your decks with this commander */}
            <p className="vmeta">
              <Pips ci={ci} size={20} />
              <span>NO.{no ? String(no).padStart(3, '0') : '—'}</span>
              <span>{page?.numDecks ? page.numDecks.toLocaleString() : '—'} decks</span>
              {page && <SaltStat names={names} />}
              <a href={`https://edhrec.com/${path}`} target="_blank" rel="noreferrer">
                EDHREC ↗
              </a>
              {mine.length > 0 && !saved && (
                <span className="mydecks">
                  your deck{mine.length > 1 ? 's' : ''}:{' '}
                  {mine.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ', '}
                      <DeckLink name={d.name} />
                    </span>
                  ))}
                </span>
              )}
            </p>
            <div className="vmatch" aria-label={`${sum.pct}% match: you own ${sum.owned} of ${sum.total} cards in ${s.binderName}`}>
              <b className="num">{page ? `${sum.pct}%` : '—'}</b>
              <span className="vbar">
                <Meter pct={page ? sum.pct : 0} label={`Collection match ${sum.pct}%`} />
                <small>
                  collection match · you own {sum.owned} of {sum.total}
                  {sum.other > 0 ? ` · ${sum.other} in ${s.otherName}` : ''}
                </small>
              </span>
            </div>
            {ready && <ReadyTiles ready={ready} fit={fit} bracket={bracket} onBracketChange={setBracket} brackets={BRACKETS} />}
          </div>
        </section>

        {/* The one strip: POWER · what the deck needs and costs · short / TO BUY / FORGE. Everything else is behind ⋮.
            It stays while a new power or theme loads (no jump), saying so in its status line. */}
        {!error && (
          <section className={`dstrip${forging ? ' forging' : ''}`} aria-label="Deck status" aria-busy={!page}>

            <p className="dstatus" role="status">
              {!page ? (
                <span>loading EDHREC data…</span>
              ) : kind === 'average' ? (
                <>
                  <span className="coverage">{covText}</span>
                  {pricesIn && deckCost > 0 && (
                    <span className="dcost" title={`What the whole deck costs (cheapest printings) ${fetchedNote(all.map((c) => cardOf(c)?.priceAt ?? cardOf(c)?.at))}`}>
                      deck ≈{cad(deckCost)}
                    </span>
                  )}
                  {ownMode === 'owned' && <span className="cmode">owned only</span>}
                  {filtered?.pins && <span className="cmode">suggestions from {filtered.page.numDecks?.toLocaleString()} EDHREC decks that fit your pins</span>}
                </>
              ) : (
                <span>every card here is in your binder</span>
              )}
            </p>
            <div className="dacts">
              <ShortAlert items={short} inline />
              {page && receipt && !forging && (
                <button type="button" className={`u-btn tobuy${missing.length ? ' money' : ''}`} aria-haspopup="dialog" aria-expanded={buyOpen} onClick={() => (haptic('open'), setBuyOpen(true))}>
                  {missing.length > 0 ? (
                    <>
                      TO BUY <b>{toBuy.length}</b>
                      {pricesIn && toBuyCost > 0 && <span className="u-sticker">≈{cad(toBuyCost)}</span>}
                    </>
                  ) : (
                    <>
                      PULL <b>{pull.length}</b>
                    </>
                  )}
                </button>
              )}
              {page && kind === 'average' && !forging && (
                <button type="button" className="u-btn primary forge" onClick={() => (haptic('open'), setManualForge(true))} title="Open The Forge: live role meters and ranked suggestions">
                  ⚒ FORGE
                </button>
              )}
            </div>
          </section>
        )}

        {page && (wild || wildSet.off) && (
          <section className="wildcard" aria-label="WILDCARD">
            <b className="wtag">HIDDEN GEM · WILDCARD</b>
            {wild && !wildSet.off ? (
              <>
                <div className="wbody">
                  {(cardByName(wild.name)?.img ?? imgOf(recCard.get(norm(wild.name))?.id)) && (
                    <img src={cardByName(wild.name)?.img ?? imgOf(recCard.get(norm(wild.name))?.id)} alt="" className="wthumb" loading="lazy" />
                  )}
                  <div className="wtxt">
                    <b>{wild.name}</b>
                    <div className="wmeta">
                      <span className="wbadge">{wild.why}</span>
                      <span>↔ for {wild.slot}</span>
                    </div>
                  </div>
                </div>
                <div className="wacts">
                  <button className="btn btn-swap-in" onClick={() => (haptic('success'), setSwap(wild.slot, wild.name))}>
                    SWAP IN
                  </button>
                  <button className="btn ink" onClick={() => setWild(s.profile, name, { roll: (wildSet.roll ?? 0) + 1 })} aria-label="Reroll the wildcard">
                    ↻ REROLL
                  </button>
                  <button className="btn ink" onClick={() => setWild(s.profile, name, { off: true })}>
                    OFF
                  </button>
                </div>
              </>
            ) : (
              <button className="btn ink" onClick={() => setWild(s.profile, name, { off: false })}>
                TURN ON
              </button>
            )}
          </section>
        )}
        {forging && <ForgeTop label={label} sub={changes ? `${changes} ${changes === 1 ? 'swap' : 'swaps'} · leave and we’ll ask to save` : 'Forge mode · tap or drag cards to tune'} undo={undoLast} onLeave={changes === 0 && manualForge ? () => { setManualForge(false); window.scrollTo(0, 0); } : onBack} onSave={() => saveDeck()} saving={saving} />}
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
          <div className={`deckgrid after-sw${forging ? ' forge-split' : ''}`}>
            {menuFor && <div className="backdrop" onClick={() => setMenuFor(null)} />}
            {forging && (
              <div className="dside forge-analysis">
                <ForgeMeters st={forgeSt} range={(r) => (r === 'tutors' ? undefined : AGGRESSION[aggression][r])} match={sum.pct} />
              </div>
            )}
            <div className="lists" {...(forging ? drop : {})}>
              {/* The one slim bar (owner's rule): search, quick view/filter pills on wider screens, then ⋮ with POWER, GEAR, SORT, SHOW, VIEW and EDHREC's With / Without card */}
              <ToolBar
                q={q}
                setQ={setQ}
                now={[tag ? `#${tags.find((t) => t.slug === tag)?.value.toUpperCase() ?? tag}` : '', `${GEARS.find(([v]) => v === budget)?.[1]} GEAR`, pins.in.length + pins.out.length ? `${pins.in.length + pins.out.length} PINNED` : '', kind === 'average' && ownMode === 'owned' ? 'OWNED' : '', kind === 'average' && cap ? '≤$' + cap : '', only !== 'all' ? ONLYS.find(([v]) => v === only)?.[1] : ''].filter(Boolean).join(' · ')}
                quick={
                  <>
                    <div className="qsegs" role="group" aria-label="Quick filter">
                      {(['all', 'owned', 'missing'] as Show[]).map((v) => (
                        <button key={v} type="button" aria-pressed={show === v} onClick={() => (haptic('select'), setShow(v), setMenuFor(null))}>
                          {v === 'all' ? 'ALL' : v === 'owned' ? 'OWNED' : 'MISSING'}
                        </button>
                      ))}
                    </div>
                    <div className="qsegs qviews" role="group" aria-label="Quick view">
                      <button type="button" aria-pressed={view === 'grid'} title="Grid view" onClick={() => (haptic('select'), setView('grid'))}>
                        <GridIcon />
                      </button>
                      <button type="button" aria-pressed={view === 'list'} title="List view" onClick={() => (haptic('select'), setView('list'))}>
                        <ListIcon />
                      </button>
                      <button type="button" aria-pressed={view === 'compact'} title="Compact list" onClick={() => (haptic('select'), setView('compact'))}>
                        <CompactIcon />
                      </button>
                    </div>
                  </>
                }
              >
                {/* Primary CTA at top: Just build it! */}
                {kind === 'average' && binder.length > 0 && (
                  <div className="just-build-banner top-action">
                    <button
                      type="button"
                      className="btn-just-build"
                      onClick={() => void forgeFromBinder()}
                      disabled={saving}
                      title="Build a 100-card deck from your binder using the brain (Karsten mana math + strategy stack)"
                    >
                      
                      <span className="build-text">
                        <strong>JUST BUILD IT!</strong>
                        <small>Auto-craft 100 cards from your binder</small>
                      </span>
                      <span className="build-arrow">⚒ BUILD 100 →</span>
                    </button>
                  </div>
                )}
                {/* EDHREC's themes (built around): its top tags, the rest one tap away; the chosen one always shows */}
                {tags.length > 0 && (
                  <OptRow label="THEME">
                    <div className="themes" role="group" aria-label="EDHREC themes">
                      {tags.slice(0, 24).filter((t, i) => allTags || i < TAGS_SHOWN || tag === t.slug).map((t) => (
                        <button key={t.slug} type="button" className="u-chip" aria-pressed={tag === t.slug} onClick={() => (haptic('select'), setTag(tag === t.slug ? '' : t.slug))}>
                          {t.value.toUpperCase()} <small>{t.count.toLocaleString()}</small>
                        </button>
                      ))}
                      {tags.length > TAGS_SHOWN && (
                        <button type="button" className="u-chip ghost tagmore" aria-expanded={allTags} onClick={() => (haptic('select'), setAllTags(!allTags))}>
                          {allTags ? 'LESS' : `+${Math.min(tags.length, 24) - TAGS_SHOWN} MORE`}
                        </button>
                      )}
                    </div>
                  </OptRow>
                )}
                {pins.in.length + pins.out.length > 0 && (
                  <OptRow label="PINS">
                    <div className="themes" role="group" aria-label="Your pins: tap to unpin">
                      {(['in', 'out'] as const).flatMap((side) =>
                        pins[side].map((n) => (
                          <button key={side + n} type="button" className="u-chip pinchip" onClick={() => (haptic('undo'), setPin(n, side))} aria-label={`Unpin ${n}`} title="Tap to unpin">
                            {side === 'in' ? '📌' : '💀'} {n} ×
                          </button>
                        )),
                      )}
                    </div>
                  </OptRow>
                )}
                <OptRow label="GEAR">
                  <Segs label="Gear" value={budget} options={GEARS} onChange={setBudget} />
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
                    <button aria-pressed={view === 'compact'} aria-label="Compact list" title="Compact list: name · mana · price · owned" onClick={() => (haptic('select'), setView('compact'))}>
                      <CompactIcon />
                    </button>
                  </div>
                </OptRow>
                <div className="pickgrid">
                  <Pick label="SORT" value={sort} options={CSORTS} onChange={(v) => (setSort(v), setMenuFor(null))} />
                  <Pick label="SHOW" value={show} options={SHOWS} onChange={(v) => (setShow(v), setMenuFor(null))} />
                  <Pick label="ONLY" value={only} options={ONLYS} onChange={(v) => (setOnly(v), setMenuFor(null))} />
                </div>
                    {/* EDHREC's With card / Without card: suggestions from decks that do / don't run a card */}
                    <form
                      className="cfilter"
                      onSubmit={(e) => {
                        e.preventDefault();
                        haptic('select');
                        const inc = cfDraft.inc.trim();
                        const exc = cfDraft.exc.trim();
                        if (inc && !pins.in.includes(inc)) void setPin(inc, 'in');
                        if (exc && !pins.out.includes(exc)) void setPin(exc, 'out');
                        setCfFocus(null);
                        setCf({ inc: inc ? [inc] : [], exc: exc ? [exc] : [] });
                      }}
                    >
                      <div className="cglance-wrap">
                        <label className="sbox">
                          <span className="tab">WITH</span>
                          <input
                            list="cfnames"
                            value={cfDraft.inc}
                            onChange={(e) => setCfDraft({ ...cfDraft, inc: e.target.value })}
                            onFocus={() => setCfFocus('inc')}
                            onBlur={() => setTimeout(() => setCfFocus(null), 200)}
                            placeholder="card in the deck_"
                            aria-label="With card"
                          />
                        </label>
                        {cfFocus === 'inc' && cfDraft.inc.trim().length >= 2 && (
                          <div className="cglance-popover" role="listbox">
                            {[...recCard.values(), ...binder]
                              .filter((c, idx, arr) => arr.findIndex((x) => norm(x.name) === norm(c.name)) === idx)
                              .filter((c) => norm(c.name).includes(norm(cfDraft.inc)) || (('type' in c && typeof c.type === 'string' ? c.type : cardByName(c.name)?.type) ?? '').toLowerCase().includes(norm(cfDraft.inc)))
                              .slice(0, 8)
                              .map((m) => {
                                const id = 'id' in m ? m.id : undefined;
                                const img = ('img' in m && m.img) || imgOf(id, 'small');
                                const isOwned = statusOf(m.name, s.mine) === 'owned';
                                return (
                                  <div
                                    key={m.name}
                                    className="cglance-item"
                                    role="option"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCfDraft({ ...cfDraft, inc: m.name });
                                      setCfFocus(null);
                                      haptic('select');
                                    }}
                                  >
                                    {img && <img src={img} alt="" className="cglance-thumb" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                    <div className="cglance-meta">
                                      <span className="cglance-name">{m.name}</span>
                                      <span className="cglance-sub">{('type' in m && typeof m.type === 'string' ? m.type : cardByName(m.name)?.type) ?? 'Card'}</span>
                                    </div>
                                    {isOwned && <span className="cglance-badge">✓ OWNED</span>}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                      <div className="cglance-wrap">
                        <label className="sbox">
                          <span className="tab">WITHOUT</span>
                          <input
                            list="cfnames"
                            value={cfDraft.exc}
                            onChange={(e) => setCfDraft({ ...cfDraft, exc: e.target.value })}
                            onFocus={() => setCfFocus('exc')}
                            onBlur={() => setTimeout(() => setCfFocus(null), 200)}
                            placeholder="card left out_"
                            aria-label="Without card"
                          />
                        </label>
                        {cfFocus === 'exc' && cfDraft.exc.trim().length >= 2 && (
                          <div className="cglance-popover" role="listbox">
                            {[...recCard.values(), ...binder]
                              .filter((c, idx, arr) => arr.findIndex((x) => norm(x.name) === norm(c.name)) === idx)
                              .filter((c) => norm(c.name).includes(norm(cfDraft.exc)) || (('type' in c && typeof c.type === 'string' ? c.type : cardByName(c.name)?.type) ?? '').toLowerCase().includes(norm(cfDraft.exc)))
                              .slice(0, 8)
                              .map((m) => {
                                const id = 'id' in m ? m.id : undefined;
                                const img = ('img' in m && m.img) || imgOf(id, 'small');
                                const isOwned = statusOf(m.name, s.mine) === 'owned';
                                return (
                                  <div
                                    key={m.name}
                                    className="cglance-item"
                                    role="option"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setCfDraft({ ...cfDraft, exc: m.name });
                                      setCfFocus(null);
                                      haptic('select');
                                    }}
                                  >
                                    {img && <img src={img} alt="" className="cglance-thumb" loading="lazy" onError={(e) => (e.currentTarget.style.display = 'none')} />}
                                    <div className="cglance-meta">
                                      <span className="cglance-name">{m.name}</span>
                                      <span className="cglance-sub">{('type' in m && typeof m.type === 'string' ? m.type : cardByName(m.name)?.type) ?? 'Card'}</span>
                                    </div>
                                    {isOwned && <span className="cglance-badge">✓ OWNED</span>}
                                  </div>
                                );
                              })}
                          </div>
                        )}
                      </div>
                      <datalist id="cfnames">
                        {[...recCard.values()].slice(0, 300).map((c) => (
                          <option key={c.name} value={c.name} />
                        ))}
                      </datalist>
                      <div className="cfbtns" onPointerDown={() => setCfFocus(null)}>
                        <button className="btn">APPLY</button>
                        {(cf.inc.length > 0 || cf.exc.length > 0) && (
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              haptic('undo');
                              if (cf.inc[0] && pins.in.includes(cf.inc[0])) void setPin(cf.inc[0], 'in');
                              if (cf.exc[0] && pins.out.includes(cf.exc[0])) void setPin(cf.exc[0], 'out');
                              setCf({ inc: [], exc: [] });
                              setCfDraft({ inc: '', exc: '' });
                            }}
                          >
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
                              : `EDHREC didn't filter this page from the app${cf.inc.length ? `; ${cf.inc.join(', ')} is pinned in your deck` : ''}${cf.exc.length ? `; ${cf.exc.join(', ')} is left out of your suggestions` : ''}.`}{' '}
                          <a href={filterWebUrl(pagePath('commander', slug, bracket, tag, budget), cf)} target="_blank" rel="noreferrer">
                            Open filtered on EDHREC ↗
                          </a>
                        </p>
                      )}
                      {synergyHint && (
                        <div className="synergy-autotune-card" role="region" aria-label="Synergy recommendation">
                          <div className="syn-info">
                            <span className="syn-badge">SYNERGY DETECTED</span>
                            <p>
                              <strong>{synergyHint.card}</strong> {synergyHint.explanation}!
                            </p>
                          </div>
                          <button
                            type="button"
                            className="syn-btn"
                            onClick={() => {
                              haptic('success');
                              if (synergyHint.themeSlug) {
                                setTag(synergyHint.themeSlug);
                              }
                              setToast({ text: `Deck auto-tuned to ${synergyHint.card} synergies!` });
                            }}
                          >
                            TUNE DECK TO THIS SYNERGY
                          </button>
                        </div>
                      )}
                      {!synergyHint && cf.inc.length > 0 && (
                        <div className="synergy-autotune-card" role="region" aria-label="Synergy recommendation">
                          <div className="syn-info">
                            <span className="syn-badge">CARD PINNED</span>
                            <p>
                              <strong>{cf.inc[0]}</strong> is pinned in your deck.
                            </p>
                          </div>
                          <button
                            type="button"
                            className="syn-btn"
                            onClick={() => {
                              haptic('success');
                              setToast({ text: `Suggestions auto-tuned for ${cf.inc[0]}!` });
                            }}
                          >
                            AUTO-TUNE SUGGESTIONS
                          </button>
                        </div>
                      )}
                    </form>
              </ToolBar>
              {noBudget && !noBracket && <small className="bnote">No EDHREC decks in {GEARS.find(([v]) => v === budget)?.[1]} gear: showing every budget (2ND)</small>}
              {noBracket && <small className="bnote">No EDHREC decks at {BRACKETS.find(([v]) => v === bracket)?.[1].toLowerCase()} power: showing all brackets</small>}
              {listed.map((l) => {
                // A swapped-in card is one of yours, so it counts as owned for SHOW.
                const own = (c: EdhCard) => statusOf(nameIn(c), s.mine) === 'owned';
                const cs = sortBy(
                  searchByText(l.cards.filter((c) => shows(show, own(c)) && onlyOk(only, { gc: !!gc?.has(norm(nameIn(c))), cad: toCad(cardByName(nameIn(c))?.usd) })), q, (c) => ({ name: nameIn(c), type: cardOf(c)?.type, text: cardOf(c)?.text })),
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
                    
                    <ul className={view === 'grid' ? 'zgrid' : view === 'compact' ? 'zlist zcompact' : 'zlist'}>
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
                            onOpen={swappable ? () => (placing ? swapInto(now, placing) : setMenuFor(c.name)) : undefined}
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
                                options={suggest(c, brainCtx).map(optionOf)}
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
                                whyCard={whyOf(c.name)}
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
            {forging ? (
              <div className="dside forge-suggestions">
                <ForgeSuggest
                  profile={s.profile}
                  deck={deckNow}
                  commander={name}
                  bracket={bracketNum}
                  aggression={aggression}
                  candidates={[...recInfo.values()].filter((c) => !never.has(norm(c.name))).concat(binderCandidates([], binder, ci, never))}
                  cardOf={cardByName}
                  ownedOf={(n) => s.mine.get(norm(n)) ?? 0}
                  imgOf={(n) => optionOf({ name: n }).img}
                  themes={tags}
                  theme={tag}
                  placing={placing}
                  onPlace={setPlacing}
                  loading={!recs}
                  buy={receipt || undefined}
                />
              </div>
            ) : null}
          </div>
        )}
        {/* TO BUY / PULL: a 360px drawer on wide screens, a bottom sheet on phones */}
        {buyOpen && receipt && !forging && (
          <Sheet label={missing.length > 0 ? 'To buy' : 'Pull list'} onClose={closeBuy}>
            {receipt}
          </Sheet>
        )}
      </main>
    </>
  );
}

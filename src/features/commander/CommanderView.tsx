import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useRef, useState } from 'react';
import { allocate } from '../../lib/allocation';
import { onlyOk, ONLYS, shows, sortBy, SHOWS, SORTS, type Only, type Show, type SortKey } from '../../lib/arrange';
import { pickBest, scanBestFit, type FitResult } from '../../lib/bestfit';
import { notOffered } from '../../lib/collsearch';
import { BASICS, statusOf, summarize } from '../../lib/compare';
import { shortfalls, takenBy } from '../../lib/copies';
import { db, type Card } from '../../lib/db';
import { deckColour } from '../../lib/deckcolor';
import { ownShare } from '../../lib/deckshare';
import { bracketOf, deckStats, groupOf } from '../../lib/deckstats';
import { BRACKETS, GEARS, cachedPage, fetchFiltered, imgOf, NoPage, pagePath, showPage, type CardFilter, type EdhCard, type EdhPage } from '../../lib/edhrec';
import { haptic } from '../../lib/haptics';
import { canLeave, freeDeckName, openDeck, openDiscoverSub, openGuidedWithCommander, setBack, setLeaveGuard } from '../../lib/nav';
import { exploreColours, sendToExplore } from '../../lib/journey';
import { JourneyBar } from '../journey/JourneyBar';
import { norm, slug as toSlug } from '../../lib/names';
import { arrange, noPins, pinOf, PIN_FILTER_MIN_DECKS, withPins, type PinSide } from '../../lib/pins';
import { cad, toCad } from '../../lib/prices';
import { cardsByIds, cheapest, gameChangers, withCheapest } from '../../lib/scryfall';
import { searchByText } from '../../lib/search';
import { orderSections, regroup } from '../../lib/sections';
import { rankSubs, recInfoOf, type SubCard } from '../../lib/subs';
import { buildDeck } from '../../brain/build';
import { binderCandidates } from '../../brain/candidates';
import { inUseChip } from '../../brain/chips';
import { comboBreaks, nearCombos } from '../../brain/combos';
import { brainData } from '../../brain/data';
import { identityGate, offIdentity } from '../../brain/identity';
import { buyGroups, BUY_CAPS, coverage, coverageText, overCap, ownedOnly, type OwnMode } from '../../brain/modes';
import { pinCard, recordTaste, setWild } from '../../brain/store';
import { commanderThemes, detectCardSynergies, themeOf } from '../../brain/themes';
import { bracketFit, karstenLands, readiness } from '../../brain/validate';
import { whyCard } from '../../brain/why';
import { pickWildcards, seedOf, wildcardCandidates, WILDCARD_DEFAULT } from '../../brain/wildcard';
import { AGGRESSION, comboAllowed } from '../../brain/win';
import { CardMenu, type Toast } from '../../views/CardMenu';
import { CardSpin } from '../../views/CardSpin';
import { BuyList, ForgeCube, ForgeMeters, ForgeSuggest, ForgeTop, useDeckDrop, useForgeMode } from '../../views/Forge';
import { JumpRail, jumpId } from '../../views/JumpRail';
import { Sheet } from '../../views/parts';
import { CardLine, CardTile, ChipPick, CycleBtn, OptRow, Segs, SetChips, ToolBar, priceSum, useBinder, useStored, VIEW_KEY, type Shared } from '../../views/shared';
import { SwapNote } from '../../views/SwapNote';
import { CompactIcon, GridIcon, ListIcon } from '../../views/zine';
import { CommanderFilterForm } from './CommanderFilterForm';
import { CommanderHero } from './CommanderHero';
import { CommanderReceipt } from './CommanderReceipt';
import { CommanderLeaveModal, CommanderWildcard } from './CommanderWildcard';

// EDHREC's own order first on commander pages.
const CSORTS: [SortKey, string][] = [['list', 'EDHREC ORDER'], ...SORTS];
const OPEN_BRACKET = '';
const OPEN_BUDGET = '';
const AGGRESSION_OF: Record<string, 'patient' | 'hungry' | 'lethal'> = { '': 'hungry', upgraded: 'patient', optimized: 'hungry', cedh: 'lethal' };
const SHOW_AS_COMMANDER = false;
type View = 'grid' | 'list' | 'compact';

const ids = (p: EdhPage | null) => [p?.card?.id, ...(p?.lists.flatMap((l) => l.cards.map((c) => c.id)) ?? [])].filter(Boolean) as string[];

export function CommanderView({ name, s, onBack: back, no }: { name: string; s: Shared; onBack: () => void; no?: number }) {
  const onBack = () => void canLeave().then((ok) => ok && back());
  const narrow = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  useEffect(() => {
    setBack(onBack);
    return () => void setBack(null);
  }, []);

  const slug = toSlug(name);
  const [kind] = useState<'commander' | 'average'>(SHOW_AS_COMMANDER ? 'commander' : 'average');
  const [bracket, setBracket] = useState(OPEN_BRACKET);
  const [noBracket, setNoBracket] = useState(false);
  const [budget, setBudget] = useState(OPEN_BUDGET);
  const [noBudget, setNoBudget] = useState(false);
  const [tag, setTag] = useState('');
  const [best, setBest] = useState<{ busy: boolean; done: number; results?: FitResult[] }>({ busy: false, done: 0 });
  const [page, setPage] = useState<EdhPage | null>(null);
  const [recs, setRecs] = useState<EdhPage | null>(null);
  const [cf, setCf] = useState<CardFilter>({ inc: [], exc: [] });
  const [cfDraft, setCfDraft] = useState({ inc: '', exc: '' });
  const [filtered, setFiltered] = useState<{ page: EdhPage; applied: boolean; pins?: boolean } | null>(null);
  const [tags, setTags] = useState<EdhPage['tags']>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [ctx, setCtx] = useState<{ slot: string; name: string; x: number; y: number } | null>(null);
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
    setNoBracket(false);
    setNoBudget(false);
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
  useEffect(() => setBest({ busy: false, done: 0 }), [slug, tag]);

  const runBest = async () => {
    if (best.busy) return;
    haptic('open');
    setBest({ busy: true, done: 0 });
    const results = await scanBestFit({ slug, commander: name, tag, mine: s.mine }, undefined, (done) => setBest((b) => ({ ...b, done })));
    const top = pickBest(results);
    setBest({ busy: false, done: results.length, results });
    if (!top) return;
    haptic('success');
    setBracket(top.bracket);
    setBudget(top.budget);
  };

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

  const sections = page ? (kind === 'average' ? orderSections(page.lists, page.card ? { name, id: page.card.id, qty: 1 } : undefined) : page.lists) : [];
  const all = sections.flatMap((l) => l.cards);
  const names = [...new Set(all.map((c) => c.name))];
  const sum = { ...summarize(names, s.mine, s.other), ...ownShare([...new Map(all.map((c) => [norm(c.name), c])).values()], s.mine) };
  const missing = [...new Map(all.filter((c) => statusOf(c.name, s.mine) !== 'owned').map((c) => [c.name, c])).values()];
  const cardOf = (c: EdhCard) => (c.id ? cards.get(c.id) : undefined);
  const deckCost = priceSum([...new Map(all.map((c) => [c.name, c])).values()].map((c) => ({ card: cardOf(c), qty: c.qty ?? 1 })));
  const cubeRef = useRef<HTMLDivElement>(null);

  const binder = useBinder(s.profile);
  const never = new Set([...pins.out, ...cf.exc].map(norm));
  const recInfo = recInfoOf(sugg?.lists ?? [], norm, (c) => cardOf(c as EdhCard));
  const cmdr = useLiveQuery(() => db.cards.where('key').equals(norm(name)).first(), [name]);
  const ciKnown = cmdr?.ci ?? page?.card?.ci;
  const ci = ciKnown ?? [];
  const binderCi = new Map(binder.map((c) => [c.key, c.ci]));
  const ciOf = (n: string) => binderCi.get(norm(n));
  const fits = ciKnown ? identityGate(ci, ciOf) : () => false;
  const off = new Set(ciKnown ? offIdentity([...Object.values(swaps), ...pins.in], ci, ciOf).map(norm) : []);
  const swapsOk = Object.fromEntries(Object.entries(swaps).filter(([, r]) => !off.has(norm(r))));
  const pinsOk = { ...pins, in: pins.in.filter((p) => !off.has(norm(p))) };
  const owned = [...recInfo.values()].filter((c) => statusOf(c.name, s.mine) === 'owned' && !never.has(norm(c.name)) && fits(c.name));
  const recCard = new Map((sugg?.lists ?? []).flatMap((l) => l.cards).map((c) => [norm(c.name), c]));
  const slotInfo = (c: EdhCard): SubCard => {
    const info = recInfo.get(norm(c.name));
    const sc = cardOf(c);
    return { ...info, name: c.name, type: sc?.type ?? info?.type, cmc: sc?.cmc ?? info?.cmc };
  };
  const byName = new Map(all.map((c) => [c.name, c]));
  const binderType = new Map(binder.map((c) => [c.key, c.type]));
  const [ownMode] = useStored<OwnMode>('ch:own', 'prefer', ['prefer']);
  const [capS, setCap] = useStored('ch:buycap', '0', BUY_CAPS.map(([v]) => v));
  const cap = Number(capS);

  const eff = arrange(
    [...byName.values()].map((c) => ({ name: c.name, qty: c.qty ?? 1, type: slotInfo(c).type, incl: recInfo.get(norm(c.name))?.incl })),
    swapsOk,
    pinsOk,
    (slot, used) => rankSubs(slotInfo(byName.get(slot)!), owned.filter((o) => !used.has(norm(o.name))), 1)[0]?.name,
    { commander: name, typeOf: (n) => binderType.get(norm(n)) },
  );
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
  const tagLabel = tags.find((t) => t.slug === tag)?.value;
  const autoThemes = commanderThemes(cmdr ?? (page?.card?.id ? cards.get(page.card.id) : undefined), tags);
  const focusStack = tagLabel ? [themeOf(tagLabel), ...autoThemes.filter((t) => t.label.toLowerCase() !== tagLabel.toLowerCase())] : autoThemes;
  const suggest = (c: EdhCard, ctxArg?: Parameters<typeof rankSubs>[3]) =>
    rankSubs(slotInfo(c), binderCandidates(candidates, binder, ci, never).filter((x) => !inDeck.has(norm(x.name))), 3, ctxArg);
  const binderCard = new Map(binder.map((c) => [c.key, c]));

  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).toArray(), [s.profile]) ?? [];
  const mine = decks.filter((d) => d.commander === name).sort((a, b) => b.updated - a.updated);
  const thisDeck = `this ${name.split(' // ')[0]} deck`;
  const alloc = allocate(decks, s.mine);
  const sameCmdr = new Set(mine.map((d) => d.name));
  const takenOthers = takenBy(decks.filter((d) => d.commander !== name), s.mine);
  const deckCol = new Map(decks.map((d) => [d.name, deckColour(d)]));

  const optionOf = (sub: SubCard) => {
    const sc = recCard.get(norm(sub.name));
    const bc = binderCard.get(norm(sub.name));
    const img = (sc && cardOf(sc)?.img) ?? bc?.img ?? imgOf(sc?.id);
    const use = inUseChip(alloc, sub.name, (d) => sameCmdr.has(d));
    const inUse = use && { ...use, colour: deckCol.get(use.deck) };
    return { sub, img, big: sc?.id ? imgOf(sc.id, 'normal') : img?.replace('/small/', '/normal/'), owned: s.mine.get(norm(sub.name)) ?? 0, text: bc?.text ?? (sc && cardOf(sc)?.text), inUse };
  };

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
  const listed = placed.filter((l) => l.header !== 'Commander');

  async function setSwap(missingName: string, replacement: string | null) {
    let p = await db.profiles.get(s.profile);
    if (!p) {
      p = { id: s.profile, name: s.binderName ?? 'Binder 1' };
      await db.profiles.put(p);
    }
    const deck = { ...(p.swaps?.[path] ?? {}) };
    const was = deck[missingName] ?? missingName;
    if (replacement && !fits(replacement)) return;
    if (replacement) deck[missingName] = replacement;
    else delete deck[missingName];
    if (replacement) void recordTaste(s.profile, was, 'cut', name).then(() => recordTaste(s.profile, replacement, 'add', name));
    await db.profiles.update(s.profile, { swaps: { ...(p.swaps ?? {}), [path]: deck } });
    setMenuFor(null);
  }
  async function setPin(card: string, side: PinSide) {
    await pinCard(s.profile, name, card, side);
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
      await clearSwaps();
      setSaved(deckName);
      haptic('success');
      if (open) openDeck(deckName);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function clearSwaps() {
    const p = await db.profiles.get(s.profile);
    if (!p) return;
    const { [path]: _, ...rest } = p.swaps ?? {};
    await db.profiles.update(s.profile, { swaps: rest });
  }

  const [manualForge, setManualForge] = useState(false);
  const [openSearch, setOpenSearch] = useState(0);
  const changes = Object.keys(swapsOk).length;
  const forging = kind === 'average' && (changes > 0 || manualForge);
  const [allMine, setAllMine] = useState(false);
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
  const short = page
    ? shortfalls([...decks.filter((d) => d.commander !== name), { name: thisDeck, cards: all.map((c) => ({ name: nameIn(c), qty: c.qty ?? 1 })) }], s.mine).filter((x) => x.decks.includes(thisDeck))
    : [];
  const bracketNum = Number(BRACKETS.find(([v]) => v === bracket)?.[2]) || 4;
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
    const slot = [...eff.entries()]
      .filter(([k, v]) => k !== name && v.name === k && byName.has(k) && !/\bLand\b/.test(slotInfo(byName.get(k)!).type ?? '') && !pins.in.includes(k) && !comboBreaks(k, deckNames).length)
      .sort((a, b) => (recInfo.get(norm(a[0]))?.incl ?? 1) - (recInfo.get(norm(b[0]))?.incl ?? 1))[0]?.[0];
    return slot ? { ...pick, slot } : undefined;
  })();

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
  const brainCtx = { deck: deckNow, cardOf: cardByName, commander: name, bracket: bracketNum, aggression, taste: profile?.brain?.taste, focus: focusStack[0], taken: takenOthers };
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

  const [view, setViewPref] = useStored<View>(VIEW_KEY, 'grid', ['grid', 'list', 'compact']);
  const setView = (v: View) => {
    setViewPref(v);
    setMenuFor(null);
  };
  const Item = view === 'grid' ? CardTile : CardLine;
  const [sort, setSort] = useStored<SortKey>('ch:csort', 'list', CSORTS.map(([v]) => v));
  const [zoom, setZoom] = useStored<'s' | 'm' | 'l'>('ch:cmdrzoom', 'm', ['s', 'm', 'l']);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  useEffect(() => {
    setShow('all');
  }, [slug]);
  const [only, setOnly] = useState<Only>('all');

  const pull = [...new Map([...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => [norm(v.name), { name: v.name, qty: byName.get(k)?.qty ?? 1 }])).values()]
    .filter((c) => statusOf(c.name, s.mine) === 'owned' && !BASICS.has(norm(c.name)))
    .sort((x, y) => x.name.localeCompare(y.name));

  const activePinnedName = cf.inc[0] || pins.in[0];
  const activePinnedCard = activePinnedName ? cardByName(activePinnedName) : undefined;
  const synergyHint = activePinnedName ? detectCardSynergies(activePinnedName, activePinnedCard, tags) : null;
  const comboWith = (n: string) => brainData().combos?.get(norm(n))?.map((k) => k.cards.find((x) => norm(x) !== norm(n))!).find((o) => o && deckNames.some((d) => norm(d) === norm(o)));
  const covText = coverageText(coverage([...eff].filter(([k]) => norm(k) !== norm(name)).map(([k, v]) => ({ slot: k, name: v.name, qty: byName.get(k)?.qty ?? 1 })), (n) => statusOf(n, s.mine) === 'owned'));

  const hasReceipt = kind === 'average' && (missing.length > 0 || pull.length > 0);
  const receiptNode = hasReceipt ? (
    <CommanderReceipt
      missing={missing}
      pull={pull}
      toBuyCount={toBuy.length}
      toBuyCost={toBuyCost}
      pricesIn={pricesIn}
      bought={bought}
      cap={cap}
      gc={gc}
      alloc={alloc}
      sameCmdr={sameCmdr}
      cardOf={cardOf}
      recInfo={recInfo}
      nameIn={nameIn}
      comboWith={comboWith}
      onToggleBought={toggleBought}
    />
  ) : null;

  return (
    <main className="dpage">
      <CommanderHero
        name={name}
        label={label}
        no={no}
        narrow={narrow}
        bigImg={bigImg}
        ci={ci}
        path={path}
        page={page}
        names={names}
        all={all}
        mine={mine}
        saved={saved}
        allMine={allMine}
        onToggleAllMine={() => setAllMine(!allMine)}
        sum={sum}
        s={s}
        ready={ready}
        fit={fit}
        bracket={bracket}
        onBracketChange={setBracket}
        budget={budget}
        onBudgetChange={setBudget}
        kind={kind}
        covText={covText}
        pricesIn={pricesIn}
        deckCost={deckCost}
        cardOf={cardOf}
        error={error}
        forging={forging}
        filteredPins={filtered?.pins}
        filteredNumDecks={filtered?.page.numDecks}
        short={short}
        hasReceipt={hasReceipt}
        missingCount={missing.length}
        toBuyCount={toBuy.length}
        toBuyCost={toBuyCost}
        pullCount={pull.length}
        buyOpen={buyOpen}
        onOpenBuy={() => setBuyOpen(true)}
        best={best}
        onRunBest={runBest}
        onResetBest={() => setBest({ busy: false, done: 0 })}
        onStartForge={() => setManualForge(true)}
        onOpenMenu={(x, y) => setCtx({ slot: name, name, x, y })}
      />

      {page && (
        <CommanderWildcard
          wild={wild}
          off={wildSet.off}
          roll={wildSet.roll}
          img={wild ? (cardByName(wild.name)?.img ?? imgOf(recCard.get(norm(wild.name))?.id)) : undefined}
          back={wild ? cardByName(wild.name)?.back : undefined}
          onSwapIn={(slot, card) => void setSwap(slot, card)}
          onReroll={(nextRoll) => void setWild(s.profile, name, { roll: nextRoll })}
          onToggleOff={(offVal) => void setWild(s.profile, name, { off: offVal })}
        />
      )}

      {leaving && <CommanderLeaveModal changes={changes} label={label} onChoice={(c) => void leave(c)} />}

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
        <>
          {/* The journey starts here (step 4, Nov 28): Discover found the commander. START opens Guided with it picked,
              EXPLORE the tag graph in its colours, TUNE the Forge on EDHREC's deck (where the bar stays, at TUNE). */}
          {kind === 'average' && (
            <JourneyBar
              current={forging ? 'tune' : undefined}
              onPick={(step) => {
                if (step === 'tune') return void (setManualForge(true), haptic('open'));
                void canLeave().then((ok) => {
                  if (!ok) return;
                  if (step === 'explore') {
                    sendToExplore({ colours: exploreColours(ciKnown) });
                    openDiscoverSub('tags');
                  } else openGuidedWithCommander(name);
                });
              }}
            />
          )}
          {forging && (
            <ForgeTop
              label={label}
              sub={changes ? `${changes} ${changes === 1 ? 'swap' : 'swaps'} · leave and we’ll ask to save` : 'Forge mode · tap or drag cards to tune'}
              undo={undoLast}
              onLeave={changes === 0 && manualForge ? () => { setManualForge(false); window.scrollTo(0, 0); } : onBack}
              onSave={() => saveDeck()}
              saving={saving}
            />
          )}
          {forging && <ForgeCube grid={cubeRef} buyCount={missing.length} />}
          <div ref={cubeRef} className={`deckgrid after-sw${forging ? ' forge-split' : ''}${forging && !anExpanded ? ' an-contracted' : ''}${forging && !sugExpanded ? ' sug-contracted' : ''}`} data-zoom={zoom}>
            {menuFor && <div className="backdrop" onClick={() => setMenuFor(null)} />}
            {forging && (
              <div className={`dside forge-analysis${!anExpanded ? ' is-contracted' : ''}`}>
                <ForgeMeters
                  st={forgeSt}
                  range={(r) => (r === 'tutors' ? undefined : AGGRESSION[aggression][r])}
                  match={sum.pct}
                  expanded={anExpanded}
                  onToggleExpand={toggleAn}
                  names={names}
                  isOwned={(n) => statusOf(n, s.mine) === 'owned'}
                />
              </div>
            )}
            <div className="lists" {...(forging ? drop : {})}>
              <ToolBar
                q={q}
                setQ={setQ}
                now={
                  <>
                    {tag && <span className="fnchip">{`#${tags.find((t) => t.slug === tag)?.value.toUpperCase() ?? tag} · `}</span>}
                    {`${GEARS.find(([v]) => v === budget)?.[1]} GEAR`}
                    {[pins.in.length + pins.out.length ? `${pins.in.length + pins.out.length} PINNED` : '', show !== 'all' ? show.toUpperCase() : '', kind === 'average' && cap ? '≤$' + cap : '', only !== 'all' ? ONLYS.find(([v]) => v === only)?.[1] : '']
                      .filter(Boolean)
                      .map((t) => (
                        <span key={t} className="fnchip">{` · ${t}`}</span>
                      ))}
                  </>
                }
                foot={
                  <>
                    <button type="submit" form="cfilter-form" className="cf-apply-btn" title="Apply card pins">
                      APPLY
                    </button>
                    {(cf.inc.length > 0 || cf.exc.length > 0) && (
                      <button
                        type="button"
                        className="cf-clear-btn"
                        onClick={() => {
                          haptic('undo');
                          if (cf.inc[0] && pins.in.includes(cf.inc[0])) void setPin(cf.inc[0], 'in');
                          if (cf.exc[0] && pins.out.includes(cf.exc[0])) void setPin(cf.exc[0], 'out');
                          setCf({ inc: [], exc: [] });
                          setCfDraft({ inc: '', exc: '' });
                        }}
                        title="Clear card filters"
                      >
                        CLEAR
                      </button>
                    )}
                  </>
                }
                quick={
                  <>
                    <CycleBtn name="Show" cls="qshow-btn" value={show} options={[['all', 'ALL'], ['owned', 'OWNED'], ['missing', 'MISSING']] as [Show, string][]} onChange={(v) => (setShow(v), setMenuFor(null))} />
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
                        <span className="qz-word">SIZE </span>
                        {zoom.toUpperCase()}
                      </button>
                    )}
                    {kind === 'average' && binder.length > 0 && (
                      <button type="button" className="u-btn ghost qadd-btn" title="Search your own cards and put them in this deck" onClick={() => (haptic('open'), setManualForge(true), setOpenSearch((n) => n + 1))}>
                        + MY<span className="qa-word"> CARDS</span>
                      </button>
                    )}
                  </>
                }
              >
                <CommanderFilterForm
                  cf={cf}
                  cfDraft={cfDraft}
                  pins={pins}
                  recCard={recCard}
                  binder={binder}
                  mine={s.mine}
                  filtered={filtered}
                  slug={slug}
                  bracket={bracket}
                  tag={tag}
                  budget={budget}
                  synergyHint={synergyHint}
                  cardByName={cardByName}
                  onDraftChange={setCfDraft}
                  onApply={setCf}
                  onPin={setPin}
                  onTuneSynergy={(hint) => {
                    if (hint.themeSlug) setTag(hint.themeSlug);
                    setToast({ text: `Deck auto-tuned to ${hint.card} synergies!` });
                  }}
                />
                {tags.length > 0 && (
                  <OptRow label="THEME">
                    <div className="themes" role="group" aria-label="EDHREC themes">
                      {tags.map((t) => (
                        <button key={t.slug} type="button" className="u-chip" aria-pressed={tag === t.slug} onClick={() => (haptic('select'), setTag(tag === t.slug ? '' : t.slug))}>
                          {t.value.toUpperCase()} <small>{t.count.toLocaleString()}</small>
                        </button>
                      ))}
                    </div>
                  </OptRow>
                )}
                <OptRow label="GEAR">
                  <Segs label="Gear" value={budget} options={GEARS} onChange={setBudget} />
                </OptRow>
                {kind === 'average' && (
                  <OptRow label="PRICE CAP">
                    <Segs label="Buy under" value={capS} options={BUY_CAPS.map(([v, t]) => [v, v === '0' ? t : `CA${t}`, v === '0' ? 'No price cap on buy suggestions' : `Mark buy suggestions over CA${t} each (the deck never changes)`])} onChange={setCap} />
                  </OptRow>
                )}
                <ChipPick label="SHOW" value={show} options={SHOWS} onChange={(v) => (setShow(v), setMenuFor(null))} />
                <ChipPick label="SORT" value={sort} options={CSORTS} onChange={(v) => (setSort(v), setMenuFor(null))} />
                <ChipPick label="ONLY" value={only} options={ONLYS} onChange={(v) => (setOnly(v), setMenuFor(null))} />
              </ToolBar>
              <SetChips
                chips={[
                  ...(tag ? [{ label: 'THEME ' + (tags.find((t) => t.slug === tag)?.value ?? tag).toUpperCase(), off: () => setTag('') }] : []),
                  ...pins.in.map((n) => ({ label: 'PIN ' + n, off: () => setPin(n, 'in') })),
                  ...pins.out.map((n) => ({ label: 'WITHOUT ' + n, off: () => setPin(n, 'out') })),
                  ...(show !== 'all' ? [{ label: show.toUpperCase() + ' ONLY', off: () => setShow('all') }] : []),
                  ...(kind === 'average' && cap ? [{ label: 'BUY UNDER CA$' + cap, off: () => setCap('0') }] : []),
                  ...(only !== 'all' ? [{ label: ONLYS.find(([v]) => v === only)?.[1] ?? only, off: () => setOnly('all') }] : []),
                ]}
              />
              {noBudget && !noBracket && <small className="bnote">No EDHREC decks in {GEARS.find(([v]) => v === budget)?.[1]} gear: showing every budget (2ND)</small>}
              {noBracket && <small className="bnote">No EDHREC decks at {BRACKETS.find(([v]) => v === bracket)?.[1].toLowerCase()} power: showing all brackets</small>}
              {(() => {
                const own = (c: EdhCard) => statusOf(nameIn(c), s.mine) === 'owned';
                const groups = listed
                  .map((l) => ({
                    l,
                    cs: sortBy(
                      searchByText(l.cards.filter((c) => shows(show, own(c)) && onlyOk(only, { gc: !!gc?.has(norm(nameIn(c))), cad: toCad(cardByName(nameIn(c))?.usd) })), q, (c) => ({ name: nameIn(c), type: cardOf(c)?.type, text: cardOf(c)?.text })),
                      sort,
                      (c) => ({ name: c.name, usd: cardOf(c)?.usd ? Number(cardOf(c)!.usd) : undefined, mv: cardOf(c)?.cmc, owned: own(c) }),
                    ),
                  }))
                  .filter((g) => g.cs.length);
                return (
                  <>
                    <JumpRail headers={groups.map((g) => g.l.header)} />
                    {groups.map(({ l, cs }) => {
                      const ls = summarize(cs.map((c) => c.name), s.mine, s.other);
                      return (
                        <details key={l.header} id={jumpId(l.header)} className="cat" open>
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
                          <ul className={view === 'grid' ? 'zgrid' : view === 'compact' ? 'zlist zcompact' : 'zlist'} data-zoom={view === 'grid' ? zoom : undefined}>
                            {cs.map((c) => {
                              const swappable = kind === 'average' && norm(c.name) !== norm(name);
                              const slot = eff.get(c.name);
                              const repl = slot && slot.name !== c.name ? slot.name : undefined;
                              const rc = repl ? recCard.get(norm(repl)) : undefined;
                              const bc = repl && !rc ? binderCard.get(norm(repl)) : undefined;
                              const now = repl ?? c.name;
                              const pin = pinOf(pins, now);
                              const mark = repl ? `${slot!.why === 'pin' ? 'PIN' : slot!.why === 'never' ? 'NEVER' : slot!.why === 'auto' ? '≈' : '↔'} for ${c.name}` : pin === 'in' ? 'always in' : pin === 'out' ? 'no card fits' : undefined;
                              const stat = c.qty && c.qty > 1 ? `×${c.qty}` : '';
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
                                      ctx={brainCtx}
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
                  </>
                );
              })()}
            </div>
            {forging && (
              <div className="dside forge-buy">
                <BuyList items={missing.map((c) => ({ name: c.name, qty: c.qty ?? 1, cad: toCad(cardOf(c)?.usd) }))} binder={s.binderName} />
              </div>
            )}
            {forging ? (
              <div className={`dside forge-suggestions${!sugExpanded ? ' is-contracted' : ''}`}>
                <ForgeSuggest
                  profile={s.profile}
                  deck={deckNow}
                  commander={name}
                  bracket={bracketNum}
                  aggression={aggression}
                  candidates={[...recInfo.values()].filter((c) => !never.has(norm(c.name))).concat(binderCandidates([], binder, ci, never))}
                  cardOf={cardByName}
                  ownedOf={(n) => s.mine.get(norm(n)) ?? 0}
                  taken={takenOthers}
                  imgOf={(n) => optionOf({ name: n }).img}
                  themes={tags}
                  theme={tag}
                  placing={placing}
                  onPlace={setPlacing}
                  loading={!recs}
                  buy={receiptNode || undefined}
                  expanded={sugExpanded}
                  onToggleExpand={toggleSug}
                  onJustBuild={kind === 'average' && binder.length > 0 ? () => void forgeFromBinder() : undefined}
                  openSearch={openSearch}
                  whyNot={(text) => notOffered(text, binder, ci, new Set(deckNow.map((c) => norm(c.name))), never)}
                  building={saving}
                />
              </div>
            ) : null}
          </div>
        </>
      )}

      {buyOpen && receiptNode && !forging && (
        <Sheet label={missing.length > 0 ? 'To buy' : 'Pull list'} onClose={closeBuy}>
          {receiptNode}
        </Sheet>
      )}
    </main>
  );
}

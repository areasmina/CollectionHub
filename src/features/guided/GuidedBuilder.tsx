import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { binderCandidates } from '../../brain/candidates';
import { stepPicks } from '../../brain/guided';
import { inIdentity } from '../../brain/identity';
import { AGGRESSION, type Aggression } from '../../brain/win';
import { BASICS, summarize } from '../../lib/compare';
import { pairIdentity } from '../../lib/commander';
import { db, type Card, type Deck, type DeckCard } from '../../lib/db';
import { bracketOf, deckStats, isLand } from '../../lib/deckstats';
import { deckText } from '../../lib/export';
import { haptic } from '../../lib/haptics';
import { freeDeckName, onPendingSeeds, openDeck, openDiscoverSub, takePendingSeeds } from '../../lib/nav';
import { exploreColours, sendColoursToExplore } from '../../lib/journey';
import { JourneyBar } from '../journey/JourneyBar';
import { norm } from '../../lib/names';
import { cad, toCad } from '../../lib/prices';
import { useBinder } from '../../views/shared';
import s from './GuidedBuilder.module.css';
import { TabletopView } from './TabletopView';
import {
  MAX_SEED_CARDS,
  WIZARD_STEPS,
  WIZARD_STEP_HINTS,
  WIZARD_STEP_LABEL,
  adjustDeckCard,
  autoFillBasics,
  filterByMaxPrice,
  groupForTabletop,
  isEngineStep,
  matchCommandersForCards,
  totalCardsIn,
  withBasicFallback,
  type TabletopGroupBy,
  type WizardStep,
} from './guidedState';

interface GuidedBuilderProps {
  profile: number;
  binderName: string;
  mine: Map<string, number>;
  onToast?: (t: { text: string; undo?: () => void }) => void;
}

const PRICE_CAPS: Array<{ label: string; value: number | null }> = [
  { label: 'ANY', value: null },
  { label: '≤CA$5', value: 5 },
  { label: '≤CA$15', value: 15 },
  { label: '≤CA$30', value: 30 },
];

const BRACKET_OPTIONS = [2, 3, 4, 5] as const;

interface GuidedDraft {
  commanderKey: string | null;
  draftCards: DeckCard[];
  deckName: string;
  step: WizardStep;
  bracket: number;
  aggression: Aggression;
}

const draftKeyFor = (profile: number) => `ch:guided_draft_${profile}`;

function loadGuidedDraft(profile: number): GuidedDraft | null {
  try {
    const raw = localStorage.getItem(draftKeyFor(profile));
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<GuidedDraft>;
    if (!p || !Array.isArray(p.draftCards)) return null;
    return {
      commanderKey: typeof p.commanderKey === 'string' ? p.commanderKey : null,
      draftCards: p.draftCards,
      deckName: typeof p.deckName === 'string' ? p.deckName : '',
      step: WIZARD_STEPS.includes(p.step as WizardStep) ? (p.step as WizardStep) : 'commander',
      bracket: typeof p.bracket === 'number' ? p.bracket : 3,
      aggression: p.aggression === 'patient' || p.aggression === 'hungry' || p.aggression === 'lethal' ? p.aggression : 'hungry',
    };
  } catch {
    return null;
  }
}

export function GuidedBuilder({ profile, binderName, mine, onToast }: GuidedBuilderProps) {
  const binderCards = useBinder(profile);
  const initialDraft = useMemo(() => loadGuidedDraft(profile), [profile]);

  const [step, setStep] = useState<WizardStep>(() => initialDraft?.step ?? 'commander');
  const [startMode, setStartMode] = useState<'commander' | 'cards'>('commander');
  const [viewMode, setViewMode] = useState<'tabletop' | 'classic'>('tabletop');
  const [groupBy, setGroupBy] = useState<TabletopGroupBy>('categories');
  const [bracket, setBracket] = useState<number>(() => initialDraft?.bracket ?? 3);
  const [aggression, setAggression] = useState<Aggression>(() => initialDraft?.aggression ?? 'hungry');
  const [maxPriceCad, setMaxPriceCad] = useState<number | null>(null);

  const [query, setQuery] = useState('');
  const [seedCards, setSeedCards] = useState<Card[]>([]);
  const [savedCommanderKey, setSavedCommanderKey] = useState<string | null>(() => initialDraft?.commanderKey ?? null);
  const [commander, setCommander] = useState<Card | null>(null);
  const [draftCards, setDraftCards] = useState<DeckCard[]>(() => initialDraft?.draftCards ?? []);
  const [deckName, setDeckName] = useState(() => initialDraft?.deckName ?? '');
  const [saving, setSaving] = useState(false);

  // Memory-lean: only query draft card keys (plus an 80-card fallback when binder is empty), never full db.cards.toArray()
  const draftKeys = useMemo(() => {
    const keys = draftCards.map((c) => norm(c.name));
    if (savedCommanderKey && !keys.includes(savedCommanderKey)) keys.push(savedCommanderKey);
    return keys;
  }, [draftCards, savedCommanderKey]);

  const extraDbCards =
    useLiveQuery(async () => {
      const hits = draftKeys.length ? await db.cards.where('key').anyOf(draftKeys).toArray() : [];
      if (binderCards.length === 0) {
        const sample = await db.cards.filter((c) => c.legal !== false).limit(80).toArray();
        return [...hits, ...sample];
      }
      return hits;
    }, [draftKeys.join('|'), binderCards.length]) ?? [];

  // Index binder + draft cards by normalized name (prefer owned binder copy).
  const cardByKey = useMemo(() => {
    const map = new Map<string, Card>();
    for (const c of extraDbCards) if (!map.has(c.key)) map.set(c.key, c);
    for (const c of binderCards) map.set(c.key, c);
    return map;
  }, [extraDbCards, binderCards]);

  // Resolve persisted commander once card data arrives
  useEffect(() => {
    if (!commander && savedCommanderKey) {
      const found = cardByKey.get(savedCommanderKey);
      if (found) setCommander(found);
    }
  }, [cardByKey, commander, savedCommanderKey]);

  // Receive seed cards handed off from Tag Builder ("BUILD WITH THESE TAGS →")
  useEffect(() => {
    const applySeeds = async (names: string[]) => {
      if (!names.length) return;
      const keys = names.slice(0, MAX_SEED_CARDS).map(norm);
      const fromBinder = keys.map((k) => binderCards.find((b) => b.key === k) ?? cardByKey.get(k)).filter(Boolean) as Card[];
      const missingKeys = keys.filter((k) => !fromBinder.some((c) => c.key === k));
      const fromDb = missingKeys.length ? await db.cards.where('key').anyOf(missingKeys).toArray() : [];
      const resolved = [...fromBinder, ...fromDb].slice(0, MAX_SEED_CARDS);
      if (resolved.length) {
        setStartMode('cards');
        setStep('commander');
        setSeedCards(resolved);
      }
    };
    const initial = takePendingSeeds();
    if (initial) void applySeeds(initial);
    return onPendingSeeds((names) => void applySeeds(names));
  }, [binderCards, cardByKey]);

  // Persist draft across reloads/tab switches
  useEffect(() => {
    try {
      const cmdKey = commander?.key ?? savedCommanderKey;
      if (!cmdKey && draftCards.length === 0) {
        localStorage.removeItem(draftKeyFor(profile));
        return;
      }
      const payload: GuidedDraft = {
        commanderKey: cmdKey,
        draftCards,
        deckName,
        step,
        bracket,
        aggression,
      };
      localStorage.setItem(draftKeyFor(profile), JSON.stringify(payload));
    } catch {
      /* ignore storage errors */
    }
  }, [aggression, bracket, commander, deckName, draftCards, profile, savedCommanderKey, step]);

  const resetDraft = () => {
    haptic('tap');
    setCommander(null);
    setSavedCommanderKey(null);
    setDraftCards([]);
    setSeedCards([]);
    setDeckName('');
    setStep('commander');
    try {
      localStorage.removeItem(draftKeyFor(profile));
    } catch {}
  };

  const cardOf = useCallback(
    (name: string) => withBasicFallback((n) => cardByKey.get(norm(n)))(name),
    [cardByKey]
  );

  const cardPool = useMemo(() => {
    return binderCards.length > 0 ? binderCards : extraDbCards.filter((c) => c.legal !== false);
  }, [binderCards, extraDbCards]);

  const identity = useMemo(() => {
    return commander ? pairIdentity(commander.ci) : [];
  }, [commander]);

  const commanderMatches = useMemo(() => {
    const base = matchCommandersForCards(startMode === 'cards' ? seedCards : [], cardPool);
    const q = norm(query);
    return q ? base.filter((m) => norm(m.card.name).includes(q)) : base;
  }, [cardPool, query, seedCards, startMode]);

  const seedSuggestions = useMemo(() => {
    if (startMode !== 'cards') return [];
    const q = norm(query);
    const selected = new Set(seedCards.map((c) => c.key));
    return cardPool
      .filter((c) => !selected.has(c.key) && (!q || norm(c.name).includes(q)))
      .slice(0, 24);
  }, [cardPool, query, seedCards, startMode]);

  const selectCommander = (cmd: Card) => {
    haptic('success');
    setCommander(cmd);
    setSavedCommanderKey(cmd.key);
    if (!deckName.trim()) {
      setDeckName(`${cmd.name.split(',')[0]} (Guided)`);
    }
    const nextCards: DeckCard[] = [{ name: cmd.name, qty: 1 }];
    for (const seed of seedCards) {
      if (seed.key !== cmd.key && inIdentity(seed.ci ?? [], cmd.ci ?? [])) {
        nextCards.push({ name: seed.name, qty: 1 });
      }
    }
    setDraftCards(nextCards);
    setStep('lands');
  };

  const toggleSeedCard = (card: Card) => {
    setSeedCards((prev) => {
      if (prev.some((c) => c.key === card.key)) {
        return prev.filter((c) => c.key !== card.key);
      }
      if (prev.length >= MAX_SEED_CARDS) {
        onToast?.({ text: `Up to ${MAX_SEED_CARDS} seed cards supported.` });
        return prev;
      }
      return [...prev, card];
    });
  };

  const adjustCard = useCallback(
    (name: string, delta: number) => {
      if (commander && norm(name) === commander.key && delta < 0) return;
      haptic('tap');
      setDraftCards((prev) => {
        if (delta > 0 && !BASICS.has(norm(name)) && prev.some((c) => norm(c.name) === norm(name))) {
          return prev;
        }
        return adjustDeckCard(prev, name, delta);
      });
    },
    [commander]
  );

  // Candidates in commander colour identity from binder/cached cards.
  const candidates = useMemo(() => {
    if (!commander) return [];
    return binderCandidates([], cardPool, identity);
  }, [cardPool, commander, identity]);

  const stepRead = useMemo(() => {
    if (!commander || !isEngineStep(step)) return null;
    const raw = stepPicks(
      step,
      candidates,
      {
        deck: draftCards,
        cardOf,
        commander: commander.name,
        bracket,
        aggression,
      },
      { n: 40, identity }
    );
    return {
      ...raw,
      picks: filterByMaxPrice(raw.picks, (n) => cardByKey.get(norm(n)), maxPriceCad),
    };
  }, [aggression, bracket, candidates, cardByKey, cardOf, commander, draftCards, identity, maxPriceCad, step]);

  const totalCount = totalCardsIn(draftCards);

  const handleAutoFill = () => {
    if (!commander || !isEngineStep(step)) return;
    haptic('success');
    if (step === 'lands') {
      const targetLands = stepRead?.target?.[0] ?? 37;
      setDraftCards((prev) => {
        let next = prev;
        let currentLands = next.reduce((n, c) => n + (isLand(cardOf(c.name)?.type) ? c.qty : 0), 0);
        // Pick top owned nonbasic lands first, then top up remaining slots evenly with basics
        if (stepRead) {
          const ownedNonbasics = stepRead.picks.filter(
            (p) => !p.blocked && !BASICS.has(norm(p.name)) && !next.some((d) => norm(d.name) === norm(p.name))
          );
          for (const land of ownedNonbasics) {
            if (currentLands >= targetLands || totalCardsIn(next) >= 100) break;
            next = adjustDeckCard(next, land.name, 1);
            currentLands++;
          }
        }
        return autoFillBasics(next, cardOf, identity, targetLands, 100);
      });
      return;
    }
    const targetMin = stepRead?.target?.[0] ?? (step === 'rest' ? 99 : 8);
    const need =
      step === 'rest'
        ? Math.max(0, 100 - totalCount)
        : Math.max(0, Math.min(targetMin - (stepRead?.have ?? 0), 100 - totalCount));
    if (need <= 0 || !stepRead) return;

    const toAdd = stepRead.picks
      .filter((p) => !p.blocked && !draftCards.some((d) => norm(d.name) === norm(p.name)))
      .slice(0, need);

    if (toAdd.length === 0) return;
    setDraftCards((prev) => {
      let next = prev;
      for (const p of toAdd) {
        if (totalCardsIn(next) >= 100) break;
        next = adjustDeckCard(next, p.name, 1);
      }
      return next;
    });
  };

  const handleAutoBuild100 = () => {
    if (!commander) return;
    haptic('success');
    let next = [...draftCards];
    const order = ['lands', 'ramp', 'draw', 'removal', 'wipes', 'plan', 'rest'] as const;
    for (const st of order) {
      if (totalCardsIn(next) >= 100) break;
      const raw = stepPicks(
        st,
        candidates,
        { deck: next, cardOf, commander: commander.name, bracket, aggression },
        { n: st === 'rest' ? 80 : 40, identity }
      );
      const picks = filterByMaxPrice(raw.picks, (n) => cardByKey.get(norm(n)), maxPriceCad);
      if (st === 'lands') {
        const targetLands = raw.target?.[0] ?? 37;
        let currentLands = next.reduce((n, c) => n + (isLand(cardOf(c.name)?.type) ? c.qty : 0), 0);
        for (const p of picks) {
          if (currentLands >= targetLands || totalCardsIn(next) >= 100) break;
          if (p.blocked || BASICS.has(norm(p.name)) || next.some((d) => norm(d.name) === norm(p.name))) continue;
          next = adjustDeckCard(next, p.name, 1);
          currentLands++;
        }
        next = autoFillBasics(next, cardOf, identity, targetLands, 100);
        continue;
      }
      const targetMin = raw.target?.[0] ?? (st === 'rest' ? 99 : 8);
      const need =
        st === 'rest'
          ? Math.max(0, 100 - totalCardsIn(next))
          : Math.max(0, Math.min(targetMin - raw.have, 100 - totalCardsIn(next)));
      if (need <= 0) continue;
      const toAdd = picks.filter((p) => !p.blocked && !next.some((d) => norm(d.name) === norm(p.name))).slice(0, need);
      for (const p of toAdd) {
        if (totalCardsIn(next) >= 100) break;
        next = adjustDeckCard(next, p.name, 1);
      }
    }
    setDraftCards(next);
    setStep('review');
    onToast?.({ text: `Auto-built ${totalCardsIn(next)}/100 cards from your binder.` });
  };

  const stats = useMemo(() => {
    if (!commander) return null;
    return deckStats(draftCards, cardOf, commander.name);
  }, [cardOf, commander, draftCards]);

  const bracketInfo = useMemo(() => {
    return bracketOf(
      draftCards.map((c) => ({ name: c.name, card: cardOf(c.name) })),
      null
    );
  }, [cardOf, draftCards]);

  const ownedSummary = useMemo(() => {
    return summarize(
      draftCards.map((c) => c.name),
      mine
    );
  }, [draftCards, mine]);

  const saveDeck = async () => {
    if (!commander || saving) return;
    setSaving(true);
    try {
      const wanted = deckName.trim() || `${commander.name} (Guided)`;
      const name = await freeDeckName(profile, wanted);
      const deck: Deck = {
        profile,
        name,
        commander: commander.name,
        cards: draftCards,
        updated: Date.now(),
        source: 'guided',
      };
      await db.decks.add(deck);
      try {
        localStorage.removeItem(draftKeyFor(profile));
      } catch {}
      haptic('success');
      onToast?.({ text: `Saved "${name}" (${totalCount} cards).` });
      openDeck(name);
    } finally {
      setSaving(false);
    }
  };

  const copyList = async () => {
    if (!commander) return;
    const text = deckText({
      profile,
      name: deckName.trim() || commander.name,
      commander: commander.name,
      cards: draftCards,
      updated: Date.now(),
    });
    try {
      await navigator.clipboard.writeText(text);
      haptic('select');
      onToast?.({ text: 'Copied decklist to clipboard.' });
    } catch {
      onToast?.({ text: 'Clipboard unavailable in this browser context.' });
    }
  };

  const classicPiles = useMemo(() => {
    return groupForTabletop(draftCards, cardOf, groupBy, commander?.name);
  }, [cardOf, commander, draftCards, groupBy]);

  return (
    <section className={s.shell} aria-label="Guided deckbuilder">
      {/* Top Bar */}
      <header className={s.topBar}>
        <div className={s.topTitleGroup}>
          <span className={s.eyebrow}>Guided Deckbuilder · {binderName}</span>
          <div className={s.deckHeadline}>
            <span>{commander ? commander.name : 'Choose a Commander'}</span>
            <span className={`${s.counterBadge} ${totalCount === 100 ? s.counterOk : ''}`}>
              {totalCount} / 100 CARDS
            </span>
            {commander && (
              <span className={s.counterBadge}>
                {ownedSummary.owned}/{ownedSummary.total} OWNED ({ownedSummary.pct}%)
              </span>
            )}
          </div>
        </div>

        <div className={s.topControls}>
          {commander && totalCount < 100 && (
            <button type="button" className={`${s.btn} ${s.btnHazard}`} onClick={handleAutoBuild100} title="Auto-fill all remaining steps from your binder up to 100 cards">
              Auto-build 100
            </button>
          )}
          {(commander || draftCards.length > 0) && (
            <button type="button" className={s.btn} onClick={resetDraft} title="Clear current guided draft">
              Reset Draft
            </button>
          )}
          <div className={s.seg} role="group" aria-label="Deck workspace view">
            <button
              type="button"
              className={s.segBtn}
              aria-pressed={viewMode === 'tabletop'}
              onClick={() => setViewMode('tabletop')}
            >
              Tabletop
            </button>
            <button
              type="button"
              className={s.segBtn}
              aria-pressed={viewMode === 'classic'}
              onClick={() => setViewMode('classic')}
            >
              Classic
            </button>
          </div>
        </div>
      </header>

      {/* The journey (Nov 27): EXPLORE takes the commander's colours to the tag graph; TUNE saves this build as a deck
          and opens it in the Forge (the same save as REVIEW & SAVE). */}
      <JourneyBar
        current="start"
        blocked={commander ? {} : { tune: 'Pick a commander first: TUNE opens your saved deck in the Forge' }}
        onPick={(step) => {
          if (step === 'explore') {
            sendColoursToExplore(exploreColours(commander?.ci));
            openDiscoverSub('tags');
          } else if (step === 'tune') void saveDeck();
        }}
      />

      {/* 9-Step Stepper */}
      <nav className={s.stepper} aria-label="Guided build steps">
        {WIZARD_STEPS.map((st, idx) => {
          const disabled = st !== 'commander' && !commander;
          return (
            <button
              key={st}
              type="button"
              disabled={disabled}
              className={`${s.stepBtn} ${step === st ? s.stepBtnActive : ''}`}
              aria-current={step === st ? 'step' : undefined}
              onClick={() => setStep(st)}
            >
              <span className={s.stepNum}>{idx + 1}</span>
              <span>{WIZARD_STEP_LABEL[st]}</span>
            </button>
          );
        })}
      </nav>

      {/* Split-Pane Workspace */}
      <div className={s.workspace}>
        {/* Left: Tabletop / Classic Deck Canvas */}
        <div className={s.pane}>
          {!commander ? (
            <div>
              <h3 style={{ margin: '0 0 8px' }}>Workspace Canvas</h3>
              <p className={s.mutedNote}>
                Pick a commander on the right (or start from up to {MAX_SEED_CARDS} owned cards) to
                populate the tabletop piles, category targets, and land steppers.
              </p>
            </div>
          ) : viewMode === 'tabletop' ? (
            <TabletopView
              cards={draftCards}
              commander={commander.name}
              identity={identity}
              groupBy={groupBy}
              onGroupBy={setGroupBy}
              cardOf={cardOf}
              onAdjustCard={adjustCard}
            />
          ) : (
            <div className={s.classicGroups}>
              {classicPiles.map((pile) => (
                <div key={pile.id} className={s.pile}>
                  <header className={s.pileHead}>
                    <span>{pile.label}</span>
                    <span>
                      {pile.count}
                      {pile.target ? ` / ${pile.target[0]}–${pile.target[1]}` : ''}
                    </span>
                  </header>
                  {pile.cards.length === 0 ? (
                    <p className={s.mutedNote}>None yet</p>
                  ) : (
                    pile.cards.map((entry) => {
                      const isLead = commander && norm(entry.name) === commander.key;
                      return (
                        <div key={entry.name} className={s.pickRow}>
                          <span className={s.pickName}>
                            {entry.qty}x {entry.name}
                          </span>
                          {!isLead && (
                            <button
                              type="button"
                              className={s.miniBtn}
                              aria-label={`Remove one ${entry.name}`}
                              onClick={() => adjustCard(entry.name, -1)}
                            >
                              -
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Sticky Guided Stepper Pane */}
        <aside className={`${s.pane} ${s.stickyRail}`} aria-label="Current step suggestions">
          <div>
            <span className={s.eyebrow}>
              Step {WIZARD_STEPS.indexOf(step) + 1} of {WIZARD_STEPS.length} · {WIZARD_STEP_LABEL[step]}
            </span>
            <p className={s.mutedNote}>{WIZARD_STEP_HINTS[step]}</p>
          </div>

          {step === 'commander' && (
            <>
              <div className={s.seg} role="group" aria-label="Commander start mode">
                <button
                  type="button"
                  className={s.segBtn}
                  aria-pressed={startMode === 'commander'}
                  onClick={() => setStartMode('commander')}
                >
                  Start with Commander
                </button>
                <button
                  type="button"
                  className={s.segBtn}
                  aria-pressed={startMode === 'cards'}
                  onClick={() => setStartMode('cards')}
                >
                  Start with Cards ({seedCards.length}/{MAX_SEED_CARDS})
                </button>
              </div>

              <input
                type="search"
                className={s.input}
                aria-label={startMode === 'cards' ? 'Filter seed cards or commanders' : 'Search commanders'}
                placeholder={
                  startMode === 'cards'
                    ? 'Search cards in binder to seed...'
                    : 'Search legal commanders...'
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />

              {startMode === 'cards' && (
                <>
                  {seedCards.length > 0 && (
                    <div className={s.seedChips} aria-label="Selected seed cards">
                      {seedCards.map((c) => (
                        <span key={c.key} className={s.chip}>
                          {c.name}
                          <button
                            type="button"
                            className={s.chipRemove}
                            aria-label={`Remove seed ${c.name}`}
                            onClick={() => toggleSeedCard(c)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div>
                    <span className={s.dialLabel}>Pick seed cards (optional)</span>
                    <div className={s.pickList} style={{ maxHeight: 190, marginTop: 6 }}>
                      {seedSuggestions.length === 0 ? (
                        <p className={s.mutedNote}>
                          No cards loaded in this binder yet. Import cards in Collection first.
                        </p>
                      ) : (
                        seedSuggestions.map((card) => (
                          <div key={card.key} className={s.pickRow}>
                            <div className={s.pickMain}>
                              <span className={s.pickName}>{card.name}</span>
                              <span className={s.pickMeta}>
                                <span>{card.type}</span>
                                <span>{card.ci?.length ? card.ci.join('') : 'C'}</span>
                              </span>
                            </div>
                            <button type="button" className={s.btn} onClick={() => toggleSeedCard(card)}>
                              Seed
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </>
              )}

              <div>
                <span className={s.dialLabel}>
                  Matching Commanders ({commanderMatches.length})
                </span>
                <div className={s.pickList} style={{ marginTop: 6 }}>
                  {commanderMatches.length === 0 ? (
                    <p className={s.mutedNote}>
                      No matching commanders found in {binderName}. Adjust seed cards or import a commander.
                    </p>
                  ) : (
                    commanderMatches.slice(0, 40).map((m) => (
                      <div key={m.card.key} className={s.pickRow}>
                        {m.card.img && <img src={m.card.img} alt={m.card.name} className={s.pickArt} loading="lazy" />}
                        <div className={s.pickMain}>
                          <span className={s.pickName}>{m.card.name}</span>
                          <span className={s.pickMeta}>
                            <span>{m.card.ci?.length ? m.card.ci.join('') : 'Colorless'}</span>
                            {startMode === 'cards' && m.totalSeeds > 0 && (
                              <span>
                                Fits {m.matchedSeeds}/{m.totalSeeds} seeds
                              </span>
                            )}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`${s.btn} ${s.btnPrimary}`}
                          onClick={() => selectCommander(m.card)}
                        >
                          Choose
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {isEngineStep(step) && commander && stepRead && (
            <>
              {/* Bracket, Dial, and CAD Cap Controls */}
              <div className={s.dialBar}>
                <div className={s.dialGroup}>
                  <span className={s.dialLabel}>Bracket</span>
                  <div className={s.seg} role="group" aria-label="Target bracket">
                    {BRACKET_OPTIONS.map((b) => (
                      <button
                        key={b}
                        type="button"
                        className={s.segBtn}
                        aria-pressed={bracket === b}
                        onClick={() => setBracket(b)}
                      >
                        B{b}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={s.dialGroup}>
                  <span className={s.dialLabel}>Dial</span>
                  <div className={s.seg} role="group" aria-label="Aggression dial">
                    {(['patient', 'hungry', 'lethal'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        className={s.segBtn}
                        aria-pressed={aggression === a}
                        onClick={() => setAggression(a)}
                      >
                        {AGGRESSION[a].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={s.dialGroup}>
                  <span className={s.dialLabel}>Max Card</span>
                  <div className={s.seg} role="group" aria-label="Maximum per-card CAD price">
                    {PRICE_CAPS.map((cap) => (
                      <button
                        key={cap.label}
                        type="button"
                        className={s.segBtn}
                        aria-pressed={maxPriceCad === cap.value}
                        onClick={() => setMaxPriceCad(cap.value)}
                      >
                        {cap.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className={s.actionsRow} style={{ justifyContent: 'space-between' }}>
                <span className={s.counterBadge}>
                  Have: {stepRead.have}
                  {stepRead.target ? ` · Target: ${stepRead.target[0]}–${stepRead.target[1]}` : ''}
                </span>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnHazard}`}
                  onClick={handleAutoFill}
                >
                  Auto-fill to Target
                </button>
              </div>

              <div className={s.pickList}>
                {stepRead.picks.length === 0 ? (
                  <p className={s.mutedNote}>
                    No unpicked {WIZARD_STEP_LABEL[step].toLowerCase()} suggestions left in this
                    price cap / identity. Use Auto-fill or advance to the next step.
                  </p>
                ) : (
                  stepRead.picks.map((pick) => {
                    const meta = cardByKey.get(norm(pick.name));
                    const priceCad = toCad(meta?.usd);
                    const why = pick.parts[0]?.label;
                    const inDeck = draftCards.some((d) => norm(d.name) === norm(pick.name));
                    return (
                      <div key={pick.name} className={s.pickRow}>
                        {meta?.img && <img src={meta.img} alt={pick.name} className={s.pickArt} loading="lazy" />}
                        <div className={s.pickMain}>
                          <span className={s.pickName}>{pick.name}</span>
                          <span className={s.pickMeta}>
                            <span>{meta?.type ?? ''}</span>
                            {priceCad != null && <span>≈{cad(priceCad)}</span>}
                            {pick.blocked && (
                              <span className={s.blockedTag}>{pick.blocked}</span>
                            )}
                          </span>
                          {why && <span className={s.pickWhy}>{why}</span>}
                        </div>
                        <button
                          type="button"
                          className={`${s.btn} ${inDeck ? '' : s.btnPrimary}`}
                          disabled={inDeck || totalCount >= 100 || !!pick.blocked}
                          onClick={() => adjustCard(pick.name, 1)}
                        >
                          {inDeck ? 'Added' : 'Add'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className={s.actionsRow} style={{ justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className={s.btn}
                  onClick={() => {
                    const i = WIZARD_STEPS.indexOf(step);
                    if (i > 0) setStep(WIZARD_STEPS[i - 1]);
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnPrimary}`}
                  onClick={() => {
                    const i = WIZARD_STEPS.indexOf(step);
                    if (i < WIZARD_STEPS.length - 1) setStep(WIZARD_STEPS[i + 1]);
                  }}
                >
                  Next Step
                </button>
              </div>
            </>
          )}

          {step === 'review' && commander && stats && (
            <>
              <div className={s.reviewStats}>
                <div className={s.statTile}>
                  <div className={s.statValue}>{totalCount}/100</div>
                  <div className={s.statLabel}>Total Cards</div>
                </div>
                <div className={s.statTile}>
                  <div className={s.statValue}>{stats.lands}</div>
                  <div className={s.statLabel}>Lands</div>
                </div>
                <div className={s.statTile}>
                  <div className={s.statValue}>{stats.avgMv.toFixed(2)}</div>
                  <div className={s.statLabel}>Avg MV</div>
                </div>
                <div className={s.statTile}>
                  <div className={s.statValue}>B{bracketInfo.bracket || bracket}</div>
                  <div className={s.statLabel}>Detected Bracket</div>
                </div>
              </div>

              <label className={s.dialLabel} htmlFor="guided-deck-name">
                Deck Name
              </label>
              <input
                id="guided-deck-name"
                type="text"
                className={s.input}
                value={deckName}
                onChange={(e) => setDeckName(e.target.value)}
                placeholder={`${commander.name} (Guided)`}
              />

              <div className={s.actionsRow}>
                <button
                  type="button"
                  className={`${s.btn} ${s.btnPrimary}`}
                  disabled={saving}
                  onClick={() => void saveDeck()}
                >
                  {saving ? 'Saving...' : 'Save to My Decks'}
                </button>
                <button type="button" className={s.btn} onClick={() => void copyList()}>
                  Copy Decklist
                </button>
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

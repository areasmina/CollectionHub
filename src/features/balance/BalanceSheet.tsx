import { useEffect, useMemo, useState } from 'react';
import { applyProposal, balanceDeck, bracketPath, proposalImpact } from '../../brain/balance';
import type { DeckContext } from '../../brain/score';
import { readDeck } from '../../brain/session';
import type { Aggression } from '../../brain/win';
import { BASICS } from '../../lib/compare';
import { db, type Card, type Deck } from '../../lib/db';
import { applyDeckCards } from '../../lib/deckedit';
import type { BracketCall } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import type { SubCard } from '../../lib/subs';
import type { Toast } from '../../views/CardMenu';
import styles from './BalanceSheet.module.css';

export function BalanceSheet({
  deck,
  ctx,
  candidates,
  identity,
  pinned,
  never,
  recOf,
  cardOf,
  call,
  gameChangers,
  onToast,
  onClose,
}: {
  deck: Deck;
  ctx: DeckContext;
  candidates: SubCard[];
  identity: string[];
  pinned: string[];
  never: Set<string>;
  recOf: (name: string) => SubCard | undefined;
  cardOf: (name: string) => Card | undefined;
  call: BracketCall;
  aggression: Aggression;
  gameChangers?: Set<string> | null;
  onToast: (t: Toast) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'balance' | 'cutlab' | 'bracket'>('balance');
  const [brainOnly, setBrainOnly] = useState(false);
  const [allowSwapsAt100, setAllowSwapsAt100] = useState(true);
  const [staleNotice, setStaleNotice] = useState('');
  const [openedUpdated, setOpenedUpdated] = useState(deck.updated);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const evalCtx: DeckContext = useMemo(
    () => ({
      ...ctx,
      cardOf: (name: string) =>
        ctx.cardOf(name) ?? (BASICS.has(norm(name)) ? { type: 'Basic Land', text: '', cmc: 0 } : undefined),
      evidence: brainOnly ? 'own' : 'edhrec',
    }),
    [ctx, brainOnly],
  );

  // Proposal computed once per mode/deck update; unticking never substitutes another card.
  const proposal = useMemo(
    () =>
      balanceDeck({
        ctx: evalCtx,
        candidates,
        identity,
        partner: deck.partner,
        pinned,
        never,
        recOf,
        gameChangers,
        allowSwapsAt100,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deck.updated, brainOnly, allowSwapsAt100, candidates.length],
  );

  const [ticked, setTicked] = useState<Set<string>>(() => new Set(proposal.items.map((i) => i.id)));
  useEffect(() => {
    setTicked(new Set(proposal.items.map((i) => i.id)));
  }, [proposal]);

  const afterDeck = useMemo(
    () => applyProposal(deck.cards, proposal.items, ticked),
    [deck.cards, proposal.items, ticked],
  );
  const impact = useMemo(
    () => proposalImpact(deck.cards, afterDeck, evalCtx, proposal.targetLands),
    [deck.cards, afterDeck, evalCtx, proposal.targetLands],
  );

  const toggleTick = (id: string) => {
    haptic('select');
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const confirmBalance = async () => {
    if (deck.id) {
      const live = await db.decks.get(deck.id);
      if (live && live.updated !== openedUpdated) {
        setOpenedUpdated(live.updated);
        setStaleNotice('Deck changed in another tab or sync — review the refreshed plan before confirming.');
        return;
      }
    }
    haptic('success');
    const undo = await applyDeckCards(deck, afterDeck, 'Balance to 100');
    onToast({ text: `Balanced ${deck.name} (${ticked.size} changes)`, undo });
    onClose();
  };

  // Cut Lab: 1-by-1 interactive trimmer over weakest cards
  const labQueue = useMemo(() => {
    const allPinned = [...pinned, ...(deck.partner ? [deck.partner] : [])];
    return readDeck({ ctx: evalCtx, candidates, recOf, pinned: allPinned, cuts: 24 }).cuts;
  }, [evalCtx, candidates, recOf, pinned, deck.partner]);

  const [labIdx, setLabIdx] = useState(0);
  const [labCuts, setLabCuts] = useState<Set<string>>(() => new Set());
  const [labLocked, setLabLocked] = useState<Set<string>>(() => new Set());
  const [labDeferred, setLabDeferred] = useState<string[]>([]);

  const activeQueue = useMemo(
    () => [
      ...labQueue.filter((c) => !labCuts.has(c.name) && !labLocked.has(c.name) && !labDeferred.includes(c.name)),
      ...labQueue.filter((c) => labDeferred.includes(c.name) && !labCuts.has(c.name) && !labLocked.has(c.name)),
    ],
    [labQueue, labCuts, labLocked, labDeferred],
  );
  const currentLabCard = activeQueue[labIdx % Math.max(1, activeQueue.length)];
  const currentTotal = deck.cards.reduce((n, c) => n + c.qty, 0);
  const afterTotal = afterDeck.reduce((n, c) => n + c.qty, 0);

  const applyCutLab = async () => {
    if (!labCuts.size) return;
    haptic('success');
    const cutKeys = new Set([...labCuts].map(norm));
    const nextCards = deck.cards.flatMap((c) => {
      if (!cutKeys.has(norm(c.name))) return [c];
      return c.qty > 1 ? [{ ...c, qty: c.qty - 1 }] : [];
    });
    const undo = await applyDeckCards(deck, nextCards, 'Cut Lab');
    onToast({ text: `Cut ${labCuts.size} ${labCuts.size === 1 ? 'card' : 'cards'} via Cut Lab`, undo });
    onClose();
  };

  // One Path to Bracket X
  const [targetBracket, setTargetBracket] = useState<2 | 3>(3);
  const bPlan = useMemo(
    () => bracketPath(call, targetBracket, deck.commander, deck.partner),
    [call, targetBracket, deck.commander, deck.partner],
  );
  const [bTicked, setBTicked] = useState<Set<string>>(() => new Set(bPlan.actions.map((a) => a.card)));
  useEffect(() => {
    setBTicked(new Set(bPlan.actions.map((a) => a.card)));
  }, [bPlan]);

  const applyBracketCuts = async () => {
    if (!bTicked.size) return;
    haptic('success');
    const drop = new Set([...bTicked].map(norm));
    const nextCards = deck.cards.filter((c) => !drop.has(norm(c.name)));
    const undo = await applyDeckCards(deck, nextCards, `Path to Bracket ${targetBracket}`);
    onToast({ text: `Applied ${bTicked.size} cuts toward Bracket ${targetBracket}`, undo });
    onClose();
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Balance ${deck.name}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>BALANCE &amp; CUT LAB</h2>
          <div className={styles.tabs} role="tablist" aria-label="Balance modes">
            <button type="button" role="tab" id="bal-tab-balance" aria-controls="bal-panel-balance" className={styles.tabBtn} aria-selected={tab === 'balance'} onClick={() => (haptic('select'), setTab('balance'))}>
              BALANCE TO 100
            </button>
            <button type="button" role="tab" id="bal-tab-cutlab" aria-controls="bal-panel-cutlab" className={styles.tabBtn} aria-selected={tab === 'cutlab'} onClick={() => (haptic('select'), setTab('cutlab'))}>
              CUT LAB
            </button>
            <button type="button" role="tab" id="bal-tab-bracket" aria-controls="bal-panel-bracket" className={styles.tabBtn} aria-selected={tab === 'bracket'} onClick={() => (haptic('select'), setTab('bracket'))}>
              BRACKET PATH
            </button>
          </div>
          <button type="button" className={styles.close} aria-label="Close balance sheet" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {staleNotice && (
            <p className={styles.note} role="status" style={{ borderLeftColor: 'var(--mo-red)', color: '#ff6b76' }}>
              {staleNotice}
            </p>
          )}

          {tab === 'balance' && (
            <div id="bal-panel-balance" role="tabpanel" aria-labelledby="bal-tab-balance">
              <div className={styles.toolbar}>
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.toggleBtn}
                    aria-pressed={brainOnly}
                    onClick={() => (haptic('select'), setBrainOnly((v) => !v))}
                  >
                    {brainOnly ? 'OUR BRAIN ONLY: ON' : 'OUR BRAIN + EDHREC'}
                  </button>
                  {proposal.mode === 'at100' && (
                    <button
                      type="button"
                      className={styles.toggleBtn}
                      aria-pressed={allowSwapsAt100}
                      onClick={() => (haptic('select'), setAllowSwapsAt100((v) => !v))}
                    >
                      {allowSwapsAt100 ? 'SWAPS AT 100: ON' : 'SWAPS AT 100: OFF'}
                    </button>
                  )}
                  {proposal.items.length > 3 && (
                    <button
                      type="button"
                      className={styles.toggleBtn}
                      onClick={() => {
                        haptic('select');
                        setTicked(ticked.size === proposal.items.length ? new Set() : new Set(proposal.items.map((i) => i.id)));
                      }}
                    >
                      {ticked.size === proposal.items.length ? 'CLEAR ALL' : 'SELECT ALL'}
                    </button>
                  )}
                </div>
                <span style={{ fontFamily: 'var(--mo-mono)', fontSize: 11.5, color: 'var(--mo-muted)' }}>
                  Deck: {currentTotal} → {afterTotal} cards · Owned first
                </span>
              </div>

              <div className={styles.impactGrid} aria-label="Before and after category impact">
                {impact.map((s) => (
                  <div key={s.key} className={styles.impactBox}>
                    <span className={styles.impactLbl}>{s.label}</span>
                    <span className={styles.impactVal}>
                      {s.before} → {s.after}
                    </span>
                    {s.range && (
                      <span className={styles.impactRange}>
                        target {s.range[0] === s.range[1] ? s.range[0] : `${s.range[0]}–${s.range[1]}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>

              {proposal.mode !== 'under' && (
                <p className={styles.note}>
                  Popularity is not power: a card few decks play can be the right card here, and a popular card can be dead weight in your build.
                </p>
              )}

              {proposal.items.length === 0 ? (
                <p className={styles.note}>
                  {proposal.currentCount === 100
                    ? 'Your deck is already at 100 cards with core categories in range!'
                    : 'No automatic changes needed right now.'}
                </p>
              ) : (
                <ul className={styles.rows}>
                  {proposal.items.map((item) => {
                    const checked = ticked.has(item.id);
                    const refLabel =
                      item.incl != null
                        ? `${Math.round(item.incl * 100)}% EDHREC${item.lift != null ? ` · ${item.lift.toFixed(1)}x` : ''}`
                        : 'binder / brain';
                    return (
                      <li key={item.id}>
                        <label className={styles.row} data-checked={checked}>
                          <input type="checkbox" className={styles.checkbox} checked={checked} onChange={() => toggleTick(item.id)} />
                          <span className={styles.kindBadge} data-kind={item.kind}>
                            {item.kind === 'add' ? '+ ADD' : item.kind === 'cut' ? '− CUT' : '⇄ SWAP'}
                          </span>
                          <div className={styles.rowMain}>
                            <span className={styles.rowName}>
                              {item.kind === 'add' ? item.add : item.kind === 'cut' ? item.cut : `${item.cut} → ${item.add}`}
                            </span>
                            <span className={styles.rowWhy}>
                              {item.why}
                              {item.taken ? ` · ${item.taken}` : ''}
                            </span>
                            {item.afterCut && <span className={styles.rowWarn}>{item.afterCut}</span>}
                          </div>
                          <span className={styles.refPill}>{refLabel}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {tab === 'cutlab' && (
            <div id="bal-panel-cutlab" role="tabpanel" aria-labelledby="bal-tab-cutlab">
              <div className={styles.toolbar}>
                <span style={{ fontFamily: 'var(--mo-mono)', fontSize: 12, color: 'var(--mo-muted)' }}>
                  Deck: {currentTotal} → {currentTotal - labCuts.size} cards · {labCuts.size} queued to cut · {labLocked.size} locked
                </span>
              </div>

              {!currentLabCard ? (
                <p className={styles.note}>All candidate cuts have been reviewed or locked. Apply your queued cuts below or close.</p>
              ) : (
                <div className={styles.labCard}>
                  {cardOf(currentLabCard.name)?.img ? (
                    <img src={cardOf(currentLabCard.name)!.img!.replace('/small/', '/normal/')} alt={currentLabCard.name} className={styles.labArt} />
                  ) : (
                    <div className={styles.labPlaceholder}>{currentLabCard.name}</div>
                  )}
                  <div className={styles.labInfo}>
                    <div>
                      <span className={styles.impactLbl}>WEAKEST CANDIDATE</span>
                      <h3 style={{ margin: '4px 0', fontFamily: 'var(--mo-display)', fontSize: 22 }}>{currentLabCard.name}</h3>
                      <p className={styles.rowWhy} style={{ margin: 0 }}>
                        {currentLabCard.why}
                      </p>
                      {currentLabCard.holds && (
                        <p className={styles.rowWarn} style={{ margin: '6px 0 0' }}>
                          Holds {currentLabCard.holds} — consider swapping rather than cutting flat.
                        </p>
                      )}
                    </div>
                    <div className={styles.btnRow}>
                      <button
                        type="button"
                        className={`${styles.btn} ${styles.btnPrimary}`}
                        onClick={() => {
                          haptic('select');
                          setLabCuts((prev) => new Set([...prev, currentLabCard.name]));
                        }}
                      >
                        − CUT CARD
                      </button>
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => {
                          haptic('select');
                          setLabLocked((prev) => new Set([...prev, currentLabCard.name]));
                        }}
                      >
                        KEEP (LOCK)
                      </button>
                      <button
                        type="button"
                        className={styles.btn}
                        onClick={() => {
                          haptic('tap');
                          setLabDeferred((prev) => [...prev.filter((x) => x !== currentLabCard.name), currentLabCard.name]);
                          setLabIdx((i) => i + 1);
                        }}
                      >
                        DEFER →
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'bracket' && (
            <div id="bal-panel-bracket" role="tabpanel" aria-labelledby="bal-tab-bracket">
              <div className={styles.toolbar}>
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.toggleBtn}
                    aria-pressed={targetBracket === 2}
                    onClick={() => (haptic('select'), setTargetBracket(2))}
                  >
                    PATH TO BRACKET II
                  </button>
                  <button
                    type="button"
                    className={styles.toggleBtn}
                    aria-pressed={targetBracket === 3}
                    onClick={() => (haptic('select'), setTargetBracket(3))}
                  >
                    PATH TO BRACKET III
                  </button>
                </div>
                <span style={{ fontFamily: 'var(--mo-mono)', fontSize: 12, color: 'var(--mo-muted)' }}>
                  Current estimate: Bracket {call.bracket || '?'}
                </span>
              </div>

              {bPlan.fits ? (
                <p className={styles.note}>Your deck already fits Bracket {targetBracket === 2 ? 'II' : 'III'} — no cuts required.</p>
              ) : bPlan.actions.length === 0 ? (
                <p className={styles.note}>No objective rule cuts detected for Bracket {targetBracket === 2 ? 'II' : 'III'}.</p>
              ) : (
                <ul className={styles.rows}>
                  {bPlan.actions.map((a) => {
                    const checked = bTicked.has(a.card);
                    return (
                      <li key={a.card}>
                        <label className={styles.row} data-checked={checked}>
                          <input
                            type="checkbox"
                            className={styles.checkbox}
                            checked={checked}
                            onChange={() => {
                              haptic('select');
                              setBTicked((prev) => {
                                const next = new Set(prev);
                                if (next.has(a.card)) next.delete(a.card);
                                else next.add(a.card);
                                return next;
                              });
                            }}
                          />
                          <span className={styles.kindBadge} data-kind="cut">
                            − CUT
                          </span>
                          <div className={styles.rowMain}>
                            <span className={styles.rowName}>{a.card}</span>
                            <span className={styles.rowWhy}>{a.reason}</span>
                          </div>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className={styles.foot}>
          <button type="button" className={styles.btn} onClick={onClose}>
            CANCEL
          </button>
          {tab === 'balance' && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={ticked.size === 0} onClick={confirmBalance}>
              CONFIRM SELECTED ({ticked.size})
            </button>
          )}
          {tab === 'cutlab' && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={labCuts.size === 0} onClick={applyCutLab}>
              CONFIRM CUTS ({labCuts.size})
            </button>
          )}
          {tab === 'bracket' && (
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={bTicked.size === 0} onClick={applyBracketCuts}>
              APPLY BRACKET CUTS ({bTicked.size})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

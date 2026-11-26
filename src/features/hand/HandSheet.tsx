import { useMemo, useState } from 'react';
import { BASICS } from '../../lib/compare';
import type { Card, DeckCard } from '../../lib/db';
import { isLand, roleOf, type DeckStats } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import { buildLibrary, hypergeomAtLeast, keepVerdict, shuffle } from './handMath';
import styles from './HandSheet.module.css';

interface HandState {
  hand: string[];
  library: string[];
  turn: number;
  mulligans: number;
  toBottom: number;
}

function dealOpening(cards: DeckCard[], commander?: string, partner?: string, mulligans = 0): HandState {
  const full = shuffle(buildLibrary(cards, commander, partner));
  const drawN = Math.min(7, full.length);
  const toBottom = mulligans > 1 ? Math.min(mulligans - 1, Math.max(0, drawN - 1)) : 0;
  return {
    hand: full.slice(0, drawN),
    library: full.slice(drawN),
    turn: 1,
    mulligans,
    toBottom,
  };
}

export function HandSheet({
  deckName,
  cards,
  commander,
  partner,
  st,
  cardOf,
  onClose,
}: {
  deckName: string;
  cards: DeckCard[];
  commander?: string;
  partner?: string;
  st: DeckStats;
  cardOf: (name: string) => Card | undefined;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'hand' | 'odds'>('hand');
  const [state, setState] = useState<HandState>(() => dealOpening(cards, commander, partner, 0));

  const isDeckLand = (name: string) => isLand(cardOf(name)?.type) || BASICS.has(norm(name));

  const handLands = useMemo(
    () => state.hand.filter(isDeckLand).length,
    [state.hand, cardOf], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const verdict = keepVerdict(handLands, state.hand.length);
  const librarySize = useMemo(() => buildLibrary(cards, commander, partner).length, [cards, commander, partner]);

  const roleCounts = useMemo(() => {
    let lands = 0;
    let ramp = 0;
    let draw = 0;
    let removal = 0;
    let wipes = 0;
    for (const n of buildLibrary(cards, commander, partner)) {
      const c = cardOf(n);
      if (isLand(c?.type) || BASICS.has(norm(n))) {
        lands++;
        continue;
      }
      if (!c) continue;
      const roles = roleOf({ type: c.type, text: c.text, name: n });
      if (roles.includes('ramp')) ramp++;
      if (roles.includes('draw')) draw++;
      if (roles.includes('removal')) removal++;
      if (roles.includes('wipes')) wipes++;
    }
    return { lands, ramp, draw, removal, wipes };
  }, [cards, commander, partner, cardOf]);

  const pct = (p: number) => `${Math.round(p * 100)}%`;

  const bottomCard = (idx: number) => {
    if (state.toBottom <= 0) return;
    haptic('tap');
    setState((prev) => {
      const card = prev.hand[idx];
      const nextHand = prev.hand.filter((_, i) => i !== idx);
      return {
        ...prev,
        hand: nextHand,
        library: [...prev.library, card],
        toBottom: prev.toBottom - 1,
      };
    });
  };

  const drawOne = () => {
    if (!state.library.length || state.toBottom > 0) return;
    haptic('select');
    setState((prev) => ({
      ...prev,
      hand: [...prev.hand, prev.library[0]],
      library: prev.library.slice(1),
      turn: prev.turn + 1,
    }));
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Opening hand and draw odds for ${deckName}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>HAND &amp; DRAW ODDS</h2>
          <div className={styles.tabs} role="tablist" aria-label="Simulator mode">
            <button type="button" role="tab" className={styles.tabBtn} aria-selected={tab === 'hand'} onClick={() => (haptic('select'), setTab('hand'))}>
              OPENING 7
            </button>
            <button type="button" role="tab" className={styles.tabBtn} aria-selected={tab === 'odds'} onClick={() => (haptic('select'), setTab('odds'))}>
              DRAW ODDS
            </button>
          </div>
          <button type="button" className={styles.close} aria-label="Close hand simulator" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'hand' ? (
            <>
              <div className={styles.controls}>
                <div className={styles.btnRow}>
                  <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => (haptic('select'), setState(dealOpening(cards, commander, partner, 0)))}>
                    NEW HAND
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => (haptic('select'), setState((prev) => dealOpening(cards, commander, partner, prev.mulligans + 1)))}
                  >
                    {state.mulligans === 0 ? 'FREE MULLIGAN' : `MULLIGAN (${state.mulligans + 1})`}
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    disabled={!state.library.length || state.toBottom > 0}
                    onClick={drawOne}
                  >
                    + DRAW 1 (T{state.turn + 1})
                  </button>
                </div>
                <span style={{ fontFamily: 'var(--mo-mono)', fontSize: 12, color: 'var(--mo-muted)' }}>
                  Turn {state.turn} · {state.library.length} left in library
                </span>
              </div>

              <div className={styles.verdictBar} role="status">
                <span className={styles.badge} data-tone={verdict.tone}>
                  {verdict.label}
                </span>
                <span>
                  {state.toBottom > 0
                    ? `London Mulligan: tap ${state.toBottom} ${state.toBottom === 1 ? 'card' : 'cards'} below to put on the bottom.`
                    : `${handLands} ${handLands === 1 ? 'land' : 'lands'} in ${state.hand.length} cards — ${verdict.note}`}
                </span>
              </div>

              <ul className={styles.handGrid}>
                {state.hand.map((name, i) => {
                  const c = cardOf(name);
                  return (
                    <li key={`${name}-${i}`} className={styles.handCard} data-bottoming={state.toBottom > 0}>
                      <button
                        type="button"
                        className={styles.handCardBtn}
                        disabled={state.toBottom <= 0}
                        title={state.toBottom > 0 ? `Put ${name} on bottom` : name}
                        onClick={() => bottomCard(i)}
                      >
                        {c?.img ? (
                          <img src={c.img} alt={name} className={styles.handImg} />
                        ) : (
                          <div className={styles.handPlaceholder}>{name}</div>
                        )}
                        <span className={styles.handName}>{name}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <>
              <p style={{ margin: 0, fontFamily: 'var(--mo-mono)', fontSize: 12, color: 'var(--mo-muted)' }}>
                Exact hypergeometric odds over {librarySize} library cards (commander excluded). Each row is independent — don&apos;t add overlapping categories.
              </p>
              <table className={styles.oddsTable}>
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>In Deck</th>
                    <th>Turn 1 (7)</th>
                    <th>Turn 4 (10)</th>
                    <th>Turn 7 (13)</th>
                  </tr>
                </thead>
                <tbody>
                  {(
                    [
                      ['Lands (≥1)', roleCounts.lands || st.lands, 1],
                      ['Lands (≥2)', roleCounts.lands || st.lands, 2],
                      ['Lands (≥3)', roleCounts.lands || st.lands, 3],
                      ['Ramp (≥1)', roleCounts.ramp, 1],
                      ['Card Draw (≥1)', roleCounts.draw, 1],
                      ['Removal (≥1)', roleCounts.removal, 1],
                      ['Board Wipes (≥1)', roleCounts.wipes, 1],
                    ] as const
                  ).map(([label, count, need]) => (
                    <tr key={label}>
                      <td>{label}</td>
                      <td>{count}</td>
                      <td className={styles.pctCell}>{pct(hypergeomAtLeast(librarySize, count, 7, need))}</td>
                      <td className={styles.pctCell}>{pct(hypergeomAtLeast(librarySize, count, 10, need))}</td>
                      <td className={styles.pctCell}>{pct(hypergeomAtLeast(librarySize, count, 13, need))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

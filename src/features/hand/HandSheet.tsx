import { useEffect, useMemo, useState } from 'react';
import { BASICS } from '../../lib/compare';
import type { Card, DeckCard } from '../../lib/db';
import { isLand, roleOf, type DeckStats } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { norm } from '../../lib/names';
import {
  advanceTurn,
  availableMana,
  bottomGoldfishCard,
  canPlayHandCard,
  castFromCommandZone,
  dealGoldfish,
  isDeckLand,
  maxManaPool,
  playHandCard,
  returnCommanderToZone,
  togglePermanentTap,
  type GoldfishState,
} from './goldfish';
import { buildLibrary, hypergeomAtLeast, keepVerdict } from './handMath';
import styles from './HandSheet.module.css';

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
  const [state, setState] = useState<GoldfishState>(() => dealGoldfish(cards, commander, partner, 0));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const handLands = useMemo(
    () => state.hand.filter((n) => isDeckLand(n, cardOf(n))).length,
    [state.hand, cardOf],
  );
  const verdict = keepVerdict(handLands, state.hand.length);
  const librarySize = useMemo(() => buildLibrary(cards, commander, partner).length, [cards, commander, partner]);
  const avail = availableMana(state);
  const maxPool = maxManaPool(state);

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

  const landsOnField = state.battlefield.filter((p) => p.isLand);
  const spellsOnField = state.battlefield.filter((p) => !p.isLand);

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`Goldfish playtester and draw odds for ${deckName}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.head}>
          <h2 className={styles.title}>GOLDFISH &amp; DRAW ODDS</h2>
          <div className={styles.tabs} role="tablist" aria-label="Simulator mode">
            <button
              type="button"
              role="tab"
              id="hand-tab-goldfish"
              aria-controls="hand-panel-goldfish"
              className={styles.tabBtn}
              aria-selected={tab === 'hand'}
              onClick={() => (haptic('select'), setTab('hand'))}
            >
              GOLDFISH
            </button>
            <button
              type="button"
              role="tab"
              id="hand-tab-odds"
              aria-controls="hand-panel-odds"
              className={styles.tabBtn}
              aria-selected={tab === 'odds'}
              onClick={() => (haptic('select'), setTab('odds'))}
            >
              DRAW ODDS
            </button>
          </div>
          <button type="button" className={styles.close} aria-label="Close hand simulator" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.body}>
          {tab === 'hand' ? (
            <div id="hand-panel-goldfish" role="tabpanel" aria-labelledby="hand-tab-goldfish" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mo-s3)' }}>
              <div className={styles.controls}>
                <div className={styles.btnRow}>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => (haptic('select'), setState(dealGoldfish(cards, commander, partner, 0)))}
                  >
                    NEW HAND
                  </button>
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={() => (haptic('select'), setState((prev) => dealGoldfish(cards, commander, partner, prev.mulligans + 1)))}
                  >
                    {state.mulligans === 0 ? 'FREE MULLIGAN' : `MULLIGAN (${state.mulligans + 1})`}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${state.toBottom === 0 ? styles.btnPrimary : ''}`}
                    disabled={!state.library.length || state.toBottom > 0}
                    onClick={() => (haptic('select'), setState((prev) => advanceTurn(prev)))}
                  >
                    + NEXT TURN (T{state.turn + 1})
                  </button>
                </div>
                <span className={styles.statusLine}>
                  Turn {state.turn} · Mana {avail}/{maxPool} · {state.landsPlayedThisTurn ? 'Land used' : 'Land ready'} · Lib {state.library.length}
                  {state.graveyard.length > 0 ? ` · GY ${state.graveyard.length}` : ''}
                </span>
              </div>

              <div className={styles.verdictBar} role="status">
                {state.toBottom > 0 ? (
                  <>
                    <span className={styles.badge} data-tone="warn">MULLIGAN</span>
                    <span>London Mulligan: tap {state.toBottom} {state.toBottom === 1 ? 'card' : 'cards'} below to put on bottom.</span>
                  </>
                ) : state.turn === 1 && state.battlefield.length === 0 ? (
                  <>
                    <span className={styles.badge} data-tone={verdict.tone}>{verdict.label}</span>
                    <span>{handLands} {handLands === 1 ? 'land' : 'lands'} in {state.hand.length} cards — {verdict.note} Tap any land or castable spell to play.</span>
                  </>
                ) : (
                  <>
                    <span className={styles.badge} data-tone="ok">T{state.turn}</span>
                    <span>{state.log.at(-1) ?? 'Tap cards in hand to play; + NEXT TURN untaps and draws.'}</span>
                  </>
                )}
              </div>

              {(state.commandZone.length > 0 || state.battlefield.length > 0) && (
                <div className={styles.boardBox} aria-label="Command zone and battlefield">
                  {state.commandZone.length > 0 && (
                    <div className={styles.zoneRow}>
                      <span className={styles.zoneLbl}>COMMAND ZONE</span>
                      <div className={styles.zoneItems}>
                        {state.commandZone.map((cz, i) => {
                          const c = cardOf(cz.name);
                          const cost = Math.max(0, Math.round(c?.cmc ?? 0)) + cz.casts * 2;
                          const canCast = state.toBottom === 0 && avail >= cost;
                          return (
                            <button
                              key={cz.name}
                              type="button"
                              className={styles.permChip}
                              data-playable={canCast}
                              disabled={!canCast}
                              title={canCast ? `Cast ${cz.name} for ${cost} mana` : `Needs ${cost} mana (${avail} available)`}
                              onClick={() => (haptic('success'), setState((prev) => castFromCommandZone(prev, i, cardOf)))}
                            >
                              {cz.name.split(',')[0]} · {cost}M{cz.casts > 0 ? ` (+${cz.casts * 2} tax)` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {landsOnField.length > 0 && (
                    <div className={styles.zoneRow}>
                      <span className={styles.zoneLbl}>LANDS ({landsOnField.length})</span>
                      <div className={styles.zoneItems}>
                        {landsOnField.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            className={styles.permChip}
                            data-tapped={p.tapped}
                            title={`Click to ${p.tapped ? 'untap' : 'tap'} ${p.name}`}
                            onClick={() => (haptic('tap'), setState((prev) => togglePermanentTap(prev, p.id)))}
                          >
                            {p.tapped ? '⟳ ' : ''}{p.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {spellsOnField.length > 0 && (
                    <div className={styles.zoneRow}>
                      <span className={styles.zoneLbl}>BATTLEFIELD ({spellsOnField.length})</span>
                      <div className={styles.zoneItems}>
                        {spellsOnField.map((p) => (
                          <span key={p.id} className={styles.permWrap}>
                            <button
                              type="button"
                              className={styles.permChip}
                              data-tapped={p.tapped}
                              onClick={() => (haptic('tap'), setState((prev) => togglePermanentTap(prev, p.id)))}
                            >
                              {p.tapped ? '⟳ ' : ''}{p.name.split(',')[0]}
                              {p.manaProduced > 0 ? ` (+${p.manaProduced}M)` : ''}
                            </button>
                            {p.isCommander && (
                              <button
                                type="button"
                                className={styles.czReturn}
                                title={`Return ${p.name} to Command Zone`}
                                onClick={() => (haptic('select'), setState((prev) => returnCommanderToZone(prev, p.id)))}
                              >
                                →CZ
                              </button>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <ul className={styles.handGrid} aria-label="Cards in hand">
                {state.hand.map((name, i) => {
                  const c = cardOf(name);
                  const playCheck = state.toBottom > 0 ? null : canPlayHandCard(state, i, cardOf);
                  const canAct = state.toBottom > 0 || !!playCheck?.ok;
                  const tip = state.toBottom > 0 ? `Put ${name} on bottom` : playCheck?.ok ? `Play ${name}${playCheck.cost > 0 ? ` (${playCheck.cost} mana)` : ''}` : playCheck?.reason ?? name;
                  return (
                    <li
                      key={`${name}-${i}`}
                      className={styles.handCard}
                      data-bottoming={state.toBottom > 0}
                      data-playable={playCheck?.ok ? 'true' : undefined}
                    >
                      <button
                        type="button"
                        className={styles.handCardBtn}
                        disabled={!canAct}
                        title={tip}
                        onClick={() => {
                          if (state.toBottom > 0) {
                            haptic('tap');
                            setState((prev) => bottomGoldfishCard(prev, i));
                          } else if (playCheck?.ok) {
                            haptic('select');
                            setState((prev) => playHandCard(prev, i, cardOf));
                          }
                        }}
                      >
                        {c?.img ? (
                          <img src={c.img} alt={name} className={styles.handImg} />
                        ) : (
                          <div className={styles.handPlaceholder}>{name}</div>
                        )}
                        <span className={styles.handName}>
                          {name}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <div id="hand-panel-odds" role="tabpanel" aria-labelledby="hand-tab-odds" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--mo-s3)' }}>
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

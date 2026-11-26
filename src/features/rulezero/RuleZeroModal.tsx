import { useState } from 'react';
import type { BracketCall, DeckStats } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { Pips } from '../../views/zine';
import styles from './RuleZeroModal.module.css';

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

export function RuleZeroModal({
  deckName,
  commander,
  commanderImg,
  ci,
  ownedPct,
  st,
  call,
  cedh,
  onClose,
}: {
  deckName: string;
  commander?: string;
  commanderImg?: string;
  ci: string[];
  ownedPct: number;
  st: DeckStats;
  call: BracketCall;
  cedh?: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const bracketLabel = cedh ? 'V (cEDH)' : call.bracket ? `${ROMAN[call.bracket]} (${call.bracket})` : 'Unrated';

  const summaryText = [
    `RULE ZERO — ${deckName}`,
    commander ? `Commander: ${commander}` : null,
    `Bracket Estimate: ${bracketLabel} · Built from my binder (${ownedPct}% owned)`,
    `Stats: ${st.total} cards · ${st.lands} lands · avg MV ${st.avgMv.toFixed(2)}`,
    `Roles: ${st.roles.ramp} ramp · ${st.roles.draw} draw · ${st.roles.removal} removal · ${st.roles.wipes} wipes · ${st.roles.tutors} tutors`,
    `Game Changers (${call.gameChangers.length}): ${call.gameChangers.length ? call.gameChangers.join(', ') : 'None'}`,
    `2-Card Combos (${call.combos.length}): ${call.combos.length ? call.combos.map((c) => `${c.cards.join(' + ')}${c.early ? ' [early]' : ''}`).join('; ') : 'None'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const copyPod = async () => {
    haptic('success');
    await navigator.clipboard?.writeText(summaryText).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className={styles.backdrop} role="presentation" onClick={onClose}>
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={`Rule Zero summary for ${deckName}`} onClick={(e) => e.stopPropagation()}>
        <div className={styles.top}>
          {commanderImg && <img src={commanderImg} alt={commander ?? deckName} className={styles.art} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className={styles.kicker}>RULE ZERO · POD BRIEF</span>
            <h2 className={styles.deckName}>{deckName}</h2>
            <div className={styles.sub} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
              <Pips ci={ci} size={16} />
              {commander && <span>{commander}</span>}
              <span>· {ownedPct}% owned in binder</span>
            </div>
          </div>
          <button type="button" className={styles.close} aria-label="Close Rule Zero card" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles.statsGrid}>
          <div className={styles.statBox}>
            <span className={styles.statLbl}>BRACKET</span>
            <span className={styles.statVal}>{bracketLabel}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLbl}>GAME CHANGERS</span>
            <span className={styles.statVal}>{call.gameChangers.length}</span>
          </div>
          <div className={styles.statBox}>
            <span className={styles.statLbl}>2-CARD COMBOS</span>
            <span className={styles.statVal}>{call.combos.length}</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.secTitle}>DECK SHAPE</div>
          <div className={styles.rolesRow}>
            <span>{st.lands} lands</span>
            <span>· {st.roles.ramp} ramp</span>
            <span>· {st.roles.draw} draw</span>
            <span>· {st.roles.removal} removal</span>
            <span>· {st.roles.wipes} wipes</span>
            <span>· {st.avgMv.toFixed(2)} avg MV</span>
          </div>
        </div>

        <div className={styles.section}>
          <div className={styles.secTitle}>GAME CHANGERS ({call.gameChangers.length})</div>
          {call.gameChangers.length ? (
            <p className={styles.list} style={{ paddingLeft: 0 }}>
              {call.gameChangers.join(', ')}
            </p>
          ) : (
            <p className={styles.sub} style={{ margin: 0 }}>
              None in this list.
            </p>
          )}
        </div>

        <div className={styles.section}>
          <div className={styles.secTitle}>TWO-CARD COMBOS ({call.combos.length})</div>
          {call.combos.length ? (
            <ul className={styles.list}>
              {call.combos.map((c) => (
                <li key={c.id}>
                  {c.cards.join(' + ')} {c.early ? '(early ≤4 mana)' : `(MV ${c.mv})`}
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.sub} style={{ margin: 0 }}>
              {call.combosChecked ? 'No known two-card combos.' : 'Combo index still loading.'}
            </p>
          )}
        </div>

        <button type="button" className={styles.copyBtn} onClick={copyPod}>
          {copied ? 'COPIED POD SUMMARY ✓' : 'COPY FOR POD'}
        </button>
      </div>
    </div>
  );
}

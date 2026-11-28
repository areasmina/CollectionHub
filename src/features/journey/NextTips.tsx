import { haptic } from '../../lib/haptics';
import type { NextTip } from '../../lib/journey';
import css from './NextTips.module.css';

/**
 * NEXT (journey step 3): at most two "go here next" tips under the journey bar, each with its reason in a line of its
 * own, quoted from the deck's Readiness checks. A tip is a door, never an action on the deck by itself.
 */
export function NextTips({ tips, onGo }: { tips: readonly NextTip[]; onGo: (tip: NextTip) => void }) {
  if (!tips.length) return null;
  return (
    <ul className={css.list} aria-label="Next steps for this deck">
      {tips.map((t) => (
        <li key={t.key} className={css.tip}>
          <button type="button" className={css.go} onClick={() => (haptic('select'), onGo(t))}>
            <b className={css.tag}>NEXT</b>
            <span className={css.text}>{t.text}</span>
            <span className={css.arrow} aria-hidden="true">
              →
            </span>
          </button>
          <p className={css.why}>why: {t.why}</p>
        </li>
      ))}
    </ul>
  );
}

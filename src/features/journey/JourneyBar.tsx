import { haptic } from '../../lib/haptics';
import { JOURNEY_HINT, JOURNEY_LABEL, JOURNEY_STEPS, type JourneyStep } from '../../lib/journey';
import css from './JourneyBar.module.css';

/**
 * START · EXPLORE · TUNE: the same three stops on Guided, the tag graph and the deck's Forge, so a deck can move
 * between them at any time (Guillermo, Nov 27: "one journey, they play in conjunction"). The stop you are on is
 * marked; a stop that can't be reached yet says why in its title and is greyed, never hidden.
 */
export function JourneyBar({
  current,
  done = [],
  blocked = {},
  onPick,
}: {
  /** The stop you are on; none on a commander's page, before the deck starts. */
  current?: JourneyStep;
  done?: readonly JourneyStep[];
  /** A stop that can't be reached yet, with the reason in plain words. */
  blocked?: Partial<Record<JourneyStep, string>>;
  onPick: (step: JourneyStep) => void;
}) {
  return (
    <nav className={css.bar} aria-label="Deckbuilding journey">
      <ol className={css.steps}>
        {JOURNEY_STEPS.map((step, i) => {
          const on = step === current;
          const why = blocked[step];
          const isDone = !on && done.includes(step);
          return (
            <li key={step} className={css.item}>
              <button
                type="button"
                className={`${css.step}${on ? ` ${css.on}` : ''}${isDone ? ` ${css.done}` : ''}`}
                aria-current={on ? 'step' : undefined}
                aria-disabled={why ? true : undefined}
                title={why ?? JOURNEY_HINT[step]}
                onClick={() => {
                  if (on || why) return;
                  haptic('select');
                  onPick(step);
                }}
              >
                <span className={css.num} aria-hidden="true">
                  {isDone ? '✓' : i + 1}
                </span>
                {JOURNEY_LABEL[step]}
                {why && <span className={css.hidden}>{`: ${why}`}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

import { haptic } from '../../lib/haptics';
import { openCard } from '../../views/shared';

export interface WildcardPick {
  name: string;
  why: string;
  slot: string;
}

export interface CommanderWildcardProps {
  wild?: WildcardPick;
  off?: boolean;
  roll?: number;
  img?: string;
  back?: string;
  onSwapIn: (slot: string, card: string) => void;
  onReroll: (nextRoll: number) => void;
  onToggleOff: (off: boolean) => void;
}

/** HIDDEN GEM · WILDCARD card recommendation strip on CommanderView. */
export function CommanderWildcard({ wild, off, roll, img, back, onSwapIn, onReroll, onToggleOff }: CommanderWildcardProps) {
  if (!wild && !off) return null;
  return (
    <section className="wildcard" aria-label="WILDCARD">
      <b className="wtag">HIDDEN GEM · WILDCARD</b>
      {wild && !off ? (
        <>
          <div className="wbody">
            {img && (
              <button
                type="button"
                className="wthumb-btn"
                aria-label={`Read ${wild.name}`}
                title="Read this card"
                onClick={() => (haptic('open'), openCard(img, wild.name, back))}
              >
                <img src={img} alt="" className="wthumb" loading="lazy" />
                <span className="wzoom" aria-hidden="true">
                  ⤢ READ
                </span>
              </button>
            )}
            <div className="wtxt">
              <b className="wname">{wild.name}</b>
              <div className="wmeta">
                <span className="wbadge">{wild.why}</span>
                <span className="wfor">↔ for {wild.slot}</span>
              </div>
            </div>
          </div>
          <div className="wacts">
            <button className="btn btn-swap-in" onClick={() => (haptic('success'), onSwapIn(wild.slot, wild.name))}>
              SWAP IN
            </button>
            <button className="btn ink wreroll" onClick={() => (haptic('select'), onReroll((roll ?? 0) + 1))} aria-label="Reroll the wildcard">
              ↻ REROLL
            </button>
            <button className="btn ink woff" onClick={() => (haptic('tap'), onToggleOff(true))}>
              OFF
            </button>
          </div>
        </>
      ) : (
        <button className="btn ink" onClick={() => onToggleOff(false)}>
          TURN ON
        </button>
      )}
    </section>
  );
}

/** Confirmation dialog when leaving CommanderView with unsaved Forge swaps. */
export function CommanderLeaveModal({ changes, label, onChoice }: { changes: number; label: string; onChoice: (c: 'save' | 'drop' | 'stay') => void }) {
  return (
    <>
      <div className="backdrop leaveback" onClick={() => onChoice('stay')} />
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
          <button className="btn forge" onClick={() => onChoice('save')}>
            SAVE
          </button>
          <button className="btn ink" onClick={() => onChoice('drop')}>
            DISCARD
          </button>
          <button className="lkeep" onClick={() => onChoice('stay')}>
            keep forging
          </button>
        </div>
      </div>
    </>
  );
}

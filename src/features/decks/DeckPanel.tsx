import { type ReactNode } from 'react';
import { type Deck } from '../../lib/db';
import { analysis, GROUPS, roleSource, type DeckStats } from '../../lib/deckstats';
import { haptic } from '../../lib/haptics';
import { useStored } from '../../views/shared';
import { Curve, DeckNotes } from './DeckMetaParts';

const PIPC: Record<string, string> = { W: '#E9DDB5', U: '#3F6FC6', B: '#2A2A30', R: '#B5463A', G: '#2F7D4A', C: '#8A8A8A' };

/** Side panel: the Forge's live meters, then the details (types, colour pips, the read, note and tags). */
export function DeckPanel({ deck, st, read, meters }: { deck: Deck; st: DeckStats; read: ReturnType<typeof analysis>; meters?: ReactNode }) {
  const pipTotal = Object.values(st.pips).reduce((a, b) => a + b, 0);
  const [fold, setFold] = useStored<'open' | 'closed'>('ch:analysis', 'closed', ['open', 'closed']);
  const low = read.filter((a) => a.tone !== 'ok').length;
  return (
    <aside className={`dpanel ${fold}`} aria-label="Deck analysis">
      {meters}
      <h2>
        <button className="dfold" aria-expanded={fold === 'open'} onClick={() => (haptic('open'), setFold(fold === 'open' ? 'closed' : 'open'))}>
          DETAILS
          <span className="dsum">{low ? `${low} to look at` : 'looks solid'}</span>
          <span className="pm" aria-hidden="true" />
        </button>
      </h2>
      <div className="dbody">
        {!meters && (
          <div className="dsec">
            <h3>
              mana curve <small>avg {st.avgMv.toFixed(2)}</small>
            </h3>
            <Curve curve={st.curve} />
          </div>
        )}
        <div className="dsec">
          <h3>the read</h3>
          <ul className="dread">
            {read.map((a) => (
              <li key={a.text} className={a.tone}>
                {a.text}
              </li>
            ))}
          </ul>
          <small className="fetched">
            Roles come from Scryfall Tagger ({deck.cards.filter((c) => roleSource(c.name) === 'Scryfall Tagger').length} of {deck.cards.length} cards), the rest from rules text.
            {st.unknown ? ` ${st.unknown} cards still loading.` : ''}
          </small>
        </div>
        <div className="dsec">
          <h3>types</h3>
          <ul className="dtypes">
            {GROUPS.filter((g) => st.groups.get(g)).map((g) => (
              <li key={g}>
                <span>{g}</span>
                <b>{st.groups.get(g)}</b>
              </li>
            ))}
          </ul>
        </div>
        {pipTotal > 0 && (
          <div className="dsec">
            <h3>colour pips</h3>
            <div className="pipbar" role="img" aria-label={Object.entries(st.pips).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(', ')}>
              {Object.entries(st.pips)
                .filter(([, n]) => n)
                .map(([k, n]) => (
                  <span key={k} style={{ flex: n, background: PIPC[k], color: k === 'W' ? '#1a1a1a' : '#fff' }}>
                    {k} {n}
                  </span>
                ))}
            </div>
          </div>
        )}
        <div className="dsec dnotes">
          <h3>note &amp; tags</h3>
          <DeckNotes deck={deck} />
        </div>
      </div>
    </aside>
  );
}

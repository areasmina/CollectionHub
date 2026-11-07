import { useLiveQuery } from 'dexie-react-hooks';
import { summarize } from '../lib/compare';
import { db } from '../lib/db';
import { haptic } from '../lib/haptics';
import { norm } from '../lib/names';
import { openDeck, openDeckList } from '../lib/nav';
import { DeckLight, type Shared } from './shared';
import { deckColour } from '../lib/deckcolor';


/** How many decks the sideways row shows before its SEE ALL card. */
const SHELF = 6;

/** Your saved decks, newest first, in one sideways row ending with SEE ALL (or + ADD A DECK when empty): one tap opens the deck in the Forge. */
export function MyDecks({ s }: { s: Shared }) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const arts = useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? ''))).toArray()).map((c) => [c.key, c.img])), [decks]) ?? new Map<string, string | undefined>();
  return (
    <section className="shelf" aria-label="My decks">
      <div className="shelfhead">
        <h2>
          <button type="button" className="shelftitle" onClick={() => (haptic('open'), openDeckList())} title="Open My Decks & add a deck">
            MY DECKS ({decks.length}) →
          </button>
        </h2>
        <button type="button" className="u-btn ghost adddeckbtn" onClick={() => (haptic('open'), openDeckList())}>
          + ADD A DECK
        </button>
      </div>
      {decks.length > 0 && (
      <ul className="shelfrow">
        {decks.slice(0, SHELF).map((d) => {
          const pct = summarize(d.cards.map((c) => c.name), s.mine, s.other).pct;
          const img = arts.get(norm(d.commander ?? ''));
          return (
            <li key={d.id} className={d.inactive ? 'off' : ''} style={{ '--dc': deckColour(d) } as React.CSSProperties}>
              <button onClick={() => (haptic('open'), openDeck(d.name))} aria-label={`${d.name}, ${pct}% owned: open in the Forge`}>
                <span className="art">{img && <img src={img.replace('/small/', '/art_crop/')} alt="" loading="lazy" />}</span>
                <b>{d.name}</b>
                <small>{pct}% owned</small>
              </button>
              <DeckLight deck={d} />
            </li>
          );
        })}
        <li className="seeall">
          <button onClick={() => (haptic('open'), openDeckList())} aria-label={`See all ${decks.length} decks`}>
            <b>SEE ALL</b>
            <small>{decks.length} {decks.length === 1 ? 'deck' : 'decks'} · add a list</small>
            <span className="arr" aria-hidden="true">
              →
            </span>
          </button>
        </li>
      </ul>
      )}
    </section>
  );
}

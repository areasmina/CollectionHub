import { useLiveQuery } from 'dexie-react-hooks';
import { summarize } from '../lib/compare';
import { db } from '../lib/db';
import { haptic } from '../lib/haptics';
import { norm } from '../lib/names';
import { openDeck, openDeckList } from '../lib/nav';
import { DeckLight, type Shared } from './shared';


/** Your saved decks, newest first: one tap opens the deck in the Forge. */
export function MyDecks({ s }: { s: Shared }) {
  const decks = useLiveQuery(() => db.decks.where('profile').equals(s.profile).reverse().sortBy('updated'), [s.profile]) ?? [];
  const arts = useLiveQuery(async () => new Map((await db.cards.where('key').anyOf(decks.map((d) => norm(d.commander ?? ''))).toArray()).map((c) => [c.key, c.img])), [decks]) ?? new Map<string, string | undefined>();
  if (!decks.length) return null;
  return (
    <section className="shelf" aria-label="My decks">
      <div className="shelfhead">
        <h2>MY DECKS ({decks.length})</h2>
        <button className="link" onClick={() => (haptic('tap'), openDeckList())}>
          ALL · ADD A LIST →
        </button>
      </div>
      <ul className="shelfrow">
        {decks.slice(0, 12).map((d) => {
          const pct = summarize(d.cards.map((c) => c.name), s.mine, s.other).pct;
          const img = arts.get(norm(d.commander ?? ''));
          return (
            <li key={d.id} className={d.inactive ? 'off' : ''}>
              <button onClick={() => (haptic('open'), openDeck(d.name))} aria-label={`${d.name}, ${pct}% owned: open in the Forge`}>
                <span className="art">{img && <img src={img.replace('/small/', '/art_crop/')} alt="" loading="lazy" />}</span>
                <b>{d.name}</b>
                <small>{pct}% owned · ⚒ forge</small>
              </button>
              <DeckLight deck={d} />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

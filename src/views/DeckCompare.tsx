import { useState } from 'react';
import type { Card, Deck } from '../lib/db';
import { compareDecks, type CompareDeck } from '../lib/deckcompare';
import type { DeckShare } from '../lib/deckshare';
import { bracketOf, deckStats } from '../lib/deckstats';
import { haptic } from '../lib/haptics';
import { norm } from '../lib/names';
import { cad } from '../lib/prices';
import { priced as atFinish, priceSum } from './shared';

/**
 * My Decks' COMPARE face (Nov 24, step 1 of the deck-analysis plan): two of your decks side by side, each difference
 * said in words. The picks live in this component only: leaving the tab forgets them, and nothing is saved or synced.
 * Every number comes from the same functions as the deck page and the deck tile (deckStats, bracketOf, deckShares and
 * the tile's price), so the three can't disagree.
 */
export function DeckCompare({ decks, priced, gc, shareById }: { decks: Deck[]; priced: Map<string, Card>; gc: Set<string> | null; shareById: Map<number | undefined, DeckShare> }) {
  const [aId, setA] = useState<number | undefined>(decks[0]?.id);
  const [bId, setB] = useState<number | undefined>(decks[1]?.id);
  const a = decks.find((d) => d.id === aId) ?? decks[0];
  const b = decks.find((d) => d.id === bId && d.id !== a?.id) ?? decks.find((d) => d.id !== a?.id);
  if (!a || !b) return null;

  const cardOf = (n: string) => priced.get(norm(n));
  const input = (d: Deck): CompareDeck => {
    const share = shareById.get(d.id);
    return {
      name: d.name,
      stats: deckStats(d.cards, cardOf, d.commander),
      bracket: bracketOf(d.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc).bracket,
      ownedPct: share?.pct ?? 0,
      missing: share?.missing ?? 0,
      // The tile's own sum (Decks list): foil lines at the foil price, the rest at the cheapest printing.
      price: priced.size ? priceSum(d.cards.map((x) => ({ card: x.foil ? atFinish(cardOf(x.name), true) : cardOf(x.name), qty: x.qty }))) : undefined,
    };
  };
  const both = [input(a), input(b)];
  const rows = compareDecks(both, cad);
  const pick = (which: 'a' | 'b', id: number) => {
    haptic('select');
    if (which === 'a') {
      if (id === b.id) setB(a.id); // picking the other side's deck swaps them
      setA(id);
    } else {
      if (id === a.id) setA(b.id);
      setB(id);
    }
  };
  const swap = () => (haptic('select'), setA(b.id), setB(a.id));
  const sign = (n: number, dec = 0) => `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(dec)}`;

  return (
    <section className="dcompare" id="dpane-compare" role="tabpanel" aria-labelledby="dtab-compare">
      <div className="dcmp-picks">
        <label className="dcmp-pick">
          <span className="dcmp-role">BASELINE</span>
          <select value={a.id} onChange={(e) => pick('a', Number(e.target.value))} aria-label="Baseline deck">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="dcmp-swap" onClick={swap} aria-label="Swap the two decks" title="Swap the two decks">
          ⇄
        </button>
        <label className="dcmp-pick">
          <span className="dcmp-role">COMPARED WITH</span>
          <select value={b.id} onChange={(e) => pick('b', Number(e.target.value))} aria-label="Deck to compare">
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="dcmp-note">
        Main deck only, commander included. Nothing here is saved.
        {both.map((d) => (d.stats.unknown ? ` ${d.name}: ${d.stats.unknown} ${d.stats.unknown === 1 ? 'card' : 'cards'} not loaded yet, so its counts may be low.` : ''))}
      </p>

      <div className="dcmp-table" role="table" aria-label={`${a.name} compared with ${b.name}`}>
        <div className="dcmp-row dcmp-head" role="row">
          <span role="columnheader" className="dcmp-label">
            &nbsp;
          </span>
          <span role="columnheader" className="dcmp-val" title={a.name}>
            {a.name}
          </span>
          <span role="columnheader" className="dcmp-val" title={b.name}>
            {b.name}
          </span>
          <span role="columnheader" className="dcmp-delta">
            Δ
          </span>
        </div>
        {rows.map((r) => {
          const d = r.deltas[1];
          const dec = r.key === 'avgMv' ? 2 : 0;
          return (
            <div key={r.key} className={`dcmp-row${r.key === 'bracket' ? ' est' : ''}`} role="row" data-row={r.key}>
              <span role="rowheader" className="dcmp-label">
                {r.label}
              </span>
              <span role="cell" className="dcmp-val">
                {r.shown[0]}
              </span>
              <span role="cell" className="dcmp-val">
                {r.shown[1]}
              </span>
              <span role="cell" className={`dcmp-delta${d ? '' : ' same'}`}>
                {d == null ? '–' : d === 0 ? '=' : r.key === 'price' ? `${d > 0 ? '+' : '−'}${cad(Math.abs(d))}` : sign(d, dec)}
              </span>
              <span role="cell" className="dcmp-says">
                {r.says[1]}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

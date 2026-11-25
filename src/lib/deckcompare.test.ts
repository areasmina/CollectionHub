import { describe, expect, it } from 'vitest';
import { bracketLabel, compareDecks, type CompareDeck } from './deckcompare';
import { deckStats } from './deckstats';

const cards: Record<string, { type: string; text: string; cmc: number; mana: string }> = {
  commander: { type: 'Legendary Creature — Elf', text: '', cmc: 4, mana: '{2}{G}{G}' },
  'sol ring': { type: 'Artifact', text: '{T}: Add {C}{C}.', cmc: 1, mana: '{1}' },
  cultivate: { type: 'Sorcery', text: 'Search your library for up to two basic land cards.', cmc: 3, mana: '{2}{G}' },
  'harmonize': { type: 'Sorcery', text: 'Draw three cards.', cmc: 4, mana: '{2}{G}{G}' },
  forest: { type: 'Basic Land — Forest', text: '', cmc: 0, mana: '' },
};
const cardOf = (n: string) => cards[n.toLowerCase()];
const stats = (list: [string, number][]) => deckStats(list.map(([name, qty]) => ({ name, qty })), cardOf, 'Commander');
const deck = (name: string, list: [string, number][], more: Partial<CompareDeck> = {}): CompareDeck => ({ name, stats: stats(list), bracket: 2, ownedPct: 80, missing: 5, ...more });

const A = deck('Alpha', [['Commander', 1], ['Sol Ring', 1], ['Cultivate', 1], ['Forest', 36]], { price: 40 });
const B = deck('Beta', [['Commander', 1], ['Sol Ring', 1], ['Harmonize', 1], ['Forest', 33]], { bracket: 3, ownedPct: 92, missing: 2, price: 55.5 });
const row = (rows: ReturnType<typeof compareDecks>, key: string) => rows.find((r) => r.key === key)!;

describe('compareDecks', () => {
  const rows = compareDecks([A, B], (n) => `CA$${n.toFixed(2)}`);

  it('takes the first deck as the baseline: its delta is 0 and it has no sentence', () => {
    for (const r of rows) {
      expect(r.says[0]).toBe('');
      if (r.deltas[0] != null) expect(r.deltas[0]).toBe(0);
    }
  });

  it('names the decks and what the number counts in every difference', () => {
    expect(row(rows, 'lands').values).toEqual([36, 33]);
    expect(row(rows, 'lands').deltas[1]).toBe(-3);
    expect(row(rows, 'lands').says[1]).toBe('Beta runs 3 fewer lands than Alpha.');
    expect(row(rows, 'cards').says[1]).toBe('Beta has 3 fewer cards than Alpha.');
  });

  it('uses the singular for one, and says "the same" for no difference', () => {
    expect(row(rows, 'ramp').says[1]).toBe('Beta runs 1 fewer ramp piece than Alpha.'); // Sol Ring + Cultivate vs Sol Ring
    expect(row(rows, 'draw').says[1]).toBe('Beta runs 1 more card-draw source than Alpha.');
    expect(row(rows, 'wipes').says[1]).toBe('Beta runs the same number of board wipes as Alpha.');
  });

  it('counts the same stats the deck page does (deckStats), commander included in the 100', () => {
    expect(row(rows, 'cards').values[0]).toBe(A.stats.total);
    expect(row(rows, 'ramp').values).toEqual([A.stats.roles.ramp, B.stats.roles.ramp]);
  });

  it('compares the average mana value of the non-land cards, rounded to two decimals', () => {
    // Alpha: 4, 1, 3 → 2.67; Beta: 4, 1, 4 → 3.00
    const mv = row(rows, 'avgMv');
    expect(mv.shown).toEqual(['2.67', '3.00']);
    expect(mv.deltas[1]).toBe(0.33);
    expect(mv.says[1]).toBe("Beta's spells cost 0.33 more on average than Alpha's (non-land cards).");
  });

  it('shows ownership as the My Decks tile does, and the cards to buy', () => {
    expect(row(rows, 'owned').shown).toEqual(['80%', '92%']);
    expect(row(rows, 'owned').says[1]).toBe('You own 12 points more of Beta than of Alpha.');
    expect(row(rows, 'missing').says[1]).toBe('Beta needs 3 fewer cards bought than Alpha.');
  });

  it('gives the price difference only when both prices are known', () => {
    expect(row(rows, 'price').says[1]).toBe('Beta costs about CA$15.50 more than Alpha (cheapest printings).');
    const noPrice = compareDecks([A, { ...B, price: undefined }]);
    expect(row(noPrice, 'price').deltas[1]).toBeUndefined();
    expect(row(noPrice, 'price').shown[1]).toBe('–');
    expect(row(noPrice, 'price').says[1]).toMatch(/not loaded/);
  });

  it('always labels the bracket as an estimate, and never invents one for an empty deck', () => {
    const br = row(rows, 'bracket');
    expect(br.label).toMatch(/estimate/i);
    expect(br.shown).toEqual(['II (est.)', 'III (est.)']);
    expect(br.says[1]).toBe('Beta is estimated 1 bracket higher than Alpha. An estimate from the cards only, not from how you play.');
    const empty = compareDecks([A, { ...B, bracket: 0 }]);
    expect(row(empty, 'bracket').shown[1]).toBe('none yet');
    expect(row(empty, 'bracket').deltas[1]).toBeUndefined();
    expect(bracketLabel(4)).toBe('IV (est.)');
  });

  it('leaves the average mana value unknown when no spell has card data yet', () => {
    const blank: CompareDeck = { ...A, stats: deckStats([{ name: 'Mystery', qty: 1 }], () => undefined) };
    const r = row(compareDecks([A, blank]), 'avgMv');
    expect(r.shown[1]).toBe('–');
    expect(r.deltas[1]).toBeUndefined();
  });

  it('compares a deck with itself as all "the same"', () => {
    const same = compareDecks([A, { ...A, name: 'Alpha copy' }]);
    expect(same.every((r) => r.deltas[1] === 0)).toBe(true);
  });

  it('returns nothing for no decks', () => {
    expect(compareDecks([])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { parseCombos } from './data';
import { bracketOf, combosIn } from '../lib/deckstats';

// Rows as scripts/build-combos.mjs writes them: [A, B, flags, mana value needed, id, Spellbook tag]
// flags: 1 infinite, 2 relevant (wins), 4 definitely two cards, 8/16 A/B must be the commander
const index = parseCombos({
  v: 1,
  rows: [
    ['Sanguine Bond', 'Exquisite Blood', 3, 0, '690-3966', 'S'], // needs a way to gain life: not definite -> late
    ['Demonic Consultation', "Thassa's Oracle", 7, 3, '742-1295', 'R'], // early: wins, definite, 3 mana
    ['Basalt Monolith', 'Forsaken Monument', 7, 6, '4131-4547', 'R'], // definite but 6 mana: late
  ],
})!;
const deck = (...names: string[]) => names.map((name) => ({ name }));

describe('two-card combos in the bracket estimate', () => {
  it('Exquisite Blood + Sanguine Bond is not bracket 2 (the playtest case)', () => {
    const r = bracketOf(deck('Exquisite Blood', 'Sanguine Bond', 'Sol Ring'), new Set(), index);
    expect(r.bracket).toBe(3);
    expect(r.combos).toEqual([{ cards: ['Sanguine Bond', 'Exquisite Blood'], early: false, mv: 0, id: '690-3966' }]);
    expect(r.reasons.join(' ')).toMatch(/Brackets I–II allow none/);
  });
  it('an early combo (Thoracle + Consultation) is bracket 4', () => {
    const r = bracketOf(deck("Thassa's Oracle", 'Demonic Consultation'), new Set(), index);
    expect(r.bracket).toBe(4);
    expect(r.combos[0].early).toBe(true);
  });
  it('a 6-mana combo stays bracket 3, and one card alone is nothing', () => {
    expect(bracketOf(deck('Basalt Monolith', 'Forsaken Monument'), new Set(), index).bracket).toBe(3);
    expect(bracketOf(deck('Basalt Monolith', 'Sanguine Bond'), new Set(), index).bracket).toBe(2);
  });
  it('lists early combos first, each once', () => {
    const found = combosIn(["Thassa's Oracle", 'Demonic Consultation', 'Exquisite Blood', 'Sanguine Bond'], index);
    expect(found.map((c) => c.id)).toEqual(['742-1295', '690-3966']);
  });
  it('says so when the combo list is not loaded', () => {
    const r = bracketOf(deck('Exquisite Blood', 'Sanguine Bond'), new Set(), null);
    expect(r.combosChecked).toBe(false);
    expect(r.reasons.join(' ')).toMatch(/couldn't be checked yet/);
  });
});

describe('tutors no longer set the bracket (Wizards, Oct 2025)', () => {
  it('five tutors alone stay bracket 2, listed as information', () => {
    const tutor = { type: 'Sorcery', text: 'Search your library for a card, put that card into your hand, then shuffle.' };
    const r = bracketOf(['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, card: tutor })), new Set(), index);
    expect(r.bracket).toBe(2);
    expect(r.tutors).toHaveLength(5);
    expect(r.reasons.join(' ')).toMatch(/information only/);
  });
});

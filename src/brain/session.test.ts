import { describe, expect, it } from 'vitest';
import { readDeck, upgradeLine } from './session';
import { setBrainData } from './data';
import type { DeckContext } from './score';

const C = (type: string, text: string, cmc = 2) => ({ type, text, cmc });
const cards: Record<string, { type: string; text: string; cmc: number }> = {
  'Discard Lord': C('Legendary Creature — Human Wizard', 'Whenever an opponent discards a card, that player loses 2 life.', 4),
  'Mind Rot': C('Sorcery', 'Target player discards two cards.', 3),
  'Raven': C('Creature — Bird', 'When Raven enters, target opponent discards a card.'),
  'Hymn': C('Sorcery', 'Target player discards two cards at random.'),
  'Vanilla Bear': C('Creature — Bear', ''),
  'Plain Ogre': C('Creature — Ogre', '', 3),
  'Soldier Maker': C('Sorcery', 'Create two 1/1 white Soldier creature tokens.'),
  'Lone Bolt': C('Instant', 'Destroy target creature.'),
  'Better Bolt': C('Instant', 'Destroy target creature. Target player discards a card.'),
  'Piece A': C('Artifact', '{T}: Add {C}.'),
  'Piece B': C('Artifact', 'Untap target artifact.'),
  Swamp: C('Basic Land — Swamp', '', 0),
};
const cardOf = (n: string) => cards[n];
const ctxOf = (rest: string[], bracket = 4): DeckContext => ({ deck: ['Discard Lord', ...rest].map((name) => ({ name, qty: 1 })), cardOf, commander: 'Discard Lord', bracket, aggression: 'hungry' });

describe('deck session: one read for suggestions, cuts and upgrades', () => {
  it('the weakest cards are the ones nothing ties to the commander or the deck; lands and the commander are never cuts', () => {
    const r = readDeck({ ctx: ctxOf(['Mind Rot', 'Raven', 'Vanilla Bear', 'Swamp']), candidates: [] });
    expect(r.cuts[0]).toMatchObject({ name: 'Vanilla Bear', why: 'nothing ties it to this commander or this deck' });
    expect(r.cuts.map((c) => c.name)).not.toContain('Swamp');
    expect(r.cuts.map((c) => c.name)).not.toContain('Discard Lord');
    expect(r.cuts.at(-1)!.total).toBeGreaterThan(r.cuts[0].total);
  });
  it('a pinned card and a combo piece are kept, with the reason', () => {
    setBrainData({ combos: new Map([['piece a', [{ cards: ['Piece A', 'Piece B'], infinite: true, relevant: true, definite: true, mv: 6, id: 'x', tag: '', mustBeCommander: [false, false] }]], ['piece b', [{ cards: ['Piece A', 'Piece B'], infinite: true, relevant: true, definite: true, mv: 6, id: 'x', tag: '', mustBeCommander: [false, false] }]]]) });
    const r = readDeck({ ctx: ctxOf(['Mind Rot', 'Vanilla Bear', 'Plain Ogre', 'Piece A', 'Piece B']), candidates: [], pinned: ['Plain Ogre'], cuts: 1 });
    expect(r.cuts.map((c) => c.name)).toEqual(['Vanilla Bear']);
    expect(r.kept).toContainEqual(expect.objectContaining({ name: 'Plain Ogre', reason: 'pinned by you' }));
    const all = readDeck({ ctx: ctxOf(['Mind Rot', 'Vanilla Bear', 'Plain Ogre', 'Piece A', 'Piece B']), candidates: [], cuts: 10 });
    expect(all.cuts.map((c) => c.name)).not.toContain('Piece A');
    setBrainData({ combos: null });
  });
  it('an upgrade swaps a weak card for a candidate that does the same job and scores clearly higher', () => {
    const r = readDeck({ ctx: ctxOf(['Mind Rot', 'Raven', 'Lone Bolt']), candidates: [{ name: 'Better Bolt' }, { name: 'Soldier Maker' }] });
    const u = r.upgrades.find((x) => x.out === 'Lone Bolt')!;
    expect(u).toMatchObject({ in: 'Better Bolt', job: 'removal' });
    expect(u.gain).toBeGreaterThan(0.1);
    expect(upgradeLine(u)).toBe('Better Bolt for Lone Bolt: same job (removal), and it feeds Discard Lord: discard.');
  });
  it('a card holding up a short role is only swapped for the same role, never just cut', () => {
    const r = readDeck({ ctx: ctxOf(['Mind Rot', 'Lone Bolt']), candidates: [{ name: 'Hymn' }] });
    const bolt = r.cuts.find((c) => c.name === 'Lone Bolt')!;
    expect(bolt.holds).toBe('removal');
    expect(bolt.why).toMatch(/swap it rather than cut it/);
    expect(r.upgrades.find((u) => u.out === 'Lone Bolt')).toBeUndefined(); // Hymn is no removal
  });
  it('suggestions and cuts come from the same score: nothing is both', () => {
    const r = readDeck({ ctx: ctxOf(['Mind Rot', 'Vanilla Bear']), candidates: [{ name: 'Hymn' }, { name: 'Plain Ogre' }, { name: 'Vanilla Bear' }] });
    expect(r.suggestions[0].name).toBe('Hymn');
    expect(r.suggestions.map((s) => s.name)).not.toContain('Vanilla Bear');
  });
});

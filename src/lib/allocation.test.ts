import { describe, expect, it } from 'vitest';
import { allocate, availability, availabilityNote, copyStatus, freeFirst, reservedShortText, type AllocDeck } from './allocation';
import { shortfalls } from './copies';

const deck = (name: string, cards: [string, number][], more: Partial<AllocDeck> = {}): AllocDeck => ({ name, cards: cards.map(([n, qty]) => ({ name: n, qty })), ...more });
const owned = new Map([['sol ring', 1], ['arcane signet', 2], ['cultivate', 1], ['forest', 1]]);

describe('allocation: shared decks (the default) behave exactly as before', () => {
  const decks = [deck('A', [['Sol Ring', 1], ['Forest', 30]]), deck('B', [['Sol Ring', 1], ['Arcane Signet', 1]])];
  const a = allocate(decks, owned);
  it('holds no copies and reports no reserved shortfalls', () => {
    expect(a.short).toEqual([]);
    expect(a.cards.get('sol ring')).toMatchObject({ own: 1, held: [], free: 1, sharedBy: ['A', 'B'] });
  });
  it('leaves copies.ts untouched: shortfalls are the same with or without allocate', () => {
    expect(shortfalls(decks, owned).map((s) => [s.name, s.short])).toEqual([['Sol Ring', 1]]);
  });
  it('a shared deck can use every copy you own', () => {
    expect(availability(a, 'Sol Ring', decks[0], owned)).toMatchObject({ own: 1, free: 1, usable: 1, heldBy: [] });
  });
  it('never counts basics', () => expect(a.cards.has('forest')).toBe(false));
});

describe('allocation: reserved decks hold real copies', () => {
  const atraxa = deck('Atraxa', [['Sol Ring', 1], ['Arcane Signet', 1]], { id: 1, alloc: 'reserved' });
  const kinnan = deck('Kinnan', [['Sol Ring', 1], ['Arcane Signet', 1], ['Cultivate', 1]], { id: 2, alloc: 'reserved' });
  const tatyova = deck('Tatyova', [['Sol Ring', 1]], { id: 3 });
  it('serves the oldest reserved deck first, whatever the list order', () => {
    const a = allocate([kinnan, tatyova, atraxa], owned);
    expect(a.cards.get('sol ring')!.held).toEqual([{ deck: 'Atraxa', qty: 1 }]);
    expect(a.cards.get('arcane signet')).toMatchObject({ held: [{ deck: 'Atraxa', qty: 1 }, { deck: 'Kinnan', qty: 1 }], free: 0 });
    expect(a.short).toEqual([{ name: 'Sol Ring', deck: 'Kinnan', need: 1, got: 0, heldBy: ['Atraxa'] }]);
    expect(reservedShortText(a.short[0])).toBe('Kinnan is short 1 Sol Ring: Atraxa holds yours');
  });
  it('a copy held by one reserved deck is not available to another', () => {
    const a = allocate([atraxa, kinnan, tatyova], owned);
    expect(availability(a, 'Sol Ring', kinnan, owned)).toMatchObject({ usable: 0, free: 0, heldBy: ['Atraxa'] });
    expect(availability(a, 'Sol Ring', atraxa, owned)).toMatchObject({ usable: 1, heldBy: [] });
    expect(availabilityNote(availability(a, 'Sol Ring', kinnan, owned))).toBe('in Atraxa');
    expect(availabilityNote(availability(a, 'Cultivate', atraxa, owned))).toBe('in Kinnan');
    expect(availabilityNote(availability(a, 'Mana Crypt', atraxa, owned))).toBe('');
  });
  it('shared decks still see every copy, but suggestions can tell it is held', () => {
    const a = allocate([atraxa, kinnan, tatyova], owned);
    expect(availability(a, 'Sol Ring', tatyova, owned)).toMatchObject({ usable: 1, free: 0, heldBy: ['Atraxa'] });
  });
  it('inactive decks hold nothing', () => {
    const a = allocate([{ ...atraxa, inactive: true }, kinnan], owned);
    expect(a.cards.get('sol ring')!.held).toEqual([{ deck: 'Kinnan', qty: 1 }]);
    expect(a.short).toEqual([]);
  });
  it('adds up a card listed on two lines (foil + non-foil)', () => {
    const a = allocate([deck('X', [['Arcane Signet', 1], ['Arcane Signet', 2]], { alloc: 'reserved' })], owned);
    expect(a.short).toEqual([{ name: 'Arcane Signet', deck: 'X', need: 3, got: 2, heldBy: [] }]);
  });
  it('cards you do not own are not reported as reserved shortfalls (they are simply missing)', () => {
    const a = allocate([deck('X', [['Mana Crypt', 1]], { alloc: 'reserved' })], owned);
    expect(a.short).toEqual([]);
  });
});

describe('copy status and free-first ranking', () => {
  const own = new Map([['sol ring', 1], ['arcane signet', 2], ['mind stone', 1]]);
  const atraxa = deck('Atraxa', [['Sol Ring', 1], ['Arcane Signet', 1]], { id: 1, alloc: 'reserved' });
  const kinnan = deck('Kinnan', [['Arcane Signet', 1]], { id: 2, alloc: 'reserved' });
  const shared = deck('Tatyova', [['Sol Ring', 1]], { id: 3 });
  const a = allocate([atraxa, kinnan, shared], own);
  it('names the five states', () => {
    expect(copyStatus(a, 'Forest', kinnan, own).status).toBe('basic');
    expect(copyStatus(a, 'Mana Crypt', kinnan, own).status).toBe('missing');
    expect(copyStatus(a, 'Sol Ring', kinnan, own)).toMatchObject({ status: 'held', note: 'in Atraxa' });
    expect(copyStatus(a, 'Mind Stone', kinnan, own)).toMatchObject({ status: 'ok', note: 'free' });
    expect(copyStatus(a, 'Mind Stone', kinnan, own, 2).status).toBe('partial');
  });
  it('a shared deck can still use a reserved copy (status ok, note says who holds it)', () => {
    expect(copyStatus(a, 'Sol Ring', shared, own)).toMatchObject({ status: 'ok', note: 'in Atraxa' });
  });
  const cands = [{ name: 'Sol Ring' }, { name: 'Mana Crypt' }, { name: 'Mind Stone' }];
  it('a reserved deck sees cards held elsewhere last, order otherwise kept', () => {
    expect(freeFirst(cands, a, kinnan, own).map((c) => c.name)).toEqual(['Mana Crypt', 'Mind Stone', 'Sol Ring']);
  });
  it('a shared deck keeps the order exactly', () => {
    expect(freeFirst(cands, a, shared, own)).toBe(cands);
    expect(freeFirst(cands, a, undefined, own)).toBe(cands);
  });
});

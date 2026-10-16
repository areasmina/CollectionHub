import { describe, expect, it } from 'vitest';
import type { Entry } from './db';
import { finishFor, planEntryPrinting, planFlip } from './printings';
import { tagsOf } from './scryfall';

const e = (o: Partial<Entry>): Entry => ({ id: 1, profile: 1, cardId: 'old', name: 'Sol Ring', qty: 2, ...o });
const p = (o: Partial<{ id: string; set: string; cn: string; finishes: string[] }> = {}) => ({ id: 'new', set: 'ltr', cn: '281', finishes: ['nonfoil', 'foil'], ...o });

describe('finishFor', () => {
  it('keeps the finish when the printing has it', () => {
    expect(finishFor(true, ['nonfoil', 'foil'])).toBe(true);
    expect(finishFor(false, ['nonfoil', 'foil'])).toBe(false);
  });
  it('switches when the printing only has the other finish', () => {
    expect(finishFor(true, ['nonfoil'])).toBe(false);
    expect(finishFor(false, ['foil'])).toBe(true);
    expect(finishFor(true, ['etched'])).toBe(true);
  });
  it('leaves it alone when the finishes are unknown', () => {
    expect(finishFor(true, [])).toBe(true);
    expect(finishFor(undefined, [])).toBe(false);
  });
});

describe('planEntryPrinting', () => {
  it('changes the entry in place', () => {
    expect(planEntryPrinting([e({})], e({}), p())).toEqual({ update: { cardId: 'new', set: 'ltr', cn: '281', foil: false } });
  });
  it('fills in a copy that had no set', () => {
    const plan = planEntryPrinting([e({ set: undefined, cn: undefined })], e({ set: undefined, cn: undefined, foil: true }), p());
    expect(plan).toEqual({ update: { cardId: 'new', set: 'ltr', cn: '281', foil: true } });
  });
  it('joins the entry you already have of that printing and finish', () => {
    const mine = e({ id: 2, cardId: 'new', set: 'ltr', cn: '281', qty: 3 });
    expect(planEntryPrinting([e({}), mine], e({}), p())).toEqual({ merge: { id: 2, qty: 5 }, remove: 1 });
  });
  it('does not join a different finish, another binder, or itself', () => {
    const foil = e({ id: 2, cardId: 'new', foil: true });
    const other = e({ id: 3, cardId: 'new', profile: 2 });
    expect(planEntryPrinting([e({}), foil, other], e({}), p()).merge).toBeUndefined();
    expect(planEntryPrinting([e({ cardId: 'new' })], e({ cardId: 'new' }), p()).merge).toBeUndefined();
  });
  it('caps the quantity at 999', () => {
    const mine = e({ id: 2, cardId: 'new', qty: 998 });
    expect(planEntryPrinting([e({}), mine], e({}), p()).merge?.qty).toBe(999);
  });
});

describe('tagsOf', () => {
  it('labels what makes a printing look different', () => {
    expect(tagsOf({ border_color: 'borderless', frame_effects: ['showcase'], promo: true, promo_types: ['prerelease'] })).toEqual(['Promo', 'Prerelease', 'Borderless', 'Showcase']);
    expect(tagsOf({ border_color: 'black', frame: '1997', full_art: true })).toEqual(['Full art', 'Retro frame']);
    expect(tagsOf({ border_color: 'white', frame_effects: ['extendedart'] })).toEqual(['White border', 'Extended art']);
    expect(tagsOf({ border_color: 'black' })).toEqual([]);
  });
});

describe('planFlip (one copy to the other finish)', () => {
  it('a single copy flips in place', () => {
    expect(planFlip([e({ qty: 1 })], e({ qty: 1 }))).toEqual({ update: { id: 1, foil: true } });
    expect(planFlip([e({ qty: 1, foil: true })], e({ qty: 1, foil: true }))).toEqual({ update: { id: 1, foil: false } });
  });
  it('one of several copies splits off into a new entry', () => {
    const plan = planFlip([e({ qty: 3, set: 'ltr', cn: '281' })], e({ qty: 3, set: 'ltr', cn: '281' }));
    expect(plan.setQty).toEqual({ id: 1, qty: 2 });
    expect(plan.create).toEqual({ profile: 1, cardId: 'old', name: 'Sol Ring', qty: 1, set: 'ltr', cn: '281', foil: true });
  });
  it('joins the entry you already have of that finish', () => {
    const foil = e({ id: 2, foil: true, qty: 1 });
    expect(planFlip([e({ qty: 3 }), foil], e({ qty: 3 }))).toEqual({ setQty: { id: 1, qty: 2 }, addTo: { id: 2, qty: 2 } });
    expect(planFlip([e({ qty: 1 }), foil], e({ qty: 1 }))).toEqual({ addTo: { id: 2, qty: 2 }, remove: 1 });
  });
});

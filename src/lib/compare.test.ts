import { describe, expect, it } from 'vitest';
import { ownedMap, statusOf, summarize } from './compare';

const mine = ownedMap([
  { name: 'Sol Ring', qty: 1 },
  { name: 'sol ring', qty: 2 },
  { name: 'Delver of Secrets // Insectile Aberration', qty: 1 },
  { name: 'Lim-Dûl the Necromancer', qty: 1 },
]);
const other = ownedMap([{ name: 'Rhystic Study', qty: 1 }, { name: 'Sol Ring', qty: 1 }]);

describe('owned / missing', () => {
  it('adds copies across printings', () => expect(mine.get('sol ring')).toBe(3));
  it('matches front faces and ignores accents and case', () => {
    expect(statusOf('Delver of Secrets', mine)).toBe('owned');
    expect(statusOf('lim-dul the necromancer', mine)).toBe('owned');
  });
  it('labels cards only in the other binder, never as owned', () => {
    expect(statusOf('Rhystic Study', mine, other)).toBe('other');
    expect(statusOf('Rhystic Study', mine)).toBe('missing');
    expect(statusOf('Sol Ring', mine, other)).toBe('owned');
  });
  it('summarizes a list', () => {
    expect(summarize(['Sol Ring', 'Rhystic Study', 'Cyclonic Rift', 'Delver of Secrets'], mine, other)).toEqual({ owned: 2, other: 1, missing: 1, total: 4, pct: 50 });
  });
});

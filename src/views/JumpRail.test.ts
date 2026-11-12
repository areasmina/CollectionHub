import { describe, expect, it } from 'vitest';
import { jumpId, jumpLabel } from './JumpRail';

describe('jump rail labels', () => {
  it('gives card types fixed three-letter tags', () => {
    expect(['Commander', 'Creatures', 'Planeswalkers', 'Lands', 'Missing'].map(jumpLabel)).toEqual(['CMD', 'CRE', 'PW', 'LND', 'BUY']);
  });
  it('shows a mana value group as its number', () => {
    expect(jumpLabel('Mana value 3')).toBe('3');
    expect(jumpLabel('Mana value 7+')).toBe('7+');
  });
  it('uses initials for EDHREC headers and drops the word "cards"', () => {
    expect(jumpLabel('High Synergy Cards')).toBe('HS');
    expect(jumpLabel('Top Cards')).toBe('TOP');
    expect(jumpLabel('Game Changers')).toBe('GC');
  });
  it('makes a safe element id', () => {
    expect(jumpId('In Binder 2')).toBe('jump-in-binder-2');
  });
});

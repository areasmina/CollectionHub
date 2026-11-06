import { describe, expect, it } from 'vitest';
import { themeOf } from './themes';

const c = (type: string, text: string) => ({ type, text });
describe('themeOf', () => {
  it('a mechanic theme reads rules text, not creature types', () => {
    const d = themeOf('Discard').test;
    expect(d(c('Creature — Human Villain', 'Flying'))).toBe(false);
    expect(d(c('Creature — Human Rogue', 'When this enters, draw two cards, then discard a card.'))).toBe(true);
    expect(d(c('Creature — Human', 'Whenever you discard a card, each opponent loses 1 life.'))).toBe(true);
    expect(themeOf('Connive').test(c('Creature', 'Whenever this attacks, it connives. (Draw a card, then discard a card.)'))).toBe(true);
  });
  it('a tribe theme reads the type line (and lords that name the type)', () => {
    const v = themeOf('Villains').test;
    expect(v(c('Legendary Creature — Human Villain', ''))).toBe(true);
    expect(v(c('Creature — Human Hero', 'Other Villains you control get +1/+1.'))).toBe(true);
    expect(v(c('Creature — Human Hero', 'Flying'))).toBe(false);
    expect(themeOf('Elves').test(c('Creature — Elf Druid', ''))).toBe(true);
  });
  it('an unknown theme falls back to its words in the text', () => {
    expect(themeOf('Investigate').test(c('Sorcery', 'Investigate twice.'))).toBe(true);
    expect(themeOf('Investigate').test(c('Sorcery', 'Draw a card.'))).toBe(false);
  });
});

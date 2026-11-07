import { describe, expect, it } from 'vitest';
import { commanderThemes, themeOf, themeRoleOf, detectCardSynergies } from './themes';

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
  it('auto-detects strategy stack from a commander’s own text and type line', () => {
    const doom = c('Legendary Creature — Human Artificer Villain', 'Whenever another Villain you control enters, it connives. Whenever you discard a card, each opponent loses 1 life.');
    expect(commanderThemes(doom).map((t) => t.label)).toEqual(['Villains', 'Connive', 'Discard']);
    const yuriko = c('Legendary Creature — Human Ninja', 'Commander ninjutsu {U}{B}\nWhenever a Ninja you control deals combat damage to a player, reveal the top card of your library.');
    expect(commanderThemes(yuriko).map((t) => t.label)).toEqual(['Ninjas', 'Ninjutsu']);
  });
  it('classifies enablers vs payoffs for two-part strategies', () => {
    expect(themeRoleOf('Aristocrats', c('Creature — Vampire', 'Sacrifice another creature: Scry 1.'))).toBe('enabler');
    expect(themeRoleOf('Aristocrats', c('Creature — Vampire', 'Whenever another creature dies, each opponent loses 1 life.'))).toBe('payoff');
    expect(themeRoleOf('Discard', c('Instant', 'Draw two cards, then discard two cards.'))).toBe('enabler');
    expect(themeRoleOf('Discard', c('Enchantment', 'Whenever an opponent discards a card, you draw a card.'))).toBe('payoff');
  });
  it('detects card synergies for pinned cards like Elesh Norn', () => {
    const elesh = c('Legendary Creature — Phyrexian Praetor', 'If a permanent entering the battlefield causes a triggered ability of a permanent you control to trigger, that ability triggers an additional time.');
    const match = detectCardSynergies('Elesh Norn, Mother of Machines', elesh, [{ slug: 'blink', value: 'Blink' }, { slug: 'tokens', value: 'Tokens' }]);
    expect(match).not.toBeNull();
    expect(match?.themeLabel).toBe('Blink');
    expect(match?.explanation).toContain('Enter-the-Battlefield triggers');
  });
});

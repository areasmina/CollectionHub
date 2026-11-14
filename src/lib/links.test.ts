import { describe, expect, it } from 'vitest';
import { archidektUrl, spellbookUrl } from './links';

describe('outside links (roadmap P3.1)', () => {
  it("Commander Spellbook: the syntax guide's exact-card search", () => {
    // the guide's own example: card%3D%22sydri%2C%20galvanic%20genius%22
    expect(spellbookUrl('sydri, galvanic genius')).toBe('https://commanderspellbook.com/search/?q=card%3D%22sydri%2C%20galvanic%20genius%22');
  });
  it("Archidekt: Commander decks led by this commander, in Archidekt's own URL form", () => {
    expect(archidektUrl('Tom Bombadil')).toBe('https://archidekt.com/search/decks?commanders=%22Tom%20Bombadil%22&formats=3');
  });
  it('a two-faced commander is searched by its front face', () => {
    expect(archidektUrl('Esika, God of the Tree // The Prismatic Bridge')).toContain(encodeURIComponent('"Esika, God of the Tree"'));
    expect(spellbookUrl('Esika, God of the Tree // The Prismatic Bridge')).not.toContain('Prismatic');
  });
});

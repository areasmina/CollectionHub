/**
 * Outside sites for a commander (roadmap P3.1: links only, no API). Both URL forms are the sites' own:
 * Commander Spellbook's syntax guide gives `card="name"` (exact name) on /search/?q=, and Archidekt's own deck search
 * uses `commanders="name"&formats=3` (3 = Commander). Moxfield has no public search link, so decks go there through
 * the existing EXPORT FOR MOXFIELD instead.
 */
const front = (name: string) => name.split(' // ')[0].trim();

/** Every known combo that uses this card (Commander Spellbook). */
export const spellbookUrl = (name: string) => `https://commanderspellbook.com/search/?q=${encodeURIComponent(`card="${front(name)}"`)}`;

/** Other players' Commander decks led by this commander (Archidekt). */
export const archidektUrl = (name: string) => `https://archidekt.com/search/decks?commanders=${encodeURIComponent(`"${front(name)}"`)}&formats=3`;

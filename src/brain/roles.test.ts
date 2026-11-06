import { afterEach, describe, expect, it } from 'vitest';
import { parseRoles, setBrainData } from './data';
import { roleOf } from '../lib/deckstats';
import vet from './fixtures/veteran-cards.json';

// Real Oracle text (Scryfall, Nov 6 2026) of the cards the veteran playtest found misread.
const card = (n: keyof typeof vet) => ({ name: n, ...vet[n] });

describe('roles from Oracle text (fallback when a card is not in the Tagger file)', () => {
  afterEach(() => setBrainData({ roles: null }));
  it('reads the cEDH staples the playtest flagged', () => {
    setBrainData({ roles: null });
    expect(roleOf(card('Sylvan Library'))).toContain('draw');
    expect(roleOf(card('Cyclonic Rift'))).toEqual(expect.arrayContaining(['removal', 'wipes']));
    expect(roleOf(card('Toxic Deluge'))).toContain('wipes');
    expect(roleOf(card('Fierce Guardianship'))).toContain('removal');
    expect(roleOf(card('Force of Negation'))).toContain('removal');
    expect(roleOf(card('Natural Order'))).toContain('tutors');
    expect(roleOf(card('Finale of Devastation'))).toContain('tutors');
    expect(roleOf(card('Dockside Extortionist'))).toContain('ramp');
    expect(roleOf(card('Smothering Tithe'))).toContain('ramp');
    expect(roleOf(card('Rhystic Study'))).toContain('draw');
  });
  it("never counts an opponent's draw as yours", () => {
    expect(roleOf(card('Smothering Tithe'))).not.toContain('draw');
    expect(roleOf(card('Orcish Bowmasters'))).not.toContain('draw');
  });
});

describe('roles from the Scryfall Tagger file', () => {
  afterEach(() => setBrainData({ roles: null }));
  // bits: ramp 1, draw 2, removal 4, wipes 8, tutors 16, counters 32 (ROLE_BITS order)
  const roles = parseRoles({ v: 1, cards: { necropotence: 2, 'fierce guardianship': 32, 'cyclonic rift': 12, 'smothering tithe': 1 } })!;
  it('uses the tags when the card is known; counterspells count as removal', () => {
    setBrainData({ roles });
    expect(roleOf(card('Necropotence'))).toEqual(['draw']);
    expect(roleOf(card('Fierce Guardianship'))).toEqual(['removal']);
    expect(roleOf(card('Cyclonic Rift'))).toEqual(['removal', 'wipes']);
    expect(roleOf(card('Smothering Tithe'))).toEqual(['ramp']);
  });
  it('falls back to the text for cards the file does not know, and lands have no roles', () => {
    setBrainData({ roles });
    expect(roleOf(card('Toxic Deluge'))).toContain('wipes');
    expect(roleOf({ name: 'Forest', type: 'Basic Land — Forest', text: '({T}: Add {G}.)' })).toEqual([]);
  });
});

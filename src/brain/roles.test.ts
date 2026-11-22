import { afterEach, describe, expect, it } from 'vitest';
import { CORE_ROLES, JOB_WORD, parseRoles, ROLE_BITS, setBrainData, type Job } from './data';
import { extraJobs, jobWord, roleOf } from '../lib/deckstats';
import { rankSubs, reasonsFor } from '../lib/subs';
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

describe('the other jobs (card roles upgrade, Nov 21)', () => {
  afterEach(() => setBrainData({ roles: null }));
  const bit = (r: (typeof ROLE_BITS)[number]) => 1 << ROLE_BITS.indexOf(r);

  it('keeps the first six roles where they were, so an older roles file still reads right', () => {
    expect(ROLE_BITS.slice(0, CORE_ROLES)).toEqual(['ramp', 'draw', 'removal', 'wipes', 'tutors', 'counters']);
    expect(ROLE_BITS.length).toBeLessThanOrEqual(31); // bits stay plain numbers
    for (const r of ROLE_BITS.slice(CORE_ROLES)) expect(JOB_WORD[r as Job]).toBeTruthy();
  });

  it('reads them from the Tagger file, and they never count as a deck-count role', () => {
    setBrainData({ roles: parseRoles({ v: 1, cards: { 'viscera seer': bit('sacOutlet'), 'eternal witness': bit('recursion') | bit('reanimate'), 'smothering tithe': bit('ramp') } })! });
    const seer = { name: 'Viscera Seer', type: 'Creature — Vampire Wizard', text: 'Sacrifice a creature: Scry 1.' };
    expect(extraJobs(seer)).toEqual(['sacOutlet']);
    expect(roleOf(seer)).toEqual([]);
    expect(extraJobs({ name: 'Eternal Witness', type: 'Creature — Human Shaman', text: '' }).map(jobWord)).toEqual(['recursion', 'reanimation']);
    expect(extraJobs(card('Smothering Tithe'))).toEqual([]);
  });

  it('a file from before the upgrade (six roles) gives no other jobs from the file', () => {
    setBrainData({ roles: parseRoles({ v: 1, cards: { 'viscera seer': 0 } })! });
    expect(extraJobs({ name: 'Viscera Seer', type: 'Creature', text: 'Sacrifice a creature: Scry 1.' })).toEqual([]);
  });

  it("falls back to Deck Wizard's two text rules for cards the file does not know", () => {
    setBrainData({ roles: null });
    expect(extraJobs({ name: 'Viscera Seer', type: 'Creature', text: 'Sacrifice a creature: Scry 1.' })).toEqual(['sacOutlet']);
    expect(extraJobs({ name: 'Eternal Witness', type: 'Creature', text: 'When this creature enters, return target card from your graveyard to your hand.' })).toEqual(['recursion']);
    // a sacrifice that is not a cost is not an outlet
    expect(extraJobs({ name: 'Fleshbag Marauder', type: 'Creature', text: 'When this creature enters, each player sacrifices a creature.' })).toEqual([]);
    expect(extraJobs({ name: 'Bojuka Bog', type: 'Land', text: 'return target card from your graveyard' })).toEqual([]);
  });

  it('a stand-in sharing a deck-count role still beats one that only shares another job', () => {
    setBrainData({ roles: parseRoles({ v: 1, cards: { 'swords to plowshares': bit('removal'), 'path to exile': bit('removal'), 'kaya\'s guile': bit('lifegain') | bit('gyHate'), 'rest in peace': bit('gyHate') } })! });
    const top = rankSubs({ name: 'Swords to Plowshares', type: 'Instant', cmc: 1 }, [
      { name: "Kaya's Guile", type: 'Instant', cmc: 2 },
      { name: 'Path to Exile', type: 'Instant', cmc: 1 },
    ]).map((c) => c.name);
    expect(top[0]).toBe('Path to Exile');
    // a missing card with only other jobs: the one sharing them goes first, the reason names it in words
    const gy = rankSubs({ name: 'Rest in Peace', type: 'Enchantment', cmc: 2 }, [{ name: 'Path to Exile', type: 'Instant', cmc: 1 }, { name: "Kaya's Guile", type: 'Instant', cmc: 2 }]).map((c) => c.name);
    expect(gy[0]).toBe("Kaya's Guile");
    expect(reasonsFor({ name: 'Rest in Peace', type: 'Enchantment', cmc: 2 }, { name: "Kaya's Guile", type: 'Instant', cmc: 2 })[0]).toBe('Same job: graveyard hate (Scryfall Tagger)');
  });
});

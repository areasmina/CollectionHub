import { describe, expect, it } from 'vitest';
import { canLead, canPair, commanderSlug, guessCommander, guessCommanders, pairIdentity, pairRules } from './commander';
import { parseImport } from './importers';

const card = (type: string, ci: string[], text = '') => ({ type, ci, text });
const ystola = { name: 'Ystola, Who Plays Her Part', card: card('Legendary Creature — Human Elf', ['B', 'G', 'U']) };
const sidekick = { name: 'Tatyova, Benthic Druid', card: card('Legendary Creature — Merfolk Druid', ['G', 'U']) };
const sol = { name: 'Sol Ring', card: card('Artifact', []) };
const swamp = { name: 'Doom Blade', card: card('Instant', ['B']) };

describe('canLead', () => {
  it('legendary creatures and "can be your commander" cards', () => {
    expect(canLead(card('Legendary Creature — Elf', ['G']))).toBe(true);
    expect(canLead(card('Legendary Planeswalker — Teferi', ['W', 'U'], 'Teferi can be your commander.'))).toBe(true);
    expect(canLead(card('Legendary Artifact', []))).toBe(false);
    expect(canLead(card('Creature — Elf', ['G']))).toBe(false);
  });
});

describe('guessCommander', () => {
  it('takes the only legend that covers every colour in the deck', () => {
    expect(guessCommander([sol, sidekick, swamp, ystola])).toBe('Ystola, Who Plays Her Part');
  });
  it('prefers a lone legend at the edge of the list', () => {
    expect(guessCommander([{ ...sidekick, edge: true }, ystola, sol])).toBe('Tatyova, Benthic Druid');
  });
  it('gives up when it is ambiguous', () => {
    expect(guessCommander([sol, sidekick, { ...sidekick, name: 'Other Simic Legend' }])).toBeUndefined();
  });
});

describe('text import commander hints', () => {
  it('marks a lone card set apart at the end (Moxfield / MTGO export)', () => {
    const p = parseImport('1 Sol Ring\n1 Doom Blade\n1 Cultivate\n\n1 Ystola, Who Plays Her Part');
    expect(p.rows.find((r) => r.name.startsWith('Ystola'))?.edge).toBe(true);
    expect(p.rows.find((r) => r.name === 'Sol Ring')?.edge).toBeFalsy();
  });
  it('reads *CMDR*', () => {
    expect(parseImport('1 Ystola, Who Plays Her Part *CMDR*\n1 Sol Ring').rows[0]).toMatchObject({ name: 'Ystola, Who Plays Her Part', section: 'Commander' });
  });
});

describe('partners and backgrounds (veteran playtest A2)', () => {
  const thrasios = { name: 'Thrasios, Triton Hero', card: card('Legendary Creature — Merfolk Wizard', ['G', 'U'], '{4}: Scry 1, then reveal the top card of your library. If it\'s a land card, put it onto the battlefield tapped. Otherwise, draw a card.\nPartner (You can have two commanders if both have partner.)') };
  const tymna = { name: 'Tymna the Weaver', card: card('Legendary Creature — Human Cleric', ['W', 'B'], 'Lifelink\nAt the beginning of your postcombat main phase, you may pay X life, where X is the number of opponents that were dealt combat damage this turn. If you do, draw X cards.\nPartner (You can have two commanders if both have partner.)') };
  const pir = { name: "Pir, Imaginative Rascal", card: card('Legendary Creature — Human', ['G'], 'Partner with Toothy, Imaginary Friend (When this creature enters, target player may put Toothy into their hand from their library, then shuffle.)\nIf one or more counters would be put on a permanent your team controls, that many plus one of each of those kinds of counters are put on that permanent instead.') };
  const toothy = { name: 'Toothy, Imaginary Friend', card: card('Legendary Creature — Illusion', ['U'], 'Partner with Pir, Imaginative Rascal (When this creature enters, target player may put Pir into their hand from their library, then shuffle.)\nWhenever you draw a card, put a +1/+1 counter on Toothy.') };
  const wilson = { name: 'Wilson, Refined Grizzly', card: card('Legendary Creature — Bear Warrior', ['G'], 'Choose a Background (You can have a Background as a second commander.)\nReach, trample, ward {2}') };
  const bg = { name: 'Raised by Giants', card: card('Legendary Enchantment — Background', ['G'], 'Commander creatures you own have base power and toughness 10/10 and are Giants in addition to their other types.') };
  const doctor = { name: 'The Tenth Doctor', card: card('Legendary Creature — Time Lord Doctor', ['U', 'R', 'G'], 'Allons-y! — Whenever you cast a spell, ...') };
  const rose = { name: 'Rose Tyler', card: card('Legendary Creature — Human', ['W'], "Doctor's companion (You can have two commanders if the other is the Doctor.)") };
  it('pairs Partner with Partner, and Partner with only its named card', () => {
    expect(canPair(thrasios, tymna)).toBe(true);
    expect(canPair(pir, toothy)).toBe(true);
    expect(canPair(pir, thrasios)).toBe(false);
    expect(canPair(thrasios, ystola)).toBe(false);
    expect(canPair(thrasios, thrasios)).toBe(false);
  });
  it('pairs Choose a Background with a Background, and the Doctor with a companion', () => {
    expect(canPair(wilson, bg)).toBe(true);
    expect(canPair(bg, wilson)).toBe(true);
    expect(canPair(thrasios, bg)).toBe(false);
    expect(canPair(rose, doctor)).toBe(true);
    expect(pairRules(rose.card)).toEqual([{ kind: 'companion' }]);
  });
  it('uses the union of colours and the EDHREC pair slug in alphabetical order', () => {
    expect(pairIdentity(thrasios.card.ci, tymna.card.ci)).toEqual(['W', 'U', 'B', 'G']);
    expect(commanderSlug('Tymna the Weaver', 'Thrasios, Triton Hero')).toBe('thrasios-triton-hero-tymna-the-weaver');
    expect(commanderSlug('Thrasios, Triton Hero')).toBe('thrasios-triton-hero');
  });
  it('guesses a pair at the edge of a list, or the one pair whose colours cover the deck', () => {
    expect(guessCommanders([{ ...thrasios, edge: true }, { ...tymna, edge: true }, sol, swamp])).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
    const forest = { name: 'Fyndhorn Elves', card: card('Creature — Elf', ['G']) };
    const plains = { name: 'Swords to Plowshares', card: card('Instant', ['W']) };
    const island = { name: 'Counterspell', card: card('Instant', ['U']) };
    expect(guessCommanders([thrasios, tymna, swamp, forest, plains, island])).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
  });
  it('reads "Commander: A + B" from a pasted list', () => {
    const p = parseImport('Commander: Thrasios, Triton Hero + Tymna the Weaver\n\n1 Sol Ring');
    expect(p.rows.filter((r) => r.section === 'Commander').map((r) => r.name)).toEqual(['Thrasios, Triton Hero', 'Tymna the Weaver']);
  });
});

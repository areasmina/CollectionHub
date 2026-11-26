import { describe, expect, it } from 'vitest';
import type { Card, DeckCard } from '../lib/db';
import type { BracketCall } from '../lib/deckstats';
import type { SubCard } from '../lib/subs';
import { applyProposal, balanceDeck, bracketPath, proposalImpact } from './balance';
import type { DeckContext } from './score';

function card(name: string, type: string, text: string, cmc = 2, ci: string[] = ['G', 'W']): Card {
  return { id: name, name, key: name.toLowerCase(), type, text, ci, cmc, legal: true };
}

function makePool() {
  const catalog = new Map<string, Card>([
    ['sythis, harvest\'s hand', card('Sythis, Harvest\'s Hand', 'Legendary Creature — Nymph', 'Whenever you cast an enchantment spell, you gain 1 life and draw a card.', 2)],
    ['keleh, sunmane familiar', card('Keleth, Sunmane Familiar', 'Legendary Creature — Horse', 'Partner', 2, ['W'])],
    ['sol ring', card('Sol Ring', 'Artifact', '{T}: Add {C}{C}.', 1, [])],
    ['arcane signet', card('Arcane Signet', 'Artifact', '{T}: Add one mana of any color.', 2, [])],
    ['rampant growth', card('Rampant Growth', 'Sorcery', 'Search your library for a basic land card, put that card onto the battlefield tapped, then shuffle.', 2, ['G'])],
    ['cultivate', card('Cultivate', 'Sorcery', 'Search your library for up to two basic land cards.', 3, ['G'])],
    ['kodama\'s reach', card('Kodama\'s Reach', 'Sorcery', 'Search your library for up to two basic land cards.', 3, ['G'])],
    ['mesa enchantress', card('Mesa Enchantress', 'Creature — Human Druid', 'Whenever you cast an enchantment spell, you may draw a card.', 3, ['W'])],
    ['swords to plowshares', card('Swords to Plowshares', 'Instant', 'Exile target creature.', 1, ['W'])],
    ['wrath of god', card('Wrath of God', 'Sorcery', 'Destroy all creatures.', 4, ['W'])],
    ['vanilla bear', card('Vanilla Bear', 'Creature — Bear', '', 2, ['G'])],
    ['temple garden', card('Temple Garden', 'Land — Forest Plains', '{T}: Add {G} or {W}.', 0, ['G', 'W'])],
    ['plains', card('Plains', 'Basic Land — Plains', '{T}: Add {W}.', 0, [])],
    ['forest', card('Forest', 'Basic Land — Forest', '{T}: Add {G}.', 0, [])],
  ]);
  const cardOf = (n: string) => catalog.get(n.toLowerCase());
  const candidates: SubCard[] = [
    { name: 'Arcane Signet', type: 'Artifact', cmc: 2 },
    { name: 'Rampant Growth', type: 'Sorcery', cmc: 2 },
    { name: 'Cultivate', type: 'Sorcery', cmc: 3 },
    { name: 'Kodama\'s Reach', type: 'Sorcery', cmc: 3 },
    { name: 'Temple Garden', type: 'Land — Forest Plains', cmc: 0 },
  ];
  return { catalog, cardOf, candidates };
}

describe('balanceDeck', () => {
  it('adds owned candidates + basic lands to bring an under-100 deck to 100 without mutating inputs', () => {
    const { cardOf, candidates } = makePool();
    const deck: DeckCard[] = [
      { name: 'Sythis, Harvest\'s Hand', qty: 1 },
      { name: 'Sol Ring', qty: 1 },
      { name: 'Plains', qty: 15 },
      { name: 'Forest', qty: 15 },
    ];
    const snapshot = JSON.stringify(deck);
    const ctx: DeckContext = {
      deck,
      cardOf,
      commander: 'Sythis, Harvest\'s Hand',
      bracket: 3,
      aggression: 'hungry',
    };
    const prop = balanceDeck({ ctx, candidates, identity: ['G', 'W'] });
    expect(JSON.stringify(deck)).toBe(snapshot);
    expect(prop.mode).toBe('under');
    const allIds = new Set(prop.items.map((i) => i.id));
    const after = applyProposal(deck, prop.items, allIds);
    expect(after.reduce((n, c) => n + c.qty, 0)).toBe(100);
    // Owned Temple Garden should be added alongside basics, never unowned cards
    const names = new Set(after.map((c) => c.name));
    expect(names.has('Temple Garden')).toBe(true);
    expect(names.has('Arcane Signet')).toBe(true);
    // Unticking one item drops only that item without auto-replacing it
    const oneUnticked = new Set(allIds);
    oneUnticked.delete(prop.items[0].id);
    expect(applyProposal(deck, prop.items, oneUnticked).reduce((n, c) => n + c.qty, 0)).toBe(99);
  });

  it('protects commander, partner, and pinned cards when cutting an over-100 deck', () => {
    const { cardOf, candidates } = makePool();
    const deck: DeckCard[] = [
      { name: 'Sythis, Harvest\'s Hand', qty: 1 },
      { name: 'Keleth, Sunmane Familiar', qty: 1 },
      { name: 'Vanilla Bear', qty: 1 },
      { name: 'Sol Ring', qty: 1 },
      { name: 'Plains', qty: 50 },
      { name: 'Forest', qty: 50 },
    ];
    const ctx: DeckContext = {
      deck,
      cardOf,
      commander: 'Sythis, Harvest\'s Hand',
      bracket: 3,
      aggression: 'hungry',
    };
    const prop = balanceDeck({
      ctx,
      candidates,
      identity: ['G', 'W'],
      partner: 'Keleth, Sunmane Familiar',
      pinned: ['Sol Ring'],
    });
    expect(prop.mode).toBe('over');
    const cutNames = prop.items.map((i) => i.cut);
    expect(cutNames).not.toContain('Sythis, Harvest\'s Hand');
    expect(cutNames).not.toContain('Keleth, Sunmane Familiar');
    expect(cutNames).not.toContain('Sol Ring');
    const after = applyProposal(deck, prop.items, new Set(prop.items.map((i) => i.id)));
    expect(after.reduce((n, c) => n + c.qty, 0)).toBe(100);
  });

  it('proposes category-rebalancing swaps at 100 cards when a role like ramp is short', () => {
    const { cardOf, candidates } = makePool();
    const fillers: DeckCard[] = Array.from({ length: 61 }, (_, i) => ({ name: `Bear ${i}`, qty: 1 }));
    const customCardOf = (n: string) =>
      cardOf(n) ?? (n.startsWith('Bear ') ? card(n, 'Creature — Bear', '', 3, ['G']) : undefined);

    const deck: DeckCard[] = [
      { name: 'Sythis, Harvest\'s Hand', qty: 1 },
      { name: 'Vanilla Bear', qty: 1 },
      { name: 'Mesa Enchantress', qty: 1 },
      { name: 'Plains', qty: 18 },
      { name: 'Forest', qty: 18 },
      ...fillers,
    ];
    expect(deck.reduce((n, c) => n + c.qty, 0)).toBe(100);
    const ctx: DeckContext = {
      deck,
      cardOf: customCardOf,
      commander: 'Sythis, Harvest\'s Hand',
      bracket: 3,
      aggression: 'hungry',
    };
    const prop = balanceDeck({ ctx, candidates, identity: ['G', 'W'] });
    expect(prop.mode).toBe('at100');
    expect(prop.items.some((i) => i.kind === 'swap' && i.job === 'ramp' && i.add === 'Arcane Signet')).toBe(true);
    const after = applyProposal(deck, prop.items, new Set(prop.items.map((i) => i.id)));
    expect(after.reduce((n, c) => n + c.qty, 0)).toBe(100);
    const impact = proposalImpact(deck, after, ctx, prop.targetLands);
    const rampRow = impact.find((r) => r.key === 'ramp')!;
    expect(rampRow.after).toBeGreaterThan(rampRow.before);
  });

  it('computes One Path to Bracket II / III cuts cleanly', () => {
    const call: BracketCall = {
      bracket: 4,
      reasons: [],
      gameChangers: ['Rhystic Study', 'Cyclonic Rift', 'Fierce Guardianship', 'Mana Vault'],
      mld: ['Armageddon'],
      extraTurns: ['Time Warp'],
      tutors: [],
      combos: [{ cards: ['Heliod, Sun-Crowned', 'Walking Ballista'], early: true, mv: 4, id: 'c1' }],
      combosChecked: true,
    };
    const b3 = bracketPath(call, 3, 'Heliod, Sun-Crowned');
    expect(b3.fits).toBe(false);
    expect(b3.actions.map((a) => a.card)).toEqual(['Mana Vault', 'Armageddon', 'Walking Ballista']);

    const b2 = bracketPath(call, 2, 'Heliod, Sun-Crowned');
    expect(b2.actions.map((a) => a.card)).toContain('Rhystic Study');
    expect(b2.actions.map((a) => a.card)).toContain('Time Warp');
    expect(b2.actions.map((a) => a.card)).toContain('Walking Ballista');
    expect(b2.actions.map((a) => a.card)).not.toContain('Heliod, Sun-Crowned');
  });
});

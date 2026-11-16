import { describe, expect, it } from 'vitest';
import { toCard } from './scryfall';

/**
 * Two-faced cards (Guillermo, Nov 16): a card that transforms keeps one name, one price and one count — the front's —
 * and gains the back's picture so it can be turned over where it sits.
 */
describe('toCard: the back face of a card that transforms', () => {
  const front = { small: 'https://cards.scryfall.io/small/front/0/0/abc.jpg' };
  const back = { small: 'https://cards.scryfall.io/small/back/0/0/abc.jpg' };

  it('keeps the back picture of a transforming card', () => {
    const c = toCard({
      id: 'abc',
      name: 'Delver of Secrets // Insectile Aberration',
      layout: 'transform',
      cmc: 1,
      color_identity: ['U'],
      prices: { usd: '0.30' },
      legalities: { commander: 'legal' },
      card_faces: [
        { name: 'Delver of Secrets', type_line: 'Creature — Human Wizard', oracle_text: 'Look at the top card.', mana_cost: '{U}', image_uris: front },
        { name: 'Insectile Aberration', type_line: 'Creature — Human Insect', oracle_text: 'Flying.', mana_cost: '', image_uris: back },
      ],
    });
    expect(c.img).toBe(front.small);
    expect(c.back).toBe(back.small);
    // the card is still one card: the front's name, price and type lead
    expect(c.name).toBe('Delver of Secrets // Insectile Aberration');
    expect(c.usd).toBe('0.30');
    expect(c.type).toBe('Creature — Human Wizard');
    expect(c.text).toContain('Flying.'); // both faces' rules text stays searchable
  });

  it('leaves a one-faced card with nothing to turn over', () => {
    const c = toCard({ id: 'sol', name: 'Sol Ring', type_line: 'Artifact', oracle_text: '{T}: Add {C}{C}.', cmc: 1, color_identity: [], image_uris: front, prices: { usd: '1.50' }, legalities: { commander: 'legal' } });
    expect(c.back).toBeUndefined();
  });

  it('gives a split or adventure card no back: both halves are printed on one face', () => {
    const c = toCard({
      id: 'spl',
      name: 'Fire // Ice',
      layout: 'split',
      cmc: 2,
      color_identity: ['R', 'U'],
      image_uris: front,
      prices: { usd: '0.50' },
      legalities: { commander: 'legal' },
      card_faces: [
        { name: 'Fire', type_line: 'Instant', oracle_text: 'Deal 2 damage.', mana_cost: '{1}{R}' },
        { name: 'Ice', type_line: 'Instant', oracle_text: 'Tap target permanent.', mana_cost: '{1}{U}' },
      ],
    });
    expect(c.back).toBeUndefined();
    expect(c.img).toBe(front.small);
  });

  it('marks the card data as version 4, so a card cached before the back face is fetched once more', () => {
    expect(toCard({ id: 'x', name: 'X', legalities: {} }).pv).toBe(4);
  });
});

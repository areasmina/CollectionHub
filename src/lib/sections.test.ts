import { describe, expect, it } from 'vitest';
import { orderSections, sectionOf } from './sections';

const c = (name: string, qty = 1) => ({ name, qty });

describe('sections', () => {
  it('maps EDHREC categories onto the standard sections', () => {
    expect(['Creatures', 'Mana Artifacts', 'Utility Artifacts', 'Basic Lands', 'Utility Lands', 'Sorceries', 'Instants', 'Planeswalkers', 'Enchantments'].map(sectionOf)).toEqual([
      'Creatures', 'Artifacts', 'Artifacts', 'Lands', 'Lands', 'Sorceries', 'Instants', 'Planeswalkers', 'Enchantments',
    ]);
    expect(sectionOf('Battles')).toBe('Battles');
  });
  it('orders: commander, planeswalkers, creatures, instants, sorceries, enchantments, artifacts, lands', () => {
    const lists = ['Lands', 'Artifacts', 'Enchantments', 'Sorceries', 'Instants', 'Creatures', 'Planeswalkers'].map((h) => ({ header: h, cards: [c(`${h} card`)] }));
    expect(orderSections(lists, c('Boss')).map((l) => l.header)).toEqual(['Commander', 'Planeswalkers', 'Creatures', 'Instants', 'Sorceries', 'Enchantments', 'Artifacts', 'Lands']);
  });
  it('merges categories that share a section and skips empty ones', () => {
    const out = orderSections([{ header: 'Basic Lands', cards: [c('Forest', 10)] }, { header: 'Utility Lands', cards: [c('Command Tower')] }, { header: 'Creatures', cards: [] }]);
    expect(out).toEqual([{ header: 'Lands', cards: [c('Forest', 10), c('Command Tower')] }]);
  });
  it('puts the commander first and never counts it twice', () => {
    const out = orderSections([{ header: 'Creatures', cards: [c('Tatyova, Benthic Druid'), c('Lotus Cobra')] }], c('Tatyova, Benthic Druid'));
    expect(out.map((l) => [l.header, l.cards.map((x) => x.name)])).toEqual([['Commander', ['Tatyova, Benthic Druid']], ['Creatures', ['Lotus Cobra']]]);
  });
  it('keeps unknown sections after the known ones', () => {
    expect(orderSections([{ header: 'Battles', cards: [c('B')] }, { header: 'Lands', cards: [c('F')] }]).map((l) => l.header)).toEqual(['Lands', 'Battles']);
  });
});

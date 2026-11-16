import { describe, expect, it } from 'vitest';
import { statOf } from './cmdrstats';
import type { EdhPage } from './edhrec';
import { averageDeckCards, listText, missingCards } from './tilemenu';

const page: EdhPage = {
  header: 'Tatyova',
  tags: [],
  lists: [
    { header: 'Top Cards', cards: [{ name: 'Sol Ring' }, { name: 'Rhystic Study' }, { name: 'Tatyova, Benthic Druid' }] },
    { header: 'Lands', cards: [{ name: 'Forest', qty: 12 }, { name: 'Sol Ring' }, { name: 'Breeding Pool' }] },
  ],
};
const mine = new Map([
  ['tatyova, benthic druid', 1],
  ['sol ring', 1],
]);

describe('Discover tile menu lists', () => {
  it('the average deck starts with the commander and lists each card once', () => {
    const cards = averageDeckCards(page, 'Tatyova, Benthic Druid');
    expect(cards.map((c) => c.name)).toEqual(['Tatyova, Benthic Druid', 'Sol Ring', 'Rhystic Study', 'Forest', 'Breeding Pool']);
    expect(cards.find((c) => c.name === 'Forest')?.qty).toBe(12);
  });

  it('missing cards leave out owned cards and basic lands', () => {
    const miss = missingCards(averageDeckCards(page, 'Tatyova, Benthic Druid'), mine);
    expect(miss).toEqual([
      { name: 'Rhystic Study', qty: 1 },
      { name: 'Breeding Pool', qty: 1 },
    ]);
  });

  it('missing copies add up to the same count the tile shows (statOf)', () => {
    const fewer = new Map([['sol ring', 0]]);
    for (const m of [mine, fewer, new Map<string, number>()]) {
      const miss = missingCards(averageDeckCards(page, 'Tatyova, Benthic Druid'), m);
      expect(miss.reduce((n, c) => n + c.qty, 0)).toBe(statOf(page, m, 'Tatyova, Benthic Druid')!.missing);
    }
  });

  it('only the copies still needed are listed', () => {
    expect(missingCards([{ name: 'Rat Colony', qty: 4 }], new Map([['rat colony', 3]]))).toEqual([{ name: 'Rat Colony', qty: 1 }]);
  });

  it('list text is one "qty name" line per card', () => {
    expect(listText([{ name: 'Sol Ring', qty: 1 }, { name: 'Forest', qty: 12 }])).toBe('1 Sol Ring\n12 Forest');
  });
});

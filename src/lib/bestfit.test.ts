import { describe, expect, it } from 'vitest';
import { pickBest, scanBestFit, type FitResult } from './bestfit';
import { NoPage, type EdhPage } from './sources/edhrec';

const share = (owned: number, total = 100) => ({ total, owned, missing: total - owned, pct: Math.round((100 * owned) / total) });
const r = (bracket: string, budget: string, s: ReturnType<typeof share> | null): FitResult => ({ bracket, budget, share: s });

describe('pickBest (Suggested Deck, roadmap 5.1)', () => {
  it('picks the highest owned %', () => {
    expect(pickBest([r('upgraded', 'budget', share(60)), r('optimized', 'expensive', share(82)), r('cedh', '', share(70))])).toMatchObject({ bracket: 'optimized', budget: 'expensive' });
  });
  it('skips combinations EDHREC has no deck for', () => {
    expect(pickBest([r('cedh', 'budget', null), r('upgraded', '', share(40))])).toMatchObject({ bracket: 'upgraded', budget: '' });
    expect(pickBest([r('cedh', 'budget', null)])).toBeUndefined();
  });
  it('on a tie prefers more cards owned, then the cheaper budget, then the lower bracket', () => {
    expect(pickBest([r('upgraded', '', share(50, 100)), r('optimized', '', share(51, 102))])).toMatchObject({ bracket: 'optimized' });
    expect(pickBest([r('optimized', 'expensive', share(70)), r('optimized', 'budget', share(70)), r('optimized', '', share(70))])).toMatchObject({ budget: 'budget' });
    expect(pickBest([r('cedh', 'budget', share(70)), r('upgraded', 'budget', share(70))])).toMatchObject({ bracket: 'upgraded' });
  });
});

describe('scanBestFit', () => {
  const page = (names: string[]): EdhPage => ({ header: 'x', card: { id: 'c', ci: ['G'] }, tags: [], lists: [{ header: 'Creatures', cards: names.map((name) => ({ name })) }] });
  it('checks brackets 3, 4, 5 at every budget and counts the commander as a card', async () => {
    const asked: string[] = [];
    const mine = new Map([['tatyova, benthic druid', 1], ['sol ring', 1]]);
    const res = await scanBestFit({ slug: 'tatyova-benthic-druid', commander: 'Tatyova, Benthic Druid', mine }, async (path) => {
      asked.push(path);
      if (path.includes('cedh')) throw new NoPage('none');
      return path.endsWith('/budget') ? page(['Sol Ring', 'Llanowar Elves', 'Forest']) : page(['Llanowar Elves', 'Elvish Mystic', 'Forest']);
    });
    expect(asked).toHaveLength(9);
    expect(asked).toContain('average-decks/tatyova-benthic-druid/upgraded/expensive');
    expect(asked).toContain('average-decks/tatyova-benthic-druid/optimized');
    expect(res.filter((x) => x.share === null)).toHaveLength(3);
    // commander + Sol Ring + Forest (basics count as owned) out of 4
    expect(res.find((x) => x.bracket === 'upgraded' && x.budget === 'budget')!.share).toMatchObject({ total: 4, owned: 3, pct: 75 });
    expect(pickBest(res)).toMatchObject({ bracket: 'upgraded', budget: 'budget' });
  });
  it('passes the theme through and survives EDHREC being unreachable', async () => {
    const res = await scanBestFit({ slug: 'x', commander: 'X', tag: 'landfall', mine: new Map() }, async (path) => {
      expect(path).toContain('/landfall');
      throw new Error('offline');
    });
    expect(res.every((x) => x.share === null)).toBe(true);
  });
});

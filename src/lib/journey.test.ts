import { describe, expect, it } from 'vitest';
import { JOURNEY_STEPS, canAddFromExplore, exploreColours, nextTips } from './journey';

describe('deckbuilding journey', () => {
  it('runs START → EXPLORE → TUNE, in that order', () => {
    expect(JOURNEY_STEPS).toEqual(['start', 'explore', 'tune']);
  });

  it('turns a commander’s identity into the tag graph’s colours in WUBRG order', () => {
    expect(exploreColours(['G', 'U'])).toEqual(['U', 'G']);
    expect(exploreColours(['b', 'W', 'B'])).toEqual(['W', 'B']);
  });

  it('a colourless commander explores colourless cards; no commander yet means no colour filter', () => {
    expect(exploreColours([])).toEqual(['C']);
    expect(exploreColours(undefined)).toEqual([]);
  });

  it('drops letters the graph does not know', () => {
    expect(exploreColours(['X', 'R'])).toEqual(['R']);
  });

  it('EXPLORE offers + ADD only for a card of yours that is not in the deck yet', () => {
    expect(canAddFromExplore(true, false)).toBe(true);
    expect(canAddFromExplore(true, true)).toBe(false);
    expect(canAddFromExplore(false, false)).toBe(false);
  });

  it('NEXT tips follow the deck’s own failed checks, quote their reason, and stop at two', () => {
    const checks = [
      { key: 'ramp', kind: 'build', ok: false, says: '6 ramp: hungry wants 10–12. The deck may start slowly.' },
      { key: 'removal', kind: 'build', ok: false, says: '4 removal: hungry wants 8–10. Few answers to a threat.' },
      { key: 'draw', kind: 'build', ok: true, says: '11 card draw.' },
      { key: 'cards', kind: 'rules', ok: false, says: '96 cards.' },
    ];
    const tips = nextTips(checks, 96);
    expect(tips.map((t) => t.key)).toEqual(['removal', 'ramp']);
    expect(tips[0].why).toContain('4 removal');
    expect(tips[0].go).toEqual({ step: 'explore', tag: 'removal' });
  });

  it('a deck short of or over 100 is pointed to Balance / Cut Lab; a passing 100-card deck gets no tip', () => {
    expect(nextTips([], 92)).toEqual([{ key: 'size', text: 'Fill 8 slots with Balance to 100', why: '92 of 100 cards.', go: { step: 'balance' } }]);
    expect(nextTips([], 101)[0].text).toBe('Cut 1 card in Cut Lab');
    expect(nextTips([{ key: 'ramp', kind: 'build', ok: true, says: '' }], 100)).toEqual([]);
  });

  it('board wipes open the graph on the sweeper tag', () => {
    expect(nextTips([{ key: 'wipes', kind: 'build', ok: false, says: '0 board wipes' }], 100)[0].go).toEqual({ step: 'explore', tag: 'sweeper' });
  });
});

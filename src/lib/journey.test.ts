import { describe, expect, it } from 'vitest';
import { JOURNEY_STEPS, exploreColours } from './journey';

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
});

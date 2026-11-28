import { describe, expect, it } from 'vitest';
import { swipeCloses, swipeOffset, SWIPE_CLOSE_PX } from './swipe';

describe('swipe-down-to-close', () => {
  it('a long drag down closes, however slow', () => {
    expect(swipeCloses(SWIPE_CLOSE_PX, 2000)).toBe(true);
    expect(swipeCloses(300, 900)).toBe(true);
  });
  it('a short slow drag springs back', () => {
    expect(swipeCloses(40, 400)).toBe(false);
  });
  it('a quick flick down closes before the full distance', () => {
    expect(swipeCloses(40, 50)).toBe(true);
  });
  it('a tiny twitch never closes, even fast (a tap must not close the sheet)', () => {
    expect(swipeCloses(10, 5)).toBe(false);
  });
  it('dragging up or not at all never closes', () => {
    expect(swipeCloses(-200, 50)).toBe(false);
    expect(swipeCloses(0, 0)).toBe(false);
    expect(swipeCloses(Number.NaN, 10)).toBe(false);
  });
  it('the sheet follows the finger down and resists being pulled up', () => {
    expect(swipeOffset(50)).toBe(50);
    expect(swipeOffset(-60)).toBe(-10);
  });
});

import { describe, expect, it } from 'vitest';
import { clampShift } from './onscreen';

describe('clampShift: keep a pop-up inside the screen', () => {
  it('leaves a pop-up that already fits alone', () => {
    expect(clampShift(20, 300, 360)).toBe(0);
    expect(clampShift(8, 352, 360)).toBe(0);
  });
  it('pulls one that runs off the right edge back, leaving a gutter', () => {
    expect(clampShift(199, 509, 360)).toBe(-157); // the salt note on a 360px phone
  });
  it('pushes one that runs off the left edge back in', () => {
    expect(clampShift(-96, 232, 360)).toBe(104); // the bracket note on a 360px phone
  });
  it('a box wider than the screen lines up with the left gutter', () => {
    expect(clampShift(50, 400, 360)).toBe(-42);
  });
});

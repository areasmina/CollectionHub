import { describe, expect, it } from 'vitest';
import { diamonds, meterCells } from './parts';

describe('meterCells', () => {
  it('lights a bar once the % reaches its middle', () => {
    expect(meterCells(100).filter(Boolean)).toHaveLength(10);
    expect(meterCells(95).filter(Boolean)).toHaveLength(10);
    expect(meterCells(94).filter(Boolean)).toHaveLength(9);
    expect(meterCells(4).filter(Boolean)).toHaveLength(0);
    expect(meterCells(5).filter(Boolean)).toHaveLength(1);
  });
  it('clamps out-of-range values', () => {
    expect(meterCells(-20).some(Boolean)).toBe(false);
    expect(meterCells(250).every(Boolean)).toBe(true);
  });
});

describe('diamonds', () => {
  it('shows owned and missing copies', () => {
    expect(diamonds(3, 4)).toBe('◆◆◆◇');
    expect(diamonds(0, 1)).toBe('◇');
    expect(diamonds(5, 2)).toBe('◆◆');
  });
  it('caps long rows with +N', () => {
    expect(diamonds(10, 10)).toBe('◆◆◆◆ +6');
  });
});

import { describe, expect, it } from 'vitest';
import { buildLibrary, hypergeomAtLeast, keepVerdict, shuffle } from './handMath';

describe('handMath', () => {
  it('computes exact hypergeometric draw odds for 36 lands in 99 cards', () => {
    const p1 = hypergeomAtLeast(99, 36, 7, 1);
    const p2 = hypergeomAtLeast(99, 36, 7, 2);
    const p3ByT3 = hypergeomAtLeast(99, 36, 9, 3);
    expect(p1).toBeCloseTo(0.9624, 3);
    expect(p2).toBeCloseTo(0.7985, 3);
    expect(p3ByT3).toBeCloseTo(0.7044, 3);
  });

  it('handles edge cases safely', () => {
    expect(hypergeomAtLeast(99, 0, 7, 1)).toBe(0);
    expect(hypergeomAtLeast(99, 10, 0, 1)).toBe(0);
    expect(hypergeomAtLeast(10, 10, 10, 10)).toBeCloseTo(1, 6);
  });

  it('evaluates opening hand keep verdicts', () => {
    expect(keepVerdict(3, 7).label).toBe('KEEP');
    expect(keepVerdict(1, 7).label).toBe('RISKY');
    expect(keepVerdict(0, 7).label).toBe('MULLIGAN');
    expect(keepVerdict(6, 7).label).toBe('MULLIGAN');
  });

  it('builds a library excluding commander and partner while expanding quantities', () => {
    const lib = buildLibrary(
      [
        { name: 'Atraxa, Praetors\' Voice', qty: 1 },
        { name: 'Sol Ring', qty: 1 },
        { name: 'Forest', qty: 3 },
      ],
      'Atraxa, Praetors\' Voice',
    );
    expect(lib).toEqual(['Sol Ring', 'Forest', 'Forest', 'Forest']);
    const mixed = shuffle(lib, () => 0.2);
    expect(mixed).toHaveLength(4);
  });
});

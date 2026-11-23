import { describe, expect, it } from 'vitest';
import { expired, KEEP_DAYS, mergeWorth, worthReadings } from './worthlog';

const now = Date.parse('2026-11-23T12:00:00Z');

describe('worth log: a year of daily totals per binder (Guillermo, Nov 23)', () => {
  it('drops only this binder’s days older than a year', () => {
    const keys = ['worthlog:1:2025-11-22', 'worthlog:1:2025-11-23', 'worthlog:1:2026-11-23', 'worthlog:2:2025-01-01', 'worthlog:12:2025-01-01'];
    expect(KEEP_DAYS).toBe(366);
    expect(expired(keys, 1, now)).toEqual(['worthlog:1:2025-11-22']); // 2025-11-23 is the 366th day back, kept
    expect(expired(keys, 2, now)).toEqual(['worthlog:2:2025-01-01']); // binder 12 is not binder 1 or 2
  });

  it('puts the snapshot estimates only before the first logged day, and a logged day wins over its estimate', () => {
    const logged = [{ day: '2026-11-20', usd: 100 }, { day: '2026-11-22', usd: 110 }];
    const est = [{ day: '2026-11-18', usd: 90 }, { day: '2026-11-20', usd: 95 }, { day: '2026-11-21', usd: 105 }];
    expect(mergeWorth(logged, est)).toEqual([
      { day: '2026-11-18', usd: 90, est: true },
      { day: '2026-11-20', usd: 100 },
      { day: '2026-11-22', usd: 110 }, // the gap on the 21st is not filled with an estimate
    ]);
  });

  it('uses the estimates alone while nothing is logged yet', () => {
    expect(mergeWorth([], [{ day: '2026-11-21', usd: 5 }])).toEqual([{ day: '2026-11-21', usd: 5, est: true }]);
  });

  it('reads today, the change since the line starts and the best day', () => {
    const r = worthReadings([
      { day: '2026-11-18', usd: 90, est: true },
      { day: '2026-11-20', usd: 120 },
      { day: '2026-11-21', usd: 120 },
      { day: '2026-11-22', usd: 110.555 },
    ])!;
    expect(r.today.day).toBe('2026-11-22');
    expect(r.change).toBe(20.56);
    expect(r.best).toEqual({ day: '2026-11-20', usd: 120 }); // the earlier of two equal highs
    expect(r.estimated).toBe(1);
    expect(worthReadings([])).toBeNull();
  });
});

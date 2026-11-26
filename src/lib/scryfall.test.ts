import { describe, expect, it } from 'vitest';
import { batchCheapestQueries } from './scryfall';

describe('batchCheapestQueries', () => {
  it('keeps every Scryfall search query under 950 characters across 50 long card names', () => {
    const entries: [string, string][] = Array.from({ length: 50 }, (_, i) => [
      `long card name number ${i} of the endless arcane sanctum`,
      `Long Card Name Number ${i} of the Endless Arcane Sanctum`,
    ]);
    const batches = batchCheapestQueries(entries);
    expect(batches.length).toBeGreaterThan(2);
    expect(batches.reduce((n, b) => n + b.batch.length, 0)).toBe(50);
    for (const { batch, query } of batches) {
      expect(batch.length).toBeLessThanOrEqual(25);
      expect(query.length).toBeLessThan(950);
      expect(query).toContain('game:paper');
    }
  });

  it('strips double quotes from card names and preserves single oversized names', () => {
    const batches = batchCheapestQueries([
      ['kongming', 'Kongming, "Sleeping Dragon"'],
      ['huge', 'A'.repeat(900)],
    ]);
    expect(batches[0].query).not.toContain('""');
    expect(batches[1].batch).toHaveLength(1);
  });
});

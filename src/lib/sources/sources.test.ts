import { describe, expect, it } from 'vitest';

// Every outside data source has one adapter in src/lib/sources/. Nothing else may call its API directly, so terms,
// caching and pacing live in one place (docs/data-sources.md).
const code = import.meta.glob('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('data source adapters', () => {
  it('reads the source files', () => expect(Object.keys(code).length).toBeGreaterThan(20));
  it('only the EDHREC adapter calls json.edhrec.com', () => {
    const offenders = Object.entries(code)
      .filter(([f, text]) => !f.startsWith('/src/lib/sources/') && text.includes('json.edhrec.com'))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { islandRests } from './island';

describe('islandRests: the island only stays put where its own edge has room', () => {
  const view = 900;
  const page = 3000;
  it('a top dock rests at the start of the page, never at the end', () => {
    expect(islandRests('top', 0, view, page)).toBe(true);
    expect(islandRests('top', 79, view, page)).toBe(true);
    expect(islandRests('top', 80, view, page)).toBe(false);
    expect(islandRests('top', page - view, view, page)).toBe(false); // the end: it used to land on content here
  });
  it('a bottom dock rests at the end of the page, not at the start once you scroll', () => {
    expect(islandRests('bottom', page - view, view, page)).toBe(true);
    expect(islandRests('bottom', page - view - 40, view, page)).toBe(true);
    expect(islandRests('bottom', page - view - 41, view, page)).toBe(false);
    expect(islandRests('bottom', 10, view, page)).toBe(false);
    expect(islandRests('bottom', 0, view, page)).toBe(true); // a freshly opened page always shows its nav
  });
  it('side docks behave like the top dock', () => {
    for (const d of ['left', 'right'] as const) {
      expect(islandRests(d, 0, view, page)).toBe(true);
      expect(islandRests(d, page - view, view, page)).toBe(false);
    }
  });
  it('a page too short to scroll keeps the island in view on every dock', () => {
    for (const d of ['top', 'bottom', 'left', 'right'] as const) expect(islandRests(d, 0, view, view)).toBe(true);
  });
});

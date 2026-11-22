import { describe, expect, it } from 'vitest';
import { islandScroll, islandRests, type IslandScroll } from './island';

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

describe('islandScroll: away as you go down, back once you have really pulled up', () => {
  const view = 900;
  const page = 3000;
  const at = (y: number, away = false, up = 0): IslandScroll => ({ away, lastY: y, up });
  it('goes away going down and comes back on a move up', () => {
    expect(islandScroll('top', at(1200), 1300, view, page).away).toBe(true);
    expect(islandScroll('top', at(1300, true), 1100, view, page).away).toBe(false);
  });
  it('comes back on a smooth scroll made of small steps', () => {
    let s = at(1300, true);
    for (const y of [1280, 1260, 1240, 1220]) s = islandScroll('top', s, y, view, page);
    expect(s.away).toBe(false); // 80px up in 20px steps
  });
  it('a nudge up and its nudge back down leave it away (no flicker at the end of a page)', () => {
    let s = at(1300, true);
    s = islandScroll('top', s, 1254, view, page); // the sticky bar goes: the view slides up 46px
    expect(s.away).toBe(true);
    s = islandScroll('top', s, 1300, view, page); // and comes back: the count starts again
    expect(s.away).toBe(true);
    s = islandScroll('top', s, 1254, view, page);
    expect(s.away).toBe(true);
  });
  it('a few px down out of the rest zone sends it away (a late image nudging the view past the edge)', () => {
    expect(islandScroll('top', at(78), 83, view, page).away).toBe(true);
    expect(islandScroll('left', at(79), 81, view, page).away).toBe(true);
  });
  it('a slow scroll down in small steps adds up and sends it away', () => {
    let s = at(1200);
    for (const y of [1203, 1206, 1209]) s = islandScroll('top', s, y, view, page);
    expect(s.away).toBe(true); // 9px down in 3px steps
  });
  it('one tiny step down mid-page alone does not hide it', () => {
    expect(islandScroll('top', at(1200), 1204, view, page).away).toBe(false);
  });
  it('the page getting shorter at its end pulls the view up, but that is not you scrolling up: it stays away', () => {
    let s = islandScroll('top', at(1200), page - view, view, page); // down to the end
    expect(s.away).toBe(true);
    s = islandScroll('top', s, page - view - 150, view, page - 150); // 150px less page: the view is pulled up 150px
    expect(s.away).toBe(true);
    s = islandScroll('top', s, page - view - 250, view, page - 150); // then a real move up brings it back
    expect(s.away).toBe(false);
  });
  it('still shows where the page leaves room on its own edge', () => {
    expect(islandScroll('top', at(1200, true), 10, view, page).away).toBe(false);
    expect(islandScroll('bottom', at(1200, true), page - view, view, page).away).toBe(false);
  });
});

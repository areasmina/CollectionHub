import { describe, expect, it } from 'vitest';
import { parseTags } from '../../lib/tags';
import { countOwnedForTag, createTagIndex, evalTagQuery, starterTags } from './tagState';

function fixture() {
  const raw = {
    v: 1,
    at: '2026-11-24',
    fields: ['id', 'label', 'description', 'aliases', 'parents', 'cards', 'top'],
    cards: [
      'Counterspell',
      'Mesa Enchantress',
      'Rhystic Study',
      'Sol Ring',
      'Sram, Senior Edificer',
      'Sythis, Harvest\'s Hand',
    ],
    tags: [
      ['t-adv', 'card-advantage', 'Generates extra cards', [], [], [], []],
      ['t-draw', 'draw', 'Draws cards', ['card draw'], [0], [2], [2]],
      ['t-ench', 'enchantment-engine', 'Triggers on enchantments', ['enchantress'], [1], [1, 3, 1], [1, 4]],
      // Multi-parent diamond: child also under draw & card-advantage
      ['t-curio', 'curiosity', 'Draw on damage', [], [0, 1], [0, 1], []],
    ],
  };
  const parsed = parseTags(raw);
  if (!parsed) throw new Error('fixture failed');
  return createTagIndex(parsed);
}

describe('tagState', () => {
  it('dedupes multi-parent DAG descendants and counts owned cards', () => {
    const idx = fixture();
    const owned = new Set(['mesa enchantress', 'rhystic study', 'sol ring']);
    // draw (1) owns Rhystic Study (2) + child enchantment-engine (1,4,5) + child curiosity (0,1,2)
    const drawCards = idx.cardsOfMemo(1);
    expect([...drawCards].sort((a, b) => a - b)).toEqual([0, 1, 2, 4, 5]);
    const counts = countOwnedForTag(idx, 1, owned);
    expect(counts).toEqual({ owned: 2, total: 5 });
  });

  it('evaluates AND / NOT conditions and filters by ownership and colour identity', () => {
    const idx = fixture();
    const owned = new Set(['mesa enchantress', 'sythis, harvest\'s hand']);
    const ci = new Map<string, string[]>([
      ['Mesa Enchantress', ['W']],
      ['Rhystic Study', ['U']],
      ['Sol Ring', []],
      ['Sram, Senior Edificer', ['W']],
      ['Sythis, Harvest\'s Hand', ['G', 'W']],
    ]);

    // Owned only for enchantment-engine (cards 1, 4, 5 -> Mesa, Sram, Sythis)
    const ownedRes = evalTagQuery(idx, [{ tagIdx: 2, mode: 'include' }], {
      owned,
      show: 'owned',
      ciOf: (n) => ci.get(n),
    });
    expect(ownedRes.map((r) => r.name)).toEqual(['Mesa Enchantress', 'Sythis, Harvest\'s Hand']);

    // All cards with colour filter W only (excludes Sythis G+W) and NOT curiosity (excludes Mesa Enchantress)
    const filtered = evalTagQuery(
      idx,
      [
        { tagIdx: 2, mode: 'include' },
        { tagIdx: 3, mode: 'exclude' },
      ],
      {
        owned,
        show: 'all',
        colours: ['W'],
        ciOf: (n) => ci.get(n),
      },
    );
    expect(filtered.map((r) => r.name)).toEqual(['Sram, Senior Edificer']);
  });

  it('returns missing cards only when show === missing', () => {
    const idx = fixture();
    const owned = new Set(['mesa enchantress']);
    const missing = evalTagQuery(idx, [{ tagIdx: 2, mode: 'include' }], { owned, show: 'missing' });
    // `top` in raw fixture is gap-encoded `[1, 4]` -> indices `[1, 5]` (Sythis is index 5, so `isTop` sorts first)
    expect(missing.map((r) => r.name)).toEqual(['Sythis, Harvest\'s Hand', 'Sram, Senior Edificer']);
  });

  it('picks starter tags cleanly', () => {
    const idx = fixture();
    expect(starterTags(idx)).toContain(1);
    expect(starterTags(idx)).toContain(2);
  });
});

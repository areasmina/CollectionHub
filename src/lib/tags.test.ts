import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script module
import { bulkEntry, gaps, tagsFile } from '../../scripts/tags-format.mjs';
import { norm } from './names';
import { cardsOf, findTags, ownedOf, parseTags, type TagData } from './tags';

// Cards as in Scryfall's "Oracle Cards" bulk file (only the fields the build reads).
const card = (name: string, oracle_id: string, legal = 'legal', extra: object = {}) => ({
  name,
  oracle_id,
  layout: 'normal',
  games: ['paper'],
  legalities: { commander: legal },
  id: `${oracle_id}-print`,
  ...extra,
});
const CARDS = [
  card('Faithless Looting', 'o-loot1'),
  card('Thrill of Possibility', 'o-loot2'),
  card('Curiosity', 'o-cur1'),
  card('Ophidian Eye', 'o-cur2'),
  card('Rhystic Study', 'o-draw1'),
  card('Mana Crypt', 'o-banned', 'banned'),
  card('Arena Looter', 'o-arena', 'legal', { games: ['arena'] }),
  card('Delver of Secrets // Insectile Aberration', 'o-dfc', 'legal', { layout: 'transform' }),
];
// Tags as in Scryfall's "Oracle Tags" bulk file: draw has no cards of its own (only children), as in the real file.
const tag = (id: string, label: string, o: Partial<{ parents: string[]; children: string[]; cards: [string, string?][]; aliases: string[]; type: string; description: string }> = {}) => ({
  object: 'tag',
  id,
  label,
  slug: label.replace(/ /g, '-'),
  type: o.type ?? 'oracle',
  description: o.description ?? null,
  parent_ids: o.parents ?? [],
  child_ids: o.children ?? [],
  aliases: o.aliases ?? [],
  taggings: (o.cards ?? []).map(([oracle_id, weight = 'median']) => ({ oracle_id, weight })),
});
const TAGS = [
  tag('t-ca', 'card advantage', { children: ['t-draw'] }),
  tag('t-draw', 'draw', { parents: ['t-ca'], children: ['t-loot', 't-cur', 't-rep'], description: 'Spells and abilities that draw you cards.' }),
  tag('t-loot', 'loot', { parents: ['t-draw'], cards: [['o-loot1', 'very_strong'], ['o-loot2'], ['o-banned'], ['o-arena']], aliases: ['filter draw'] }),
  // curiosity sits under two parents, like the real one
  tag('t-cur', 'curiosity', { parents: ['t-draw', 't-rep'], cards: [['o-cur1'], ['o-cur2'], ['o-dfc']] }),
  tag('t-rep', 'repeatable draw', { parents: ['t-draw'], children: ['t-cur'], cards: [['o-draw1'], ['o-cur1']] }),
  tag('t-empty', 'only banned cards', { cards: [['o-banned']] }),
  tag('t-hidden', 'bad tag', { cards: [['o-loot1']] }),
  tag('t-art', 'dragon', { type: 'illustration', cards: [['o-loot1']] }),
  // a loop in the hierarchy must not hang the build or the app
  tag('t-a', 'loop a', { parents: ['t-b'], children: ['t-b'] }),
  tag('t-b', 'loop b', { parents: ['t-a'], children: ['t-a'] }),
];

const built = () => tagsFile(TAGS, CARDS, '2026-11-23T22:00:39Z', ['t-hidden']);
const data = () => parseTags(JSON.parse(built().text)) as TagData;
const at = (d: TagData, label: string) => d.tags.findIndex((t) => t.label === label);
const names = (d: TagData, s: Iterable<number>) => [...s].map((c) => d.cards[c]).sort();

describe('tag file (scripts/build-tags.mjs)', () => {
  it('keeps function tags that reach a Commander-legal paper card; drops art, hidden and empty tags and loops', () => {
    expect(data().tags.map((t) => t.label)).toEqual(['card advantage', 'curiosity', 'draw', 'loot', 'repeatable draw']);
  });
  it('keeps a broad tag with no cards of its own for the tags below it', () => {
    const d = data();
    expect(d.tags[at(d, 'draw')].cards).toEqual([]);
    expect(d.tags[at(d, 'draw')].description).toBe('Spells and abilities that draw you cards.');
  });
  it('lists only Commander-legal paper cards, sorted, with full two-faced names', () => {
    expect(data().cards).toEqual(['Curiosity', 'Delver of Secrets // Insectile Aberration', 'Faithless Looting', 'Ophidian Eye', 'Rhystic Study', 'Thrill of Possibility']);
  });
  it('writes one tag per line and stores card positions as gaps', () => {
    const { text, tags, cards, taggings } = built();
    expect(text.split('\n').filter((l: string) => l.startsWith('["'))).toHaveLength(5);
    expect([tags, cards, taggings]).toEqual([5, 6, 7]);
    expect(gaps([2, 5, 9])).toEqual([2, 3, 4]);
  });
  it('finds the bulk file addresses, and says what came back when one is missing', () => {
    const catalog = { data: [{ type: 'oracle_tags', jsonl_download_uri: 'https://data.scryfall.io/t.jsonl.gz', updated_at: 'x' }] };
    expect(bulkEntry(catalog, 'oracle_tags').url).toBe('https://data.scryfall.io/t.jsonl.gz');
    expect(() => bulkEntry(catalog, 'oracle_cards')).toThrow(/oracle_tags/);
  });
});

describe('tag data in the app (lib/tags)', () => {
  it('links broader and narrower tags both ways, including a tag with two parents', () => {
    const d = data();
    const label = (i: number) => d.tags[i].label;
    expect(d.tags[at(d, 'draw')].children.map(label).sort()).toEqual(['curiosity', 'loot', 'repeatable draw']);
    expect(d.tags[at(d, 'curiosity')].parents.map(label).sort()).toEqual(['draw', 'repeatable draw']);
    expect(d.tags[at(d, 'draw')].parents.map(label)).toEqual(['card advantage']);
  });
  it("counts a tag's cards with every tag below it, each card once", () => {
    const d = data();
    expect(names(d, cardsOf(d, at(d, 'draw')))).toEqual(['Curiosity', 'Delver of Secrets // Insectile Aberration', 'Faithless Looting', 'Ophidian Eye', 'Rhystic Study', 'Thrill of Possibility']);
    expect(names(d, cardsOf(d, at(d, 'repeatable draw')))).toEqual(['Curiosity', 'Delver of Secrets // Insectile Aberration', 'Ophidian Eye', 'Rhystic Study']);
    expect(names(d, d.tags[at(d, 'loot')].top)).toEqual(['Faithless Looting']);
  });
  it('counts owned cards by name, front face of a two-faced card included', () => {
    const d = data();
    const owned = new Set(['Curiosity', 'Delver of Secrets', 'Sol Ring'].map(norm));
    expect(ownedOf(d, at(d, 'curiosity'), owned)).toEqual({ owned: 2, total: 3 });
    expect(ownedOf(d, at(d, 'loot'), owned)).toEqual({ owned: 0, total: 2 });
  });
  it('finds tags by label or alias, exact and starting matches first', () => {
    const d = data();
    const label = (i: number) => d.tags[i].label;
    expect(findTags(d, 'draw').map(label)).toEqual(['draw', 'repeatable draw', 'loot']);
    expect(findTags(d, 'filter').map(label)).toEqual(['loot']);
    expect(findTags(d, '  ')).toEqual([]);
  });
  it('turns away a missing, newer or damaged file instead of showing wrong tags', () => {
    const good = JSON.parse(built().text);
    expect(parseTags(null)).toBeNull();
    expect(parseTags({ ...good, v: 2 })).toBeNull();
    expect(parseTags({ ...good, tags: [['x', 'y', null, [], [99], [], []]] })).toBeNull();
    expect(parseTags({ ...good, tags: [['x', 'y', null, [], [], [500], []]] })).toBeNull();
  });
});

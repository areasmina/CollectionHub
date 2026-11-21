import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS build script module
import { bulkCards, cardListFile, oracleEntry, row } from '../../scripts/cardlist-format.mjs';
import { cardFromList, LIST_CACHE, LIST_URL, parseCardList, saveCardList, smallPic, type ListDeps } from './cardlist';

const sol = { name: 'Sol Ring', layout: 'normal', games: ['paper', 'mtgo'], type_line: 'Artifact', mana_cost: '{1}', cmc: 1, color_identity: [], rarity: 'uncommon', legalities: { commander: 'legal' }, oracle_text: '{T}: Add {C}{C}.', id: 'aaaa0000-0000-4000-8000-000000000001', set: 'cmm', collector_number: '400' };
const delver = {
  name: 'Delver of Secrets // Insectile Aberration',
  layout: 'transform',
  games: ['paper'],
  cmc: 1,
  color_identity: ['U'],
  rarity: 'common',
  legalities: { commander: 'legal' },
  id: 'bbbb0000-0000-4000-8000-000000000002',
  set: 'isd',
  collector_number: '51',
  card_faces: [
    { type_line: 'Creature — Human Wizard', mana_cost: '{U}', oracle_text: 'At the beginning of your upkeep, look at the top card…', image_uris: { small: 'x' } },
    { type_line: 'Creature — Human Insect', mana_cost: '', oracle_text: 'Flying', image_uris: { small: 'y' } },
  ],
};
const token = { ...sol, name: 'Goblin', layout: 'token' };
const online = { ...sol, name: 'Arena Only', games: ['arena'] };
const banned = { ...sol, name: 'Mana Crypt', legalities: { commander: 'banned' }, rarity: 'mythic' };

describe('card list file (scripts/build-cardlist.mjs)', () => {
  it('keeps paper cards only: no tokens, no digital-only cards', () => {
    expect(row(token)).toBeNull();
    expect(row(online)).toBeNull();
    expect(row(sol)).toEqual(['Sol Ring', 'Artifact', '{1}', 1, '', 'u', 1, '{T}: Add {C}{C}.', sol.id, 'cmm', '400', 0]);
  });
  it('joins both faces of a two-faced card and notes it can be turned over', () => {
    const r = row(delver);
    expect(r[1]).toBe('Creature — Human Wizard // Creature — Human Insect');
    expect(r[7]).toContain('\nFlying');
    expect(r[11]).toBe(1);
  });
  it('writes one card per line, sorted by name, and reads back', () => {
    const text = cardListFile([sol, token, delver, banned], '2026-11-20T00:00:00Z');
    expect(text.split('\n').slice(1, 4).map((l: string) => JSON.parse(l.replace(/,$/, ''))[0])).toEqual(['Delver of Secrets // Insectile Aberration', 'Mana Crypt', 'Sol Ring']);
    const list = parseCardList(text);
    expect(list.get('sol ring')?.[8]).toBe(sol.id);
    expect(list.get('delver of secrets')?.[0]).toBe(delver.name); // found by its front face too
    expect(list.get('mana crypt')?.[6]).toBe(0);
  });
  it("finds the Oracle Cards file in Scryfall's bulk-data catalog, as JSON lines (now) or JSON (before)", () => {
    const now = { object: 'bulk_data', type: 'oracle_cards', updated_at: '2026-11-19T22:01:59Z', jsonl_download_uri: 'https://data.scryfall.io/oracle-cards/x.jsonl.gz' };
    const other = { object: 'bulk_data', type: 'default_cards', jsonl_download_uri: 'https://data.scryfall.io/default-cards/y.jsonl.gz' };
    expect(oracleEntry({ object: 'list', data: [other, now] })).toEqual({ url: now.jsonl_download_uri, updated_at: now.updated_at });
    expect(oracleEntry({ data: [{ type: 'oracle_cards', download_uri: 'old.json' }] }).url).toBe('old.json');
    expect(() => oracleEntry({ object: 'list', data: [other] })).toThrow(/oracle_cards.*default_cards/);
    expect(() => oracleEntry({ object: 'bulk_data', type: 'oracle_cards' })).toThrow(/none/);
    expect(() => oracleEntry({ data: [{ type: 'oracle_cards', uri: 'u' }] })).toThrow(/no download address.*"uri":"u"/);
  });
  it('reads a bulk file gzipped as JSON lines, or plain as a JSON array', async () => {
    const lines = `${JSON.stringify(sol)}\n${JSON.stringify(delver)}\n`;
    const gz = new Uint8Array(await new Response(new Blob([lines]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
    expect(gz[0]).toBe(0x1f);
    expect(bulkCards(gz).map((c: { name: string }) => c.name)).toEqual([sol.name, delver.name]);
    expect(bulkCards(new TextEncoder().encode(JSON.stringify([sol]))).map((c: { name: string }) => c.name)).toEqual([sol.name]);
  });
  it('refuses a file in a format it does not know', () => {
    expect(() => parseCardList('{"v":2,"fields":[],"cards":[]}')).toThrow(/format/);
  });
});

describe('cardFromList', () => {
  const list = parseCardList(cardListFile([sol, delver]));
  it('makes a card with no price, marked old so Scryfall refreshes it, and a picture from the printing id', () => {
    const c = cardFromList(list, 'sol ring')!;
    expect(c).toMatchObject({ id: sol.id, name: 'Sol Ring', key: 'sol ring', type: 'Artifact', ci: [], set: 'cmm', cn: '400', legal: true, rarity: 'uncommon', pv: 0, at: 0 });
    expect(c.usd).toBeUndefined();
    expect(c.img).toBe(smallPic(sol.id));
    expect(c.img).toBe('https://cards.scryfall.io/small/front/a/a/aaaa0000-0000-4000-8000-000000000001.jpg');
  });
  it("keeps the row's own printing when it names one, and a two-faced card's back", () => {
    const own = 'cccc0000-0000-4000-8000-000000000003';
    const c = cardFromList(list, 'Delver of Secrets', { id: own.toUpperCase(), set: 'MID', cn: '7' })!;
    expect([c.id, c.set, c.cn, c.ci]).toEqual([own, 'mid', '7', ['U']]);
    expect(c.back).toBe(smallPic(own, 'back'));
  });
  it('returns null for a card it does not know', () => expect(cardFromList(list, 'Not A Card')).toBeNull());
});

describe('saveCardList', () => {
  const setup = (body = cardListFile([sol]), type = 'application/json', ok = true) => {
    const store = new Map<string, string>();
    const cache = new Map<string, Response>();
    const got: string[] = [];
    const d: ListDeps = {
      open: async (n) => (expect(n).toBe(LIST_CACHE), { match: async (u: RequestInfo | URL) => cache.get(String(u)), put: async (u: RequestInfo | URL, r: Response) => void cache.set(String(u), r) }) as any,
      fetch: async (u) => (got.push(u), new Response(body, { status: ok ? 200 : 404, headers: { 'content-type': type } })),
      get: (k) => store.get(k) ?? null,
      set: (k, v) => void store.set(k, v),
      now: () => 1e12,
    };
    return { d, store, cache, got };
  };
  it('saves the list on a good connection, then not again for a week', async () => {
    const { d, cache, got } = setup();
    expect(await saveCardList(d)).toBe('saved');
    expect(cache.has(LIST_URL)).toBe(true);
    expect(await saveCardList(d)).toBe('fresh');
    expect(got).toHaveLength(1);
  });
  it('waits for Wi-Fi: not on mobile data, data saver or offline', async () => {
    const { d, got } = setup();
    expect(await saveCardList(d, { conn: { type: 'cellular' } })).toBe('later');
    expect(await saveCardList(d, { conn: { saveData: true } })).toBe('later');
    expect(await saveCardList(d, { online: false })).toBe('later');
    expect(got).toHaveLength(0);
  });
  it('keeps nothing when the site has no list (the page that answers instead is not kept)', async () => {
    const { d, cache } = setup('<html>', 'text/html');
    expect(await saveCardList(d)).toBe('missing');
    expect(cache.size).toBe(0);
  });
});

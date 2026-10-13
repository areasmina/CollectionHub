import { db, type Card, type Cheap } from './db';
import type { Row } from './importers';
import { norm } from './names';

const API = 'https://api.scryfall.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

// Scryfall allows /cards/collection twice a second. Browsers don't let pages set User-Agent;
// Scryfall accepts the browser's own one with an Accept header.
async function req(url: string, init: RequestInit, tries = 4): Promise<any> {
  const wait = last + 600 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  // A 429 comes without CORS headers, so the browser reports it as a network error: back off either way.
  const r = await fetch(url, { ...init, headers: { ...init.headers, Accept: 'application/json' } }).catch(() => null);
  if ((!r || r.status === 429) && tries > 1) return sleep(20000 * (5 - tries)).then(() => req(url, init, tries - 1));
  if (!r) throw new Error('Could not reach Scryfall (offline, or rate-limited: wait a minute)');
  if (r.status === 404) return { data: [] }; // search with no results
  if (!r.ok) throw new Error(`Scryfall answered ${r.status}`);
  return r.json();
}
const post = (path: string, body: unknown) => req(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

/** Cheapest paper printing (USD, non-foil first) per card name, cached a week. */
export async function cheapest(names: string[]): Promise<Map<string, Cheap>> {
  const keys = [...new Map(names.map((n) => [norm(n), n.split(/\s\/\/?\s/)[0]])).entries()];
  const out = new Map<string, Cheap>();
  (await db.cheap.bulkGet(keys.map(([k]) => k))).forEach((c) => c && Date.now() - c.at < WEEK && out.set(c.key, c));
  const need = keys.filter(([k]) => !out.has(k));
  for (let i = 0; i < need.length; i += 40) {
    const batch = need.slice(i, i + 40);
    const q = `(${batch.map(([, n]) => `!"${n.replace(/"/g, '')}"`).join(' or ')}) game:paper`;
    const best = new Map<string, Cheap>(batch.map(([k]) => [k, { key: k, at: Date.now() }]));
    let url: string | undefined = `${API}/cards/search?unique=prints&q=${encodeURIComponent(q)}`;
    while (url) {
      const page: any = await req(url, {});
      for (const c of page.data) {
        const price = c.prices?.usd ?? c.prices?.usd_foil;
        const b = best.get(norm(c.name));
        if (b && price && (!b.usd || Number(price) < Number(b.usd))) Object.assign(b, { usd: price, buy: c.purchase_uris?.tcgplayer });
      }
      url = page.has_more ? page.next_page : undefined;
    }
    await db.cheap.bulkPut([...best.values()]);
    best.forEach((v, k) => out.set(k, v));
  }
  return out;
}

/** Card with its price swapped for the cheapest printing's, when known. */
export const withCheapest = (c: Card | undefined, cheap: Map<string, Cheap>) => {
  const p = c && cheap.get(c.key);
  return c && p?.usd ? { ...c, usd: p.usd, buy: p.buy ?? c.buy, priceAt: p.at } : c;
};

export function toCard(c: any): Card {
  const face = c.card_faces?.[0];
  return {
    id: c.id,
    name: c.name,
    key: norm(c.name),
    type: c.type_line ?? face?.type_line ?? '',
    text: c.oracle_text ?? (c.card_faces ?? []).map((f: any) => f.oracle_text).join('\n'),
    ci: c.color_identity ?? [],
    img: c.image_uris?.small ?? face?.image_uris?.small,
    usd: c.prices?.usd ?? c.prices?.usd_foil ?? c.prices?.usd_etched ?? undefined,
    usdFoil: c.prices?.usd_foil ?? c.prices?.usd_etched ?? undefined,
    eur: c.prices?.eur ?? c.prices?.eur_foil ?? undefined,
    mana: c.mana_cost ?? (c.card_faces ?? []).map((f: any) => f.mana_cost).filter(Boolean).join(' // '),
    cmc: c.cmc,
    buy: c.purchase_uris?.tcgplayer,
    legal: c.legalities?.commander === 'legal',
    pv: 2,
    at: Date.now(),
  };
}

const WEEK = 7 * 864e5;

/** Card data (prices, images) by Scryfall id: cache first, prices refreshed weekly. */
export async function cardsByIds(ids: string[]): Promise<Map<string, Card>> {
  const uniq = [...new Set(ids)];
  const out = new Map<string, Card>();
  // pv 2 = has the foil price: older cache entries are fetched again once.
  (await db.cards.bulkGet(uniq)).forEach((c) => c && c.at && c.pv === 2 && Date.now() - c.at < WEEK && out.set(c.id, c));
  const need = uniq.filter((id) => !out.has(id));
  for (let i = 0; i < need.length; i += 75) {
    const res = await post('/cards/collection', { identifiers: need.slice(i, i + 75).map((id) => ({ id })) });
    const cards = res.data.map(toCard);
    await db.cards.bulkPut(cards);
    for (const c of cards) out.set(c.id, c);
  }
  return out;
}

type Ident = { id: string } | { name: string } | { set: string; collector_number: string };
const identKey = (i: any) => (i.id ? 'id:' + i.id : i.name ? 'n:' + norm(i.name) : `s:${i.set}|${i.collector_number}`.toLowerCase());
const cardKeys = (c: any) => ['id:' + c.id, 'n:' + norm(c.name), `s:${c.set}|${c.collector_number}`.toLowerCase()];
const identOf = (r: Row): Ident => (r.id ? { id: r.id } : r.set && r.cn ? { set: r.set, collector_number: r.cn } : { name: r.name });

/** Finds Scryfall data for each row (cache first, then /cards/collection in batches of 75). */
export async function resolveRows(rows: Row[], onProgress: (done: number, total: number) => void) {
  const found = new Map<string, Card>();
  const need: Ident[] = [];
  for (const r of rows) {
    const ident = identOf(r);
    const k = identKey(ident);
    if (found.has(k)) continue;
    // A row naming its printing (set + number) must get that printing, not whichever one of the name is cached.
    const hit = r.id ? await db.cards.get(r.id) : r.set && r.cn ? undefined : await db.cards.where('key').equals(norm(r.name)).first();
    if (hit) found.set(k, hit);
    else if (!need.some((n) => identKey(n) === k)) need.push(ident);
  }
  const fetchAll = async (idents: Ident[], base: number, total: number) => {
    const missed: Ident[] = [];
    for (let i = 0; i < idents.length; i += 75) {
      const batch = idents.slice(i, i + 75);
      const res = await post('/cards/collection', { identifiers: batch });
      const cards: Card[] = [];
      const byKey = new Map<string, Card>();
      for (const c of res.data) {
        const card = toCard(c);
        cards.push(card);
        for (const k of cardKeys(c)) byKey.set(k, card);
      }
      await db.cards.bulkPut(cards);
      for (const b of batch) {
        const card = byKey.get(identKey(b));
        if (card) found.set(identKey(b), card);
        else missed.push(b);
      }
      onProgress(base + Math.min(i + 75, idents.length), total);
    }
    return missed;
  };
  onProgress(0, need.length);
  const missed = await fetchAll(need, 0, need.length);
  // A set/number Scryfall doesn't know (e.g. a site-specific code): retry by name.
  const missedKeys = new Set(missed.filter((m) => 'set' in m).map(identKey));
  const retry = [...new Set(rows.filter((r) => missedKeys.has(identKey(identOf(r)))).map((r) => r.name))].map((name) => ({ name }));
  if (retry.length) await fetchAll(retry, 0, retry.length);

  const matched: { row: Row; card: Card }[] = [];
  const unmatched: Row[] = [];
  for (const r of rows) {
    const card = found.get(identKey(identOf(r))) ?? found.get(identKey({ name: r.name }));
    if (card) matched.push({ row: r, card });
    else unmatched.push(r);
  }
  return { matched, unmatched };
}

/** The official Commander Game Changers list (Scryfall's is:gamechanger), keyed by norm(name), cached a week. null when offline. */
let gcLoad: Promise<Set<string> | null> | null = null;
export function gameChangers(): Promise<Set<string> | null> {
  return (gcLoad ??= (async () => {
    const hit = await db.edhrec.get('scryfall:gamechangers');
    if (hit && Date.now() - hit.at < WEEK) return new Set(hit.data as string[]);
    try {
      const keys: string[] = [];
      let url: string | undefined = `${API}/cards/search?q=${encodeURIComponent('is:gamechanger')}`;
      while (url) {
        const page: any = await req(url, {}, 1);
        for (const c of page.data) keys.push(norm(c.name));
        url = page.has_more ? page.next_page : undefined;
      }
      if (!keys.length) throw new Error('empty');
      await db.edhrec.put({ path: 'scryfall:gamechangers', data: keys, at: Date.now() });
      return new Set(keys);
    } catch {
      gcLoad = null; // try again next time
      return hit ? new Set(hit.data as string[]) : null;
    }
  })());
}

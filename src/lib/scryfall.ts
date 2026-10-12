import { db, type Card } from './db';
import type { Row } from './importers';
import { norm } from './names';

const API = 'https://api.scryfall.com';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
let last = 0;

// Scryfall allows /cards/collection twice a second. Browsers don't let pages set User-Agent;
// Scryfall accepts the browser's own one with an Accept header.
async function post(path: string, body: unknown, tries = 4): Promise<any> {
  const wait = last + 600 - Date.now();
  if (wait > 0) await sleep(wait);
  last = Date.now();
  // A 429 comes without CORS headers, so the browser reports it as a network error: back off either way.
  const r = await fetch(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }).catch(
    () => null,
  );
  if ((!r || r.status === 429) && tries > 1) return sleep(20000 * (5 - tries)).then(() => post(path, body, tries - 1));
  if (!r) throw new Error('Could not reach Scryfall (offline, or rate-limited: wait a minute)');
  if (!r.ok) throw new Error(`Scryfall answered ${r.status}`);
  return r.json();
}

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
    usd: c.prices?.usd ?? c.prices?.usd_foil ?? undefined,
    legal: c.legalities?.commander === 'legal',
  };
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
    const hit = r.id ? await db.cards.get(r.id) : await db.cards.where('key').equals(norm(r.name)).first();
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

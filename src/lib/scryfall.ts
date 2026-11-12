import { db, type Card, type Cheap } from './db';
import type { Row } from './importers';
import { norm } from './names';
import { scryfallClient } from './scrynet';

const API = 'https://api.scryfall.com';
/** How patient an import is: with the waits in scrynet.ts this outlasts about four minutes of Scryfall refusing. */
const IMPORT_TRIES = 8;
const net = scryfallClient({ fetch: (url, init) => fetch(url, init), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), now: () => Date.now() });
const req = (url: string, init: RequestInit, tries = 2, onWait?: (ms: number) => void): Promise<any> => net.req(url, init, { tries, onWait });
const post = (path: string, body: unknown, tries = 2, onWait?: (ms: number) => void) =>
  req(API + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, tries, onWait);

/** Cheapest paper printing (USD, non-foil first) per card name, cached a week. */
export async function cheapest(names: string[], onProgress?: (cheap: Map<string, Cheap>) => void): Promise<Map<string, Cheap>> {
  const keys = [...new Map(names.map((n) => [norm(n), n.split(/\s\/\/?\s/)[0]])).entries()];
  if (!keys.length) return new Map();
  const out = new Map<string, Cheap>();
  (await db.cheap.bulkGet(keys.map(([k]) => k))).forEach((c) => c && Date.now() - c.at < WEEK && (c.id || !c.usd) && out.set(c.key, c)); // entries from before `id` are fetched again
  if (out.size) onProgress?.(new Map(out));
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
        if (b && price && (!b.usd || Number(price) < Number(b.usd))) Object.assign(b, { usd: price, buy: c.purchase_uris?.tcgplayer, id: c.id });
      }
      url = page.has_more ? page.next_page : undefined;
    }
    await db.cheap.bulkPut([...best.values()]);
    best.forEach((v, k) => out.set(k, v));
    onProgress?.(new Map(out));
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
    set: c.set ? String(c.set).toLowerCase() : undefined,
    cn: c.collector_number ? String(c.collector_number) : undefined,
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
const setCnCache = new Map<string, Card>();

/** Card data (prices, images) by Scryfall id: cache first, prices refreshed weekly. */
export async function cardsByIds(ids: string[], maxAge = WEEK, onProgress?: (cards: Map<string, Card>) => void): Promise<Map<string, Card>> {
  const uniq = [...new Set(ids)];
  if (!uniq.length) return new Map();
  const out = new Map<string, Card>();
  // pv 2 = has the foil price: older cache entries are fetched again once.
  (await db.cards.bulkGet(uniq)).forEach((c) => c && c.at && c.pv === 2 && Date.now() - c.at < maxAge && out.set(c.id, c));
  if (out.size) onProgress?.(new Map(out));
  const need = uniq.filter((id) => !out.has(id));
  for (let i = 0; i < need.length; i += 75) {
    const res = await post('/cards/collection', { identifiers: need.slice(i, i + 75).map((id) => ({ id })) });
    const cards = (res.data ?? []).map(toCard);
    await db.cards.bulkPut(cards);
    for (const c of cards) out.set(c.id, c);
    onProgress?.(new Map(out));
  }
  return out;
}

type Ident = { id: string } | { name: string } | { set: string; collector_number: string };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Scryfall /cards/collection rejects compound collector numbers (like PLST "CMM-123") or special promo symbols ("123★").
const SET_RE = /^(?!plst$|mb1$|cmb1$|cmb2$)[a-z0-9]{3,5}$/i;
const CN_RE = /^[0-9]{1,5}[a-z]?$/i;
const cleanName = (n: string) => n.split(/\s+\/\/?\s+/)[0].trim();
const identKey = (i: any) => (i.id ? 'id:' + i.id.toLowerCase() : i.name ? 'n:' + norm(i.name) : `s:${i.set}|${i.collector_number}`.toLowerCase());
const cardKeys = (c: any) => [
  'id:' + String(c.id).toLowerCase(),
  'n:' + norm(c.name),
  'n:' + norm(cleanName(c.name)),
  `s:${c.set}|${c.collector_number}`.toLowerCase(),
];
const identOf = (r: Row): Ident =>
  r.id && UUID_RE.test(r.id)
    ? { id: r.id.toLowerCase() }
    : r.set && r.cn && SET_RE.test(r.set) && CN_RE.test(r.cn)
      ? { set: r.set.toLowerCase(), collector_number: r.cn }
      : { name: cleanName(r.name) };

/** Finds Scryfall data for each row (bulk cache lookup first, then /cards/collection in batches of 75). */
export async function resolveRows(rows: Row[], onProgress: (done: number, total: number, waitMs?: number) => void) {
  const found = new Map<string, Card>();
  const need: Ident[] = [];
  const needSeen = new Set<string>();
  const nameOfIdent = new Map<string, string>();
  const wantIds = [...new Set(rows.filter((r) => r.id && UUID_RE.test(r.id)).map((r) => r.id!.toLowerCase()))];
  const wantKeys = [...new Set(rows.flatMap((r) => [norm(r.name), norm(cleanName(r.name))]))];
  const hasSetCn = rows.some((r) => !r.id && r.set && r.cn);
  const [byIdArr, byKeyArr, existingEntries] = await Promise.all([
    wantIds.length ? db.cards.bulkGet(wantIds) : Promise.resolve([]),
    wantKeys.length ? db.cards.where('key').anyOf(wantKeys).toArray() : Promise.resolve([]),
    hasSetCn ? db.entries.toArray() : Promise.resolve([]),
  ]);
  const cachedById = new Map<string, Card>();
  for (const c of byIdArr) if (c) cachedById.set(c.id.toLowerCase(), c);
  const cachedByKey = new Map<string, Card>();
  for (const c of byKeyArr) {
    cachedById.set(c.id.toLowerCase(), c);
    if (!cachedByKey.has(c.key)) cachedByKey.set(c.key, c);
    const front = norm(cleanName(c.name));
    if (!cachedByKey.has(front)) cachedByKey.set(front, c);
    if (c.set && c.cn) setCnCache.set(`s:${c.set}|${c.cn}`.toLowerCase(), c);
  }
  if (hasSetCn && existingEntries.length) {
    const entryIds = [...new Set(existingEntries.filter((e) => !cachedById.has(e.cardId.toLowerCase())).map((e) => e.cardId))];
    if (entryIds.length) {
      for (const c of await db.cards.bulkGet(entryIds)) {
        if (c) {
          cachedById.set(c.id.toLowerCase(), c);
          if (!cachedByKey.has(c.key)) cachedByKey.set(c.key, c);
          const front = norm(cleanName(c.name));
          if (!cachedByKey.has(front)) cachedByKey.set(front, c);
        }
      }
    }
    for (const e of existingEntries) {
      const card = cachedById.get(e.cardId.toLowerCase());
      if (card) {
        if (e.set && e.cn) setCnCache.set(`s:${e.set}|${e.cn}`.toLowerCase(), card);
        const en = norm(e.name);
        if (!cachedByKey.has(en)) cachedByKey.set(en, card);
      }
    }
  }

  for (const r of rows) {
    const ident = identOf(r);
    const k = identKey(ident);
    nameOfIdent.set(k, cleanName(r.name));
    if (found.has(k)) continue;
    // A row naming its printing (set + number) checks setCnCache first, then cachedByKey if already in the binder.
    const hit =
      'id' in ident
        ? cachedById.get(ident.id)
        : 'set' in ident
          ? (setCnCache.get(k) ?? cachedByKey.get(norm(r.name)) ?? cachedByKey.get(norm(cleanName(r.name))))
          : (cachedByKey.get(norm(r.name)) ?? cachedByKey.get(norm(cleanName(r.name))));
    if (hit) found.set(k, hit);
    else if (!needSeen.has(k)) {
      needSeen.add(k);
      need.push(ident);
    }
  }
  // If Scryfall stops answering completely, keep what came back and report the rest as not looked up.
  let down: string | undefined;
  const storeCards = async (data: any[], byKey: Map<string, Card>) => {
    const cards: Card[] = [];
    for (const c of data ?? []) {
      const card = toCard(c);
      cards.push(card);
      for (const k of cardKeys(c)) {
        byKey.set(k, card);
        if (k.startsWith('s:')) setCnCache.set(k, card);
      }
    }
    if (cards.length) await db.cards.bulkPut(cards);
  };
  const fetchAll = async (idents: Ident[], base: number, total: number) => {
    const missed: Ident[] = [];
    for (let i = 0; i < idents.length; i += 75) {
      const batch = idents.slice(i, i + 75);
      let lastErr = '';
      const done = base + i;
      const onWait = (ms: number) => onProgress(done, total, ms);
      let status: number | undefined;
      const ask = (identifiers: Ident[], tries: number) =>
        post('/cards/collection', { identifiers }, tries, onWait).catch((e: Error & { status?: number }) => ((lastErr = e.message), (status = e.status), null));
      // Two quick tries first.
      let res = await ask(batch, 2);
      if (res?.badBatch || (!res && status === undefined)) {
        // Rejected outright, or no answer at all. A batch Scryfall rejects (a bad collector number) can reach the browser
        // as a bare network error, so look the batch up by name, patiently: one bad row never costs 75 cards, and an
        // outage is waited out (minutes if needed) rather than ending the import.
        const byName = [...new Set(batch.map((b) => ('name' in b ? b.name : nameOfIdent.get(identKey(b)) ?? '')).filter(Boolean))].map((name) => ({ name }));
        const named = byName.length ? await ask(byName, IMPORT_TRIES) : null;
        // It was only an outage if the exact batch answers now: then keep the exact printings.
        const again = named && !res && batch.some((b) => !('name' in b)) ? await ask(batch, 1) : null;
        res = again && !again.badBatch ? again : named;
      } else if (!res) res = await ask(batch, IMPORT_TRIES); // refused for going too fast, or Scryfall is having trouble: wait it out
      if (!res) {
        down = lastErr || 'Could not reach Scryfall';
        break;
      }
      const byKey = new Map<string, Card>();
      await storeCards(res.data, byKey);
      for (const b of batch) {
        const k = identKey(b);
        const nm = 'name' in b ? b.name : nameOfIdent.get(k);
        const card = byKey.get(k) ?? (nm ? byKey.get('n:' + norm(nm)) : undefined);
        if (card) found.set(k, card);
        else missed.push(b);
      }
      onProgress(base + Math.min(i + 75, idents.length), total);
    }
    return missed;
  };
  onProgress(0, need.length);
  const missed = await fetchAll(need, 0, need.length);
  // A set/number Scryfall doesn't know (e.g. a site-specific code): retry by name.
  const missedKeys = new Set(missed.filter((m) => 'set' in m || 'id' in m).map(identKey));
  const retry = [...new Set(rows.filter((r) => missedKeys.has(identKey(identOf(r)))).map((r) => cleanName(r.name)))].map((name) => ({ name }));
  if (retry.length && !down) await fetchAll(retry, 0, retry.length);

  const matched: { row: Row; card: Card }[] = [];
  const unmatched: Row[] = [];
  const failed: Row[] = []; // never looked up: Scryfall didn't answer
  const asked = new Set(need.map(identKey));
  for (const r of rows) {
    const card =
      found.get(identKey(identOf(r))) ??
      found.get(identKey({ name: cleanName(r.name) })) ??
      found.get(identKey({ name: r.name }));
    if (card) matched.push({ row: r, card });
    else if (down && asked.has(identKey(identOf(r)))) failed.push(r);
    else unmatched.push(r);
  }
  // A name-only row (text, Moxfield or Archidekt import, CSV without ids) gets Scryfall's default printing, which can be
  // MTGO-only or not priced yet (Underground Sea -> Vintage Masters). Use the cheapest paper printing with a price instead.
  if (!down) {
    const named = (r: Row) => !r.id && !(r.set && r.cn);
    const unpriced = matched.filter((m) => named(m.row) && m.card.legal && !m.card.usd);
    if (unpriced.length && unpriced.length <= 40) {
      const cheap = await cheapest(unpriced.map((m) => m.card.name)).catch(() => new Map<string, Cheap>());
      const ids = [...new Set(unpriced.map((m) => cheap.get(m.card.key)?.id).filter((x): x is string => !!x))];
      const paper = ids.length ? await cardsByIds(ids).catch(() => new Map<string, Card>()) : new Map<string, Card>();
      for (const m of unpriced) {
        const p = paper.get(cheap.get(m.card.key)?.id ?? '');
        if (p) m.card = p;
      }
    }
  }
  return { matched, unmatched, failed, down };
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

/** Every paper printing of a card (Scryfall "unique=prints"), newest first: for picking the artwork you own. */
export async function printingsOf(name: string): Promise<(Card & { set: string; cn: string; setName: string })[]> {
  const q = encodeURIComponent(`!"${name}" game:paper`);
  const out: (Card & { set: string; cn: string; setName: string })[] = [];
  let url: string | null = `https://api.scryfall.com/cards/search?q=${q}&unique=prints&order=released`;
  for (let page = 0; url && page < 3; page++) {
    const r: any = await fetch(url).then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (!r) break;
    for (const c of r.data ?? []) out.push({ ...toCard(c), set: c.set ?? '', cn: c.collector_number ?? '', setName: c.set_name ?? (c.set ?? '').toUpperCase() });
    url = r.has_more ? r.next_page : null;
  }
  return out;
}

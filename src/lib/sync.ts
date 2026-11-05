import { createClient } from '@supabase/supabase-js';
import { db, type Deck, type Entry, type Profile } from './db';
import { resolveRows } from './scryfall';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
import { authReturn } from './authreturn';
import { clearDirty, quietly, setLastVersion } from './syncstate';
export { authReturn };

/** null when sync isn't configured; the app works fully without it. */
export const supabase = url && key
  ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

// Phones pause timers in the background: on return, refresh the token right away instead of waiting.
if (supabase && typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      supabase.auth.startAutoRefresh();
      supabase.auth.getSession();
    }
  });

/** The signed-in user from the saved session (works offline; a network hiccup doesn't look like a sign-out). */
export async function currentUser() {
  const { data } = await supabase!.auth.getSession();
  return data.session?.user ?? null;
}

/** Whether a sign-in provider (google, github) is switched on in Supabase (public settings endpoint). */
export async function providerEnabled(provider: string) {
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key! } });
    return !!(await r.json()).external?.[provider];
  } catch {
    return true; // can't tell: let Supabase answer
  }
}

export const signIn = (email: string) =>
  supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + location.pathname } });

async function userId() {
  const user = await currentUser();
  if (!user) throw new Error('Sign in first.');
  return user.id;
}

async function selectAll(table: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select('*').range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

async function insertAll(table: string, rows: object[]) {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase!.from(table).insert(rows.slice(i, i + 500));
    if (error) throw error;
  }
}

/** Why a sync would destroy data, or null when it's safe. Counts are card entries + decks. */
export function syncRisk(dir: 'push' | 'pull', local: number, cloud: number): string | null {
  if (dir === 'push' && local === 0 && cloud > 0) return 'This device has no cards or decks, so Push would erase the cloud copy. Pull first (nothing was changed).';
  if (dir === 'pull' && cloud === 0 && local > 0) return 'The cloud copy is empty, so Pull would erase this device. Push from this device first (nothing was changed).';
  return null;
}

const count = async (table: string, uid: string) => {
  const { count: n, error } = await supabase!.from(table).select('id', { count: 'exact', head: true }).eq('user_id', uid);
  if (error) throw error;
  return n ?? 0;
};
// Rows get increasing ids: everything at or below this id belongs to the previous push.
const maxId = async (table: string, uid: string) => {
  const { data, error } = await supabase!.from(table).select('id').eq('user_id', uid).order('id', { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0]?.id as number | undefined) ?? 0;
};
const dropRows = async (table: string, uid: string, op: 'lte' | 'gt', id: number) => {
  const { error } = await supabase!.from(table).delete().eq('user_id', uid)[op]('id', id);
  if (error) throw error;
};

// shortcut: whole snapshot per account, last push wins; upgrade to per-row merging if two devices edit offline at once.
export async function push() {
  const started = Date.now();
  const uid = await userId();
  const [profiles, entries, decks] = await Promise.all([db.profiles.toArray(), db.entries.toArray(), db.decks.toArray()]);
  const risk = syncRisk('push', entries.length + decks.length, (await count('cards', uid)) + (await count('decks', uid)));
  if (risk) throw new Error(risk);
  // New rows go in first; the old ones are removed only once everything arrived, so a failed push never empties the cloud.
  const old = { cards: await maxId('cards', uid), decks: await maxId('decks', uid) };
  // `extras` (swaps, shopping-list checks) and `added` need supabase/migrations/002_extras.sql; without it they stay on this device.
  const profileRows = profiles.map((p) => ({ user_id: uid, slot: p.id, name: p.name, extras: { swaps: p.swaps ?? {}, bought: p.bought ?? [], pins: p.pins ?? {} } }));
  let migrated = true;
  let { error } = await supabase!.from('profiles').upsert(profileRows);
  if (error?.code === 'PGRST204') {
    migrated = false;
    ({ error } = await supabase!.from('profiles').upsert(profileRows.map(({ extras: _, ...r }) => r)));
  }
  if (error) throw error;
  try {
  await insertAll(
    'cards',
    entries.map((e) => ({
      user_id: uid,
      slot: e.profile,
      card_id: e.cardId,
      name: e.name,
      qty: e.qty,
      set_code: e.set ?? null,
      collector_number: e.cn ?? null,
      foil: !!e.foil,
      ...(migrated && e.added ? { added: new Date(e.added).toISOString() } : {}),
    })),
  );
  // Deck note + tags need supabase/migrations/003_deck_extras.sql; without it they stay on this device.
  const deckRows = decks.map((d) => ({ user_id: uid, slot: d.profile, name: d.name, commander: d.commander ?? null, cards: d.cards, updated_at: new Date(d.updated).toISOString(), extras: { note: d.note ?? '', tags: d.tags ?? [] } }));
  try {
    await insertAll('decks', deckRows);
  } catch (e) {
    if ((e as { code?: string }).code !== 'PGRST204') throw e;
    migrated = false;
    await insertAll('decks', deckRows.map(({ extras: _, ...r }) => r));
  }
  } catch (e) {
    // Undo the half-finished push: the previous copy is still complete.
    await dropRows('cards', uid, 'gt', old.cards).catch(() => {});
    await dropRows('decks', uid, 'gt', old.decks).catch(() => {});
    throw e;
  }
  if (old.cards) await dropRows('cards', uid, 'lte', old.cards);
  if (old.decks) await dropRows('decks', uid, 'lte', old.decks);
  // Stamping the version last tells other devices the new copy is complete.
  const version = new Date().toISOString();
  const { error: stampErr } = await supabase!.from('profiles').update({ updated_at: version }).eq('user_id', uid);
  if (stampErr) throw stampErr;
  setLastVersion(Date.parse(version));
  clearDirty(started);
  return { cards: entries.length, decks: decks.length, migrated };
}

/** This device's binders and decks as they were before the last Pull. */
const BACKUP = 'backup:before-pull';
export const lastBackup = async () => (await db.edhrec.get(BACKUP))?.at ?? null;
export async function undoPull() {
  const b = (await db.edhrec.get(BACKUP))?.data as { profiles: Profile[]; entries: Entry[]; decks: Deck[] } | undefined;
  if (!b) throw new Error('No backup on this device.');
  await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
    await Promise.all([db.profiles.clear(), db.entries.clear(), db.decks.clear()]);
    await db.profiles.bulkAdd(b.profiles);
    await db.entries.bulkAdd(b.entries);
    await db.decks.bulkAdd(b.decks);
  });
  setLastVersion(null); // this device and the cloud now differ: automatic sync asks which to keep
  return { cards: b.entries.length, decks: b.decks.length };
}

export async function pull() {
  const started = Date.now();
  const uid = await userId();
  const version = await cloudVersion(uid);
  const [profiles, cards, decks] = await Promise.all([selectAll('profiles'), selectAll('cards'), selectAll('decks')]);
  const local = { profiles: await db.profiles.toArray(), entries: await db.entries.toArray(), decks: await db.decks.toArray() };
  const risk = syncRisk('pull', local.entries.length + local.decks.length, cards.length + decks.length);
  if (risk) throw new Error(risk);
  await db.edhrec.put({ path: BACKUP, data: local, at: Date.now() });
  await quietly(() => db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
    for (const p of profiles) {
      const local = await db.profiles.get(p.slot);
      // Without the extras column, keep this device's swaps and checks.
      await db.profiles.put({ id: p.slot, name: p.name, swaps: p.extras?.swaps ?? local?.swaps, bought: p.extras?.bought ?? local?.bought, pins: p.extras?.pins ?? local?.pins });
    }
    await db.entries.clear();
    await db.decks.clear();
    await db.entries.bulkAdd(
      cards.map((c) => ({ profile: c.slot, cardId: c.card_id, name: c.name, qty: c.qty, set: c.set_code ?? undefined, cn: c.collector_number ?? undefined, foil: c.foil, added: c.added ? Date.parse(c.added) : undefined })),
    );
    await db.decks.bulkAdd(decks.map((d) => ({ profile: d.slot, name: d.name, commander: d.commander ?? undefined, cards: d.cards, updated: Date.parse(d.updated_at), note: d.extras?.note || undefined, tags: d.extras?.tags?.length ? d.extras.tags : undefined })));
  }));
  setLastVersion(version);
  clearDirty(started);
  // Card details (type, colours, image) come from Scryfall's cache on this device.
  await resolveRows(cards.map((c) => ({ name: c.name, qty: 1, id: c.card_id })), () => {});
  return { cards: cards.length, decks: decks.length };
}

/** The cloud copy's version: when it was last pushed (ms), 0 when nothing was pushed yet. */
export async function cloudVersion(uid: string) {
  const { data, error } = await supabase!.from('profiles').select('updated_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(1);
  if (error) throw error;
  return data?.[0]?.updated_at ? Date.parse(data[0].updated_at) : 0;
}

/** Card and deck fingerprints, the same for this device and the cloud when they hold the same binders and decks. */
const deckKey = (slot: number, name: string, commander: string | null | undefined, cards: Deck['cards']) =>
  `${slot}|${name}|${commander ?? ''}|${cards.map((c) => `${c.name}:${c.qty}:${c.foil ? 1 : 0}`).join(',')}`;
const fingerprint = (cards: string[], decks: string[]) => [...cards].sort().join('\n') + '\n--\n' + [...decks].sort().join('\n');
export async function sameAsCloud() {
  const [cards, decks, entries, local] = await Promise.all([selectAll('cards'), selectAll('decks'), db.entries.toArray(), db.decks.toArray()]);
  const cloud = fingerprint(
    cards.map((c) => `${c.slot}|${c.card_id}|${c.qty}|${c.foil ? 1 : 0}`),
    decks.map((d) => deckKey(d.slot, d.name, d.commander, d.cards)),
  );
  const mine = fingerprint(
    entries.map((e) => `${e.profile}|${e.cardId}|${e.qty}|${e.foil ? 1 : 0}`),
    local.map((d) => deckKey(d.profile, d.name, d.commander, d.cards)),
  );
  return { same: cloud === mine, cloudCount: cards.length + decks.length, localCount: entries.length + local.length };
}

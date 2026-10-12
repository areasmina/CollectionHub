import { createClient } from '@supabase/supabase-js';
import { db } from './db';
import { resolveRows } from './scryfall';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};
// Read the sign-in return before Supabase consumes the URL: errors come back here and were silently dropped.
const ret = new URLSearchParams((typeof location !== 'undefined' && (location.hash.slice(1) || location.search.slice(1))) || '');
/** Set when the page was opened by a sign-in redirect: success (session in the URL) or Supabase's error text. */
export const authReturn: { error?: string; ok?: boolean } | null = ret.get('error_description') || ret.get('error')
  ? { error: safeDecode((ret.get('error_description') || ret.get('error') || '').replace(/\+/g, ' ')) }
  : ret.get('access_token') || ret.get('code')
    ? { ok: true }
    : null;
if (authReturn?.error && typeof history !== 'undefined') history.replaceState(null, '', location.pathname);

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

// shortcut: whole snapshot per account, last push wins; upgrade to per-row merging if two devices edit offline at once.
export async function push() {
  const uid = await userId();
  const [profiles, entries, decks] = await Promise.all([db.profiles.toArray(), db.entries.toArray(), db.decks.toArray()]);
  for (const t of ['cards', 'decks']) {
    const { error } = await supabase!.from(t).delete().eq('user_id', uid);
    if (error) throw error;
  }
  // `extras` (swaps, shopping-list checks) and `added` need supabase/migrations/002_extras.sql; without it they stay on this device.
  const profileRows = profiles.map((p) => ({ user_id: uid, slot: p.id, name: p.name, updated_at: new Date().toISOString(), extras: { swaps: p.swaps ?? {}, bought: p.bought ?? [] } }));
  let migrated = true;
  let { error } = await supabase!.from('profiles').upsert(profileRows);
  if (error?.code === 'PGRST204') {
    migrated = false;
    ({ error } = await supabase!.from('profiles').upsert(profileRows.map(({ extras: _, ...r }) => r)));
  }
  if (error) throw error;
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
  await insertAll('decks', decks.map((d) => ({ user_id: uid, slot: d.profile, name: d.name, commander: d.commander ?? null, cards: d.cards, updated_at: new Date(d.updated).toISOString() })));
  return { cards: entries.length, decks: decks.length, migrated };
}

export async function pull() {
  await userId();
  const [profiles, cards, decks] = await Promise.all([selectAll('profiles'), selectAll('cards'), selectAll('decks')]);
  await db.transaction('rw', db.profiles, db.entries, db.decks, async () => {
    for (const p of profiles) {
      const local = await db.profiles.get(p.slot);
      // Without the extras column, keep this device's swaps and checks.
      await db.profiles.put({ id: p.slot, name: p.name, swaps: p.extras?.swaps ?? local?.swaps, bought: p.extras?.bought ?? local?.bought });
    }
    await db.entries.clear();
    await db.decks.clear();
    await db.entries.bulkAdd(
      cards.map((c) => ({ profile: c.slot, cardId: c.card_id, name: c.name, qty: c.qty, set: c.set_code ?? undefined, cn: c.collector_number ?? undefined, foil: c.foil, added: c.added ? Date.parse(c.added) : undefined })),
    );
    await db.decks.bulkAdd(decks.map((d) => ({ profile: d.slot, name: d.name, commander: d.commander ?? undefined, cards: d.cards, updated: Date.parse(d.updated_at) })));
  });
  // Card details (type, colours, image) come from Scryfall's cache on this device.
  await resolveRows(cards.map((c) => ({ name: c.name, qty: 1, id: c.card_id })), () => {});
  return { cards: cards.length, decks: decks.length };
}

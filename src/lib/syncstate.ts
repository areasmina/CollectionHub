import { useSyncExternalStore } from 'react';
import { db } from './db';

/** Automatic sync's state, shared by the engine (lib/autosync) and the UI. Loads without Supabase. */
export type SyncStatus = 'off' | 'syncing' | 'synced' | 'conflict' | 'offline' | 'error';
export interface SyncState {
  status: SyncStatus;
  at: number; // last successful sync (ms)
  msg: string;
}
let state: SyncState = { status: 'off', at: 0, msg: '' };
const subs = new Set<() => void>();
export const setSyncState = (s: Partial<SyncState>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));
export const useSyncState = () => useSyncExternalStore(subscribe, () => state);

const store = {
  get: (k: string) => {
    try {
      return Number(localStorage.getItem(k) || 0);
    } catch {
      return 0;
    }
  },
  set: (k: string, v: number | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, String(v));
    } catch {
      /* private mode: sync still works, it just re-checks more */
    }
  },
};

// When this device last changed a binder or deck (0 = nothing unsynced).
const DIRTY = 'ch:sync:dirty';
// The cloud copy's version (a save counter on the sync server) this device last matched. 0 = never synced here.
const LAST = 'ch:code:last';
// The old sign-in sync's version (its profiles.updated_at, ms), only read when moving to a sync code.
const LEGACY_LAST = 'ch:sync:last';
const CODE = 'ch:sync:code';
export const dirtyAt = () => store.get(DIRTY);
export const clearDirty = (upTo: number) => dirtyAt() <= upTo && store.set(DIRTY, null);
export const lastVersion = () => store.get(LAST);
export const setLastVersion = (v: number | null) => store.set(LAST, v);
export const legacyLastVersion = () => store.get(LEGACY_LAST);
export const setLegacyLastVersion = (v: number | null) => store.set(LEGACY_LAST, v);

/** This device's sync code ('' = sync off). Kept in localStorage: it's the key to the cloud copy. */
export function syncCode() {
  try {
    return localStorage.getItem(CODE) || '';
  } catch {
    return '';
  }
}
export function setSyncCode(c: string | null) {
  try {
    if (c) localStorage.setItem(CODE, c);
    else localStorage.removeItem(CODE);
  } catch {
    /* private mode: sync can't stay on after a reload */
  }
}
/** Whether this device is still signed in to the old (Supabase) sync, read without loading Supabase. */
export function hasLegacySession() {
  try {
    return !!import.meta.env.VITE_SUPABASE_URL && Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k));
  } catch {
    return false;
  }
}

const changeSubs = new Set<() => void>();
export const onLocalChange = (f: () => void) => (changeSubs.add(f), () => void changeSubs.delete(f));

// Writes made by a pull are the cloud's own data, not changes to send back.
let quiet = 0;
export async function quietly<T>(f: () => Promise<T>) {
  quiet++;
  try {
    return await f();
  } finally {
    quiet--;
  }
}
const mark = () => {
  if (quiet) return;
  store.set(DIRTY, Date.now());
  changeSubs.forEach((f) => queueMicrotask(f));
};
for (const t of [db.entries, db.decks, db.profiles] as const) {
  t.hook('creating', mark);
  t.hook('updating', mark);
  t.hook('deleting', mark);
}

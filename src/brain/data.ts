import { useSyncExternalStore } from 'react';
import { norm } from '../lib/names';

/**
 * The brain's own data files, built by scripts/ from public sources and shipped with the app (public/brain/):
 * - roles.json: card roles from Scryfall Tagger (otag:), refreshed monthly;
 * - combos.json: two-card combos from Commander Spellbook (infinite or game-winning), refreshed monthly.
 * Loaded once, in the background; until then (or offline on a first visit) callers fall back to their own rules.
 */

export const ROLE_BITS = ['ramp', 'draw', 'removal', 'wipes', 'tutors', 'counters'] as const; // = TAGS order in build-roles.mjs
export type TagRole = (typeof ROLE_BITS)[number];

/** A two-card combo, with what the bracket rules need. */
export interface Combo {
  cards: [string, string];
  infinite: boolean;
  /** Wins the game or is "relevant" by Commander Spellbook's own bracket estimate (a produced feature with status S). */
  relevant: boolean;
  /** No notable prerequisite: definitely just these two cards. */
  definite: boolean;
  /** Mana value needed to assemble and run it (Spellbook's manaValueNeeded). */
  mv: number;
  id: string;
  /** Spellbook's own bracket tag, shown as information only. */
  tag: string;
  mustBeCommander: [boolean, boolean];
}

export interface BrainData {
  roles: Map<string, number> | null; // norm(name) -> role bits
  rolesAt?: string;
  combos: Map<string, Combo[]> | null; // norm(card) -> combos it's in
  combosAt?: string;
}

const state: BrainData = { roles: null, combos: null };
const listeners = new Set<() => void>();
let loading: Promise<BrainData> | null = null;

/** Parse roles.json (exported for tests). */
export function parseRoles(j: any): Map<string, number> | null {
  if (j?.v !== 1 || !j.cards) return null;
  return new Map(Object.entries(j.cards as Record<string, number>));
}

/** Parse combos.json into an index by card (exported for tests). */
export function parseCombos(j: any): Map<string, Combo[]> | null {
  if (j?.v !== 1 || !Array.isArray(j.rows)) return null;
  const by = new Map<string, Combo[]>();
  for (const [a, b, f, mv, id, tag] of j.rows as [string, string, number, number, string, string][]) {
    const c: Combo = { cards: [a, b], infinite: !!(f & 1), relevant: !!(f & 2), definite: !!(f & 4), mv, id, tag, mustBeCommander: [!!(f & 8), !!(f & 16)] };
    for (const n of [a, b]) {
      const k = norm(n);
      const list = by.get(k);
      if (list) list.push(c);
      else by.set(k, [c]);
    }
  }
  return by;
}

async function getJson(path: string) {
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const r = await fetch(`${base}brain/${path}`).catch(() => null);
  return r?.ok ? r.json().catch(() => null) : null;
}

/** Start loading (once); resolves with whatever could be loaded. */
export function loadBrainData(): Promise<BrainData> {
  if (typeof fetch === 'undefined') return Promise.resolve(state);
  return (loading ??= (async () => {
    const [r, c] = await Promise.all([getJson('roles.json'), getJson('combos.json')]);
    state.roles = parseRoles(r);
    state.rolesAt = r?.at;
    state.combos = parseCombos(c);
    state.combosAt = c?.at;
    if (!state.roles || !state.combos) loading = null; // try again next time (offline first visit)
    listeners.forEach((f) => f());
    return state;
  })());
}

/** What's loaded right now (never waits). */
export const brainData = (): BrainData => state;

/** Called when the data arrives, so a view can re-render. Returns an unsubscribe. */
export function onBrainData(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

let version = 0;
listeners.add(() => version++);
/** Re-renders the caller when the brain's data arrives (used once at the app's root, so every view re-reads it). */
export const useBrainData = () => useSyncExternalStore(onBrainData, () => version, () => version);

/** For tests: set the data directly. */
export function setBrainData(d: Partial<BrainData>) {
  Object.assign(state, d);
  listeners.forEach((f) => f());
}

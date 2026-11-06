/**
 * WILDCARD slots: the brain's hint of madness, kept honest. A wildcard is a random pick, but only among cards that
 * already earned a place by evidence (a hidden gem, a high-lift card nobody plays, a combo piece). The seed is saved
 * with the deck, so the same deck shows the same wildcards after a reload; "reroll" just moves to the next seed.
 * Off by default (0 slots) until the owner decides otherwise; the player turns on 1–3.
 */
export const WILDCARD_MAX = 3;
export const WILDCARD_DEFAULT = 0;

export interface Candidate {
  name: string;
  /** Why it qualifies, in words (shown on the WILDCARD tape). */
  why: string;
}

/** mulberry32: a tiny seeded random generator (public domain), so picks repeat for the same seed. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable seed for a deck (its commander + name) so a new deck starts with its own wildcards. */
export function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Picks n wildcards from qualified candidates, never one already in the deck. Same inputs + seed = same picks. */
export function pickWildcards(candidates: Candidate[], n: number, seed: number, inDeck: Set<string> = new Set()): Candidate[] {
  const pool = [...new Map(candidates.filter((c) => !inDeck.has(c.name)).map((c) => [c.name, c])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const r = rng(seed);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, Math.max(0, Math.min(n, WILDCARD_MAX)));
}

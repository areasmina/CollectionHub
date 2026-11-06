import { db } from '../lib/db';
import { norm } from '../lib/names';
import { addTaste, type TasteAction } from './taste';
import type { Aggression } from './win';
import { WILDCARD_DEFAULT, WILDCARD_MAX } from './wildcard';

/** Brain settings and habits on the profile (so they travel with the sync code). */
export async function brainSettings(profile: number) {
  const b = (await db.profiles.get(profile))?.brain ?? {};
  return { aggression: (b.aggression ?? 'hungry') as Aggression, wildcards: b.wildcards ?? WILDCARD_DEFAULT, taste: b.taste ?? [] };
}

async function patch(profile: number, f: (b: NonNullable<import('../lib/db').Profile['brain']>) => void) {
  const p = await db.profiles.get(profile);
  if (!p) return;
  const b = { ...(p.brain ?? {}) };
  f(b);
  await db.profiles.update(profile, { brain: b });
}

export const setAggression = (profile: number, a: Aggression) => patch(profile, (b) => void (b.aggression = a));
export const setWildcards = (profile: number, n: number) => patch(profile, (b) => void (b.wildcards = Math.max(0, Math.min(WILDCARD_MAX, Math.round(n)))));

/** One commander's WILDCARD: switched off, or rerolled (the seed moves on by one per reroll). */
export const setWild = (profile: number, commander: string, w: { off?: boolean; roll?: number }) =>
  patch(profile, (b) => void (b.wild = { ...(b.wild ?? {}), [norm(commander)]: { ...(b.wild?.[norm(commander)] ?? {}), ...w } }));

/** Remember one thing the player did (a swap in = add, a swap out = cut, pins = always / never). */
export const recordTaste = (profile: number, card: string, action: TasteAction, deck: string) =>
  patch(profile, (b) => void (b.taste = addTaste(b.taste ?? [], { card: norm(card), action, deck, at: Date.now() })));

/** Forget everything learned (the "reset my taste" button). */
export const resetTaste = (profile: number) => patch(profile, (b) => void (b.taste = []));

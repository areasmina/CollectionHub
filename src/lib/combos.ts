import { db } from './db';
import { norm } from './names';

/** A combo Commander Spellbook finds complete inside one deck. */
export interface Combo {
  cards: string[];
  result: string; // what it produces, e.g. "Infinite mana"
}

const API = 'https://backend.commanderspellbook.com/find-my-combos';
const WEEK = 7 * 864e5;

/** Combos from a find-my-combos answer: only the ones the deck already holds in full ("included"). */
export function parseCombos(j: any): Combo[] {
  const r = j?.results ?? j;
  const list: any[] = Array.isArray(r?.included) ? r.included : [];
  return list
    .map((v) => ({
      cards: (v.uses ?? []).map((u: any) => u?.card?.name ?? u?.card).filter((n: unknown): n is string => typeof n === 'string'),
      result: (v.produces ?? []).map((p: any) => p?.feature?.name ?? p?.name).filter(Boolean).slice(0, 2).join(', '),
    }))
    .filter((c) => c.cards.length >= 2);
}

/** Card keys (norm(name)) that are part of at least one combo, and the combos each is in. */
export function comboIndex(combos: Combo[]) {
  const by = new Map<string, Combo[]>();
  for (const c of combos) for (const n of c.cards) by.set(norm(n), [...(by.get(norm(n)) ?? []), c]);
  return by;
}

/** One-line note for a card's combos, e.g. "combo: Dramatic Reversal + Isochron Scepter → Infinite mana". */
export const comboNote = (name: string, combos: Combo[] = []) =>
  combos
    .slice(0, 2)
    .map((c) => `combo: ${c.cards.filter((n) => norm(n) !== norm(name)).join(' + ')}${c.result ? ` → ${c.result}` : ''}`)
    .join(' · ');

/** Combos complete in this list, from Commander Spellbook (cached a week per card list). Empty when unreachable. */
export async function deckCombos(commander: string | undefined, names: string[]): Promise<Combo[]> {
  const main = [...new Set(names)].filter((n) => !commander || norm(n) !== norm(commander)).sort();
  if (!main.length) return [];
  const path = `csb:${commander ? norm(commander) : ''}|${main.map(norm).join('|')}`;
  const hit = await db.edhrec.get(path);
  if (hit && Date.now() - hit.at < WEEK) return hit.data as Combo[];
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ commanders: commander ? [{ card: commander, quantity: 1 }] : [], main: main.map((card) => ({ card, quantity: 1 })) }),
    });
    if (!r.ok) throw new Error(String(r.status));
    const combos = parseCombos(await r.json());
    await db.edhrec.put({ path, data: combos, at: Date.now() });
    return combos;
  } catch {
    return hit ? (hit.data as Combo[]) : [];
  }
}

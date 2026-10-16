import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Deck, type Entry, type Printing } from './db';
import { norm } from './names';
import { baseCard } from './scryfall';

/** Which finish a copy ends up in when moved to a printing: keep foil / non-foil when the printing has it, else the one it has. */
export function finishFor(wantFoil: boolean | undefined, finishes: string[]): boolean {
  if (!finishes.length) return !!wantFoil; // unknown: leave it
  const hasFoil = finishes.includes('foil') || finishes.includes('etched');
  const hasPlain = finishes.includes('nonfoil');
  return wantFoil ? hasFoil || !hasPlain : !hasPlain && hasFoil;
}

type Chosen = Pick<Printing, 'id' | 'set' | 'cn' | 'finishes'>;

/** Moving a binder entry to another printing: either it changes in place, or it joins the entry you already have of
 *  that printing and finish (quantities add up) and disappears. */
export function planEntryPrinting(entries: Entry[], e: Entry, p: Chosen) {
  const foil = finishFor(e.foil, p.finishes);
  const twin = entries.find((x) => x.id !== e.id && x.profile === e.profile && x.cardId === p.id && !!x.foil === foil);
  return twin
    ? { merge: { id: twin.id!, qty: Math.min(999, twin.qty + e.qty) }, remove: e.id! }
    : { update: { cardId: p.id, set: p.set, cn: p.cn, foil } };
}

/** Binder: this copy is now exactly this printing (set, number, art, price). */
export async function setEntryPrinting(e: Entry, p: Printing) {
  await db.transaction('rw', db.entries, db.cards, async () => {
    await db.cards.put(baseCard(p));
    const now = (await db.entries.get(e.id!)) ?? e; // the copy may have been edited while the picker was open
    const plan = planEntryPrinting(await db.entries.where('profile').equals(e.profile).toArray(), now, p);
    if (plan.merge) {
      await db.entries.update(plan.merge.id, { qty: plan.merge.qty });
      await db.entries.delete(plan.remove);
    } else await db.entries.update(e.id!, plan.update);
  });
}

/** Moving ONE copy of a binder entry to the other finish: it flips in place, or joins the entry you already have of
 *  that finish (quantities add up), leaving the rest of the copies where they were. */
export function planFlip(entries: Entry[], e: Entry) {
  const to = !e.foil;
  const twin = entries.find((x) => x.id !== e.id && x.profile === e.profile && x.cardId === e.cardId && !!x.foil === to);
  const into = twin && { id: twin.id!, qty: Math.min(999, twin.qty + 1) };
  if (e.qty <= 1) return twin ? { addTo: into, remove: e.id! } : { update: { id: e.id!, foil: to } };
  const left = { id: e.id!, qty: e.qty - 1 };
  if (twin) return { setQty: left, addTo: into };
  const { id: _id, ...rest } = e;
  return { setQty: left, create: { ...rest, qty: 1, foil: to } as Entry };
}
export async function flipEntryCopy(e: Entry) {
  await db.transaction('rw', db.entries, async () => {
    const now = (await db.entries.get(e.id!)) ?? e;
    const plan = planFlip(await db.entries.where('profile').equals(now.profile).toArray(), now);
    if ('update' in plan && plan.update) await db.entries.update(plan.update.id, { foil: plan.update.foil });
    if ('setQty' in plan && plan.setQty) await db.entries.update(plan.setQty.id, { qty: plan.setQty.qty });
    if ('addTo' in plan && plan.addTo) await db.entries.update(plan.addTo.id, { qty: plan.addTo.qty });
    if ('create' in plan && plan.create) await db.entries.add(plan.create);
    if ('remove' in plan && plan.remove !== undefined) await db.entries.delete(plan.remove);
  });
}

/** Deck: this card uses this printing (null: back to the default, the cheapest printing). */
export async function setDeckPrinting(deck: Deck, name: string, p: Printing | null) {
  await db.transaction('rw', db.decks, db.printings, async () => {
    if (p) await db.printings.put(p);
    await db.decks.update(deck.id!, { cards: deck.cards.map((c) => (c.name === name ? { ...c, printing: p?.id } : c)), updated: Date.now() });
  });
}

// Discover has no saved deck to hold a choice, so the art you pick for a card name is remembered on this device.
const ART = 'art:';
export async function setArt(name: string, p: Printing | null) {
  await db.transaction('rw', db.edhrec, db.printings, async () => {
    if (!p) return void (await db.edhrec.delete(ART + norm(name)));
    await db.printings.put(p);
    await db.edhrec.put({ path: ART + norm(name), data: p.id, at: Date.now() });
  });
}
/** Art picked on Discover: card key → printing. */
export function useArt(): Map<string, Printing> {
  return (
    useLiveQuery(async () => {
      const rows = await db.edhrec.where('path').startsWith(ART).toArray();
      const ps = await db.printings.bulkGet(rows.map((r) => r.data as string));
      return new Map(rows.flatMap((r, i) => (ps[i] ? [[r.path.slice(ART.length), ps[i]!] as const] : [])));
    }, []) ?? new Map<string, Printing>()
  );
}

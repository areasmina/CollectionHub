export interface SubCard {
  name: string;
  category?: string; // EDHREC list the card sits in on the commander page
  type?: string; // Scryfall type line
  cmc?: number;
  synergy?: number;
  incl?: number; // inclusion 0–1
}

const TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
export const mainType = (type = '') => TYPES.find((t) => type.includes(t)) ?? '';

/** Owned stand-ins for a missing card: same EDHREC category first, then card type, close mana value, then synergy/inclusion. */
export function rankSubs(missing: SubCard, candidates: SubCard[], n = 3): SubCard[] {
  const score = (c: SubCard) =>
    (missing.category && c.category === missing.category ? 4 : 0) +
    (mainType(missing.type) && mainType(c.type) === mainType(missing.type) ? 2 : 0) +
    (missing.cmc != null && c.cmc != null ? Math.max(0, 2 - Math.abs(missing.cmc - c.cmc)) * 0.5 : 0) +
    (c.synergy ?? 0) +
    (c.incl ?? 0);
  // Never offer a land for a spell or a spell for a land.
  const isLand = (c: SubCard) => mainType(c.type) === 'Land';
  return candidates
    .filter((c) => c.name !== missing.name && (!missing.type || !c.type || isLand(c) === isLand(missing)))
    .map((c) => ({ c, s: score(c) }))
    .sort((a, b) => b.s - a.s || a.c.name.localeCompare(b.c.name))
    .slice(0, n)
    .map((x) => x.c);
}

const pctOf = (n: number) => `${Math.round(n * 100)}%`;

/** Why a card is in the deck: its EDHREC role, how many decks run it, synergy. */
export function whyIn(c: SubCard): string[] {
  const out: string[] = [];
  if (c.category) out.push(`Role: ${c.category}`);
  if (c.incl) out.push(`In ${pctOf(c.incl)} of decks`);
  if (c.synergy && c.synergy >= 0.05) out.push(`+${pctOf(c.synergy)} synergy`);
  return out;
}

/** Short tags saying why an owned card was suggested for a missing one (same reasons rankSubs scores on). */
export function reasonsFor(missing: SubCard, sub: SubCard, owned = 0): string[] {
  const out: string[] = [];
  if (missing.category && sub.category === missing.category) out.push(`Same role: ${sub.category}`);
  const t = mainType(sub.type);
  if (t && t === mainType(missing.type)) out.push(`${t} like it`);
  if (sub.cmc != null && missing.cmc != null) out.push(sub.cmc === missing.cmc ? `Same mana value (${sub.cmc})` : `Mana value ${sub.cmc} (vs ${missing.cmc})`);
  if (sub.synergy && sub.synergy >= 0.05) out.push(`+${pctOf(sub.synergy)} synergy`);
  if (sub.incl) out.push(`In ${pctOf(sub.incl)} of decks`);
  if (owned) out.push(`You own ×${owned}`);
  return out;
}

// Highlight lists aren't a role (Top Cards, High Lift…): a card's category is its type list (Creatures, Mana Artifacts…).
const META = /^(new cards|top cards|high synergy|high lift|game changers)/i;
/** What EDHREC says about each recommended card (key = norm(name)): its role list, how many decks play it, synergy. */
export function recInfoOf(
  lists: { header: string; cards: { name: string; synergy?: number; decks?: number; potential?: number }[] }[],
  key: (name: string) => string,
  cardOf: (c: { name: string }) => { type?: string; cmc?: number } | undefined,
): Map<string, SubCard> {
  const out = new Map<string, SubCard>();
  for (const l of lists)
    for (const c of l.cards) {
      const prev = out.get(key(c.name));
      const meta = META.test(l.header);
      if (prev && (prev.category || meta)) continue;
      const sc = cardOf(c);
      out.set(key(c.name), { name: c.name, category: meta ? undefined : l.header, type: sc?.type, cmc: sc?.cmc, synergy: c.synergy, incl: c.potential ? (c.decks ?? 0) / c.potential : undefined });
    }
  return out;
}

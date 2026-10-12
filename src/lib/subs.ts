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

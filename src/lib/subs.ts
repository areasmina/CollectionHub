export interface SubCard {
  name: string;
  category?: string; // EDHREC list the card sits in on the commander page
  type?: string; // Scryfall type line
  cmc?: number;
  synergy?: number; // EDHREC's old signal (pages fetched before Oct 1, 2026)
  lift?: number; // EDHREC's signal since Oct 1, 2026: how much more decks of this commander play the card (1 = no more than usual)
  incl?: number; // inclusion 0–1
}

/**
 * How strongly EDHREC ties a card to this commander, on the old synergy scale (about -1 to 1) so the weights below keep
 * their meaning: lift 2x = 0.5, 4x = 1, 1x = 0, 0.5x = -0.5. Falls back to synergy for pages cached before lift existed.
 */
export function edhSignal(c: SubCard): number {
  if (c.lift != null && c.lift > 0) return Math.max(-1, Math.min(1, Math.log2(c.lift) / 2));
  return c.synergy ?? 0;
}

/** "2.4x lift" for a card clearly played more with this commander (lift 1.25+), or "+12% synergy" on old pages. */
function signalTag(c: SubCard): string | undefined {
  if (c.lift != null) return c.lift >= 1.25 ? `${c.lift.toFixed(1)}x lift` : undefined;
  return c.synergy && c.synergy >= 0.05 ? `+${pctOf(c.synergy)} synergy` : undefined;
}

const TYPES = ['Land', 'Creature', 'Planeswalker', 'Battle', 'Instant', 'Sorcery', 'Artifact', 'Enchantment'];
export const mainType = (type = '') => TYPES.find((t) => type.includes(t)) ?? '';

/** Owned stand-ins for a missing card: same EDHREC category first, then card type, close mana value, then lift/inclusion. */
export function rankSubs(missing: SubCard, candidates: SubCard[], n = 3): SubCard[] {
  const score = (c: SubCard) =>
    (missing.category && c.category === missing.category ? 4 : 0) +
    (mainType(missing.type) && mainType(c.type) === mainType(missing.type) ? 2 : 0) +
    (missing.cmc != null && c.cmc != null ? Math.max(0, 2 - Math.abs(missing.cmc - c.cmc)) * 0.5 : 0) +
    edhSignal(c) +
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

/** Why a card is in the deck: its EDHREC role, how many decks run it, lift. */
export function whyIn(c: SubCard): string[] {
  const out: string[] = [];
  if (c.category) out.push(`Role: ${c.category}`);
  if (c.incl) out.push(`In ${pctOf(c.incl)} of decks`);
  const sig = signalTag(c);
  if (sig) out.push(sig);
  return out;
}

/** Short tags saying why an owned card was suggested for a missing one (same reasons rankSubs scores on). */
export function reasonsFor(missing: SubCard, sub: SubCard, owned = 0): string[] {
  const out: string[] = [];
  if (missing.category && sub.category === missing.category) out.push(`Same role: ${sub.category}`);
  const t = mainType(sub.type);
  if (t && t === mainType(missing.type)) out.push(`${t} like it`);
  if (sub.cmc != null && missing.cmc != null) out.push(sub.cmc === missing.cmc ? `Same mana value (${sub.cmc})` : `Mana value ${sub.cmc} (vs ${missing.cmc})`);
  const sig = signalTag(sub);
  if (sig) out.push(sig);
  if (sub.incl) out.push(`In ${pctOf(sub.incl)} of decks`);
  if (owned) out.push(`You own ×${owned}`);
  return out;
}

// Highlight lists aren't a role (Top Cards, High Lift…): a card's category is its type list (Creatures, Mana Artifacts…).
const META = /^(new cards|top cards|high synergy|high lift|game changers)/i;
/** What EDHREC says about each recommended card (key = norm(name)): its role list, how many decks play it, lift. */
export function recInfoOf(
  lists: { header: string; cards: { name: string; synergy?: number; lift?: number; decks?: number; potential?: number }[] }[],
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
      out.set(key(c.name), { name: c.name, category: meta ? undefined : l.header, type: sc?.type, cmc: sc?.cmc, synergy: c.synergy, lift: c.lift, incl: c.potential ? (c.decks ?? 0) / c.potential : undefined });
    }
  return out;
}

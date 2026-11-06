import type { Card } from '../lib/db';
import { BASICS } from '../lib/compare';
import { isLand } from '../lib/deckstats';
import type { SubCard } from '../lib/subs';

/**
 * Swap and suggestion candidates: the owned cards EDHREC lists for this commander (with their inclusion and lift)
 * PLUS every other owned, legal card inside the commander's colour identity (veteran playtest round 2, C2: Mind Stone
 * and Talisman of Dominance never came up for Mox Amber because EDHREC doesn't list them for Kinnan). Unlisted cards
 * carry no EDHREC numbers, so they win only on what they do (shared roles, combos, the deck's needs).
 */
export function binderCandidates(listed: SubCard[], binder: Pick<Card, 'name' | 'key' | 'type' | 'cmc' | 'ci' | 'legal'>[], identity: string[], never: Set<string> = new Set()): SubCard[] {
  const seen = new Set(listed.map((c) => c.name));
  const inColours = (ci: string[]) => ci.every((x) => identity.includes(x));
  const extra: SubCard[] = binder
    .filter((c) => c.legal && !seen.has(c.name) && !never.has(c.key) && !BASICS.has(c.key) && inColours(c.ci ?? []))
    .map((c) => ({ name: c.name, type: c.type, cmc: c.cmc, category: isLand(c.type) ? 'Lands' : undefined }));
  return [...listed, ...extra];
}

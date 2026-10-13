import type { Card } from './db';

/** Can be a commander: a legendary creature, or a card whose text says it can be your commander. */
export const canLead = (c?: Pick<Card, 'type' | 'text'>) => !!c && ((/\bLegendary\b/.test(c.type) && /\bCreature\b/.test(c.type.split(' // ')[0])) || /can be your commander/i.test(c.text));

/**
 * The deck's commander when the list doesn't say so under a "Commander" heading:
 * 1. a lone card at the start or end of the list (export layout) that can be a commander;
 * 2. else the only card that can be a commander whose colour identity covers every other card's.
 */
export function guessCommander(cards: { name: string; card?: Pick<Card, 'type' | 'text' | 'ci'>; edge?: boolean }[]): string | undefined {
  const edge = cards.filter((c) => c.edge && canLead(c.card));
  if (edge.length === 1) return edge[0].name;
  const colours = new Set(cards.flatMap((c) => c.card?.ci ?? []));
  const fits = cards.filter((c) => canLead(c.card) && [...colours].every((x) => c.card!.ci.includes(x)));
  return fits.length === 1 ? fits[0].name : undefined;
}

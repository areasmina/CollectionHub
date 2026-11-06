import type { Card } from './db';
import { norm, slug } from './names';

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

/**
 * How a commander may share the command zone (comprehensive rules 702.124, Partner variants, Choose a Background,
 * Doctor's companion). Read from the Oracle text's own lines, so reminder text doesn't matter.
 */
export type PairRule =
  | { kind: 'partner' }
  | { kind: 'with'; name: string }
  | { kind: 'variant'; group: string } // Partner—Survivors, Partner—Father & son, Partner—Character select…
  | { kind: 'friends' }
  | { kind: 'chooseBackground' }
  | { kind: 'background' }
  | { kind: 'companion' } // Doctor's companion
  | { kind: 'doctor' };

export function pairRules(c?: Pick<Card, 'type' | 'text'>): PairRule[] {
  if (!c) return [];
  const out: PairRule[] = [];
  for (const raw of (c.text ?? '').split('\n')) {
    const line = raw.replace(/\s*\([^)]*\)\s*$/, '').trim();
    let m: RegExpExecArray | null;
    if (/^partner$/i.test(line)) out.push({ kind: 'partner' });
    else if ((m = /^partner with (.+)$/i.exec(line))) out.push({ kind: 'with', name: m[1].trim() });
    else if ((m = /^partner\s*[—–-]\s*(.+)$/i.exec(line))) out.push({ kind: 'variant', group: m[1].trim().toLowerCase() });
    else if (/^friends forever$/i.test(line)) out.push({ kind: 'friends' });
    else if (/^choose a background$/i.test(line)) out.push({ kind: 'chooseBackground' });
    else if (/^doctor's companion$/i.test(line)) out.push({ kind: 'companion' });
  }
  const front = (c.type ?? '').split(' // ')[0];
  if (/\bLegendary\b/.test(front) && /\bBackground\b/.test(front)) out.push({ kind: 'background' });
  if (/\bLegendary\b/.test(front) && /\bCreature\b/.test(front) && /\bTime Lord Doctor\b/.test(front)) out.push({ kind: 'doctor' });
  return out;
}

type Named = { name: string; card?: Pick<Card, 'type' | 'text'> };
/** Whether two cards can be commanders together. */
export function canPair(a: Named, b: Named): boolean {
  if (norm(a.name) === norm(b.name)) return false;
  const ra = pairRules(a.card);
  const rb = pairRules(b.card);
  const has = (rs: PairRule[], k: PairRule['kind']) => rs.some((r) => r.kind === k);
  if (has(ra, 'partner') && has(rb, 'partner')) return true;
  if (ra.some((r) => r.kind === 'with' && norm(r.name) === norm(b.name)) && rb.some((r) => r.kind === 'with' && norm(r.name) === norm(a.name))) return true;
  if (ra.some((r) => r.kind === 'variant' && rb.some((q) => q.kind === 'variant' && q.group === r.group))) return true;
  if (has(ra, 'friends') && has(rb, 'friends')) return true;
  if ((has(ra, 'chooseBackground') && has(rb, 'background')) || (has(rb, 'chooseBackground') && has(ra, 'background'))) return true;
  if ((has(ra, 'companion') && has(rb, 'doctor')) || (has(rb, 'companion') && has(ra, 'doctor'))) return true;
  return false;
}

/** A pair's colour identity: the union of both, in WUBRG order. */
export const pairIdentity = (...ci: (string[] | undefined)[]) => ['W', 'U', 'B', 'R', 'G'].filter((x) => ci.some((c) => c?.includes(x)));

/** EDHREC's page slug for one commander or a pair: the two slugs in alphabetical order, joined by "-" (the other
 *  order only answers with a redirect). Verified Nov 6 2026: thrasios-triton-hero-tymna-the-weaver. */
export const commanderSlug = (a: string, b?: string) => (b ? [slug(a), slug(b)].sort().join('-') : slug(a));

/**
 * The deck's commander(s) when the list doesn't say: like guessCommander, but also finds a legal pair
 * (Thrasios + Tymna, a commander + its Background). Returns [] when it can't tell.
 */
export function guessCommanders(cards: (Named & { card?: Pick<Card, 'type' | 'text' | 'ci'>; edge?: boolean })[]): string[] {
  const edge = cards.filter((c) => c.edge && (canLead(c.card) || pairRules(c.card).some((r) => r.kind === 'background')));
  if (edge.length === 2 && canPair(edge[0], edge[1])) return edge.map((c) => c.name);
  const one = guessCommander(cards);
  if (one) return [one];
  // A pair whose joint colours cover the deck, when exactly one such pair exists.
  const colours = new Set(cards.flatMap((c) => c.card?.ci ?? []));
  const leads = cards.filter((c) => pairRules(c.card).length);
  const fits: string[][] = [];
  for (let i = 0; i < leads.length; i++)
    for (let j = i + 1; j < leads.length; j++) {
      const ci = pairIdentity(leads[i].card?.ci, leads[j].card?.ci);
      if (canPair(leads[i], leads[j]) && [...colours].every((x) => ci.includes(x))) fits.push([leads[i].name, leads[j].name]);
    }
  return fits.length === 1 ? fits[0] : [];
}

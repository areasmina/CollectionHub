import type { Card } from '../lib/db';
import { roleOf, type Role } from '../lib/deckstats';
import type { Part } from './score';

/**
 * How good a card is at its job (guided builder, step 0): stated rules read from the card's own text, type and mana
 * value, for when there is no EDHREC play rate to tell two ramp cards apart. Each rule is one small named part, so the
 * card says why ("cheap ramp: 2 mana", "instant speed"). Used only by the "own evidence" score (DeckContext.evidence
 * = 'own'); the Forge's OUR PICK order does not use these.
 *
 * Common deck-building wisdom, written as rules (Deck Wizard keeps cheap ramp, instant-speed answers and one-sided
 * sweepers too): cheaper ramp comes online sooner, a rock that makes any colour fixes the mana, removal that answers
 * any permanent at instant speed is worth more than one that only hits creatures on your turn, draw that repeats
 * beats a single burst, and a sweeper that spares your own board is better than one that doesn't.
 */
export const Q = {
  cheapRamp: 0.08, // ramp at 2 mana or less
  okRamp: 0.03, // ramp at 3 mana
  slowRamp: -0.05, // ramp at 5 mana or more
  fixing: 0.04, // makes mana of any colour
  tapped: -0.02, // the mana arrives tapped
  repeatDraw: 0.04, // draws again and again (a permanent that keeps drawing); kept small: at 0.06 it crowded the list (bench)
  bigDraw: 0.03, // draws two or more at once
  slowDraw: -0.03, // draw at 6 mana or more
  instant: 0.05, // removal you can cast on someone else's turn
  flexible: 0.05, // removal that hits any permanent (or any target), not only creatures
  cheapRemoval: 0.05, // removal at 2 mana or less
  oneSided: 0.08, // a board wipe that spares your own board
  cheapWipe: 0.03, // a board wipe at 4 mana or less
} as const;

type Meta = Pick<Card, 'type' | 'text' | 'cmc'> & { name?: string };

const fast = (c: Meta) => /\bInstant\b/.test(c.type) || /\bflash\b/i.test(c.text ?? '');
const permanent = (c: Meta) => !/\b(Instant|Sorcery)\b/.test(c.type.split(' // ')[0]);
const noReminder = (t = '') => t.replace(/\([^)]*\)/g, '');

/** The job-quality parts for one card, for the roles it has (pass `roles` to reuse a roleOf already computed). */
export function jobQuality(c: Meta, roles: Role[] = roleOf(c)): Part[] {
  const parts: Part[] = [];
  const text = noReminder(c.text);
  const mv = c.cmc ?? 0;
  const src = 'card text' as const;

  if (roles.includes('ramp')) {
    if (mv <= 2) parts.push({ label: `cheap ramp: ${mv} mana`, value: Q.cheapRamp, source: src });
    else if (mv === 3) parts.push({ label: 'ramp at 3 mana', value: Q.okRamp, source: src });
    else if (mv >= 5) parts.push({ label: `slow ramp: ${mv} mana`, value: Q.slowRamp, source: src });
    if (/mana of any (one )?colou?r|any colou?r of mana|add one mana of any/i.test(text)) parts.push({ label: 'fixes colours', value: Q.fixing, source: src });
    if (/onto the battlefield tapped/i.test(text)) parts.push({ label: 'its land enters tapped', value: Q.tapped, source: src });
  }

  if (roles.includes('draw')) {
    // "you draw" as the effect, after a trigger or a cost: "Whenever a creature dies, draw a card", "{1}, {T}: Draw a card".
    // "Whenever you draw a card, …" or "whenever an opponent draws" is a payoff, not more cards.
    const repeats = permanent(c) && /\b(whenever|at the beginning of)\b[^.]*?, (you may )?draw (a|an|two|three|x|that many) cards?/i.test(text);
    const activated = permanent(c) && /:[^.:]*\bdraw (a|an|two|three|x) cards?/i.test(text);
    if (repeats || activated) parts.push({ label: 'keeps drawing', value: Q.repeatDraw, source: src });
    else if (/\bdraws? (two|three|four|five|seven|x) cards|draw cards equal/i.test(text)) parts.push({ label: 'draws several at once', value: Q.bigDraw, source: src });
    if (mv >= 6) parts.push({ label: `slow draw: ${mv} mana`, value: Q.slowDraw, source: src });
  }

  if (roles.includes('removal')) {
    if (fast(c)) parts.push({ label: 'instant speed', value: Q.instant, source: src });
    if (/target (nonland )?permanent|any target|counter target spell|target (artifact|enchantment|creature|planeswalker)( or |, )(artifact|enchantment|creature|planeswalker)/i.test(text))
      parts.push({ label: 'answers more than creatures', value: Q.flexible, source: src });
    if (mv <= 2) parts.push({ label: `cheap answer: ${mv} mana`, value: Q.cheapRemoval, source: src });
  }

  if (roles.includes('wipes')) {
    if (/you don't control|your opponents control|each opponent|creatures your opponents|nontoken creatures you don't|other than you/i.test(text)) parts.push({ label: 'spares your board', value: Q.oneSided, source: src });
    if (mv <= 4) parts.push({ label: `wipe at ${mv} mana`, value: Q.cheapWipe, source: src });
  }

  return parts;
}

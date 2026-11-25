import type { DeckStats, Role } from './deckstats';

/**
 * Deck compare (Nov 24, step 1 of the deck-analysis plan): two of your decks side by side, each difference said in
 * words ("Kinnan runs 3 fewer lands than Tatyova"). Built only from numbers the app already works out elsewhere
 * (`deckStats`, `bracketOf`, the My Decks ownership share and the deck price), so compare can never disagree with
 * the deck page or the deck tile. It is a read: nothing here is saved.
 */

export interface CompareDeck {
  name: string;
  stats: DeckStats;
  /** Bracket estimate from `bracketOf` (0 = empty deck, never 5). */
  bracket: number;
  /** The My Decks tile's ownership share (`deckShares`: each copy you own counts for one deck). */
  ownedPct: number;
  /** Cards that share leaves missing (to buy). */
  missing: number;
  /** Whole-deck price in CA$ (cheapest printing), when prices are loaded. */
  price?: number;
}

export type RowKey = 'cards' | 'lands' | 'avgMv' | Role | 'owned' | 'missing' | 'price' | 'bracket';

export interface CompareRow {
  key: RowKey;
  label: string;
  /** One value per deck, in the order given (the first deck is the baseline). Undefined = not known. */
  values: (number | undefined)[];
  /** What each value shows on screen. */
  shown: string[];
  /** Each deck's difference from the baseline (0 for the baseline itself; undefined when either side is unknown). */
  deltas: (number | undefined)[];
  /** The difference said in words, per deck ('' for the baseline). */
  says: string[];
}

const ROLE_ROWS: [Role, string, string][] = [
  ['ramp', 'Ramp', 'ramp pieces'],
  ['draw', 'Card draw', 'card-draw sources'],
  ['removal', 'Removal', 'removal spells'],
  ['wipes', 'Board wipes', 'board wipes'],
  ['tutors', 'Tutors', 'tutors'],
];

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
export const bracketLabel = (b: number) => (b > 0 ? `${ROMAN[b] ?? b} (est.)` : 'none yet');

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** Rounds to two decimals for the mana value, so 0.1 + 0.2 never reads 0.30000000000000004. */
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Rows comparing each deck with the first one (the baseline). Every row carries its own sentence, so a delta is never a
 * bare "+3": it names the decks and what the number counts.
 */
export function compareDecks(decks: CompareDeck[], money: (n: number) => string = (n) => n.toFixed(2)): CompareRow[] {
  if (!decks.length) return [];
  const base = decks[0];
  const rows: CompareRow[] = [];

  /** A count row: "B runs 3 more lands than A", "B runs the same number of lands as A". */
  const count = (key: RowKey, label: string, noun: string, get: (d: CompareDeck) => number, verb = 'runs') => {
    const values = decks.map(get);
    rows.push({
      key,
      label,
      values,
      shown: values.map(String),
      deltas: values.map((v) => v - values[0]),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const diff = values[i] - values[0];
        if (diff === 0) return `${d.name} ${verb} the same number of ${noun} as ${base.name}.`;
        const n = Math.abs(diff);
        return `${d.name} ${verb} ${n} ${diff > 0 ? 'more' : 'fewer'} ${n === 1 ? singular(noun) : noun} than ${base.name}.`;
      }),
    });
  };

  count('cards', 'Cards', 'cards', (d) => d.stats.total, 'has');
  count('lands', 'Lands', 'lands', (d) => d.stats.lands);

  // Average mana value of the non-land cards: the curve in one number.
  {
    const values = decks.map((d) => (d.stats.total - d.stats.lands - d.stats.unknown > 0 ? round2(d.stats.avgMv) : undefined));
    rows.push({
      key: 'avgMv',
      label: 'Average mana value',
      values,
      shown: values.map((v) => (v == null ? '–' : v.toFixed(2))),
      deltas: values.map((v) => (v == null || values[0] == null ? undefined : round2(v - values[0]))),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const a = values[0];
        const b = values[i];
        if (a == null || b == null) return 'Average mana value: not known for both decks yet.';
        const diff = round2(b - a);
        if (diff === 0) return `${d.name} has the same average mana value as ${base.name}.`;
        return `${d.name}'s spells cost ${Math.abs(diff).toFixed(2)} ${diff > 0 ? 'more' : 'less'} on average than ${base.name}'s (non-land cards).`;
      }),
    });
  }

  for (const [r, label, noun] of ROLE_ROWS) count(r, label, noun, (d) => d.stats.roles[r]);

  // Ownership: the same share and missing count the My Decks tile shows.
  {
    const values = decks.map((d) => d.ownedPct);
    rows.push({
      key: 'owned',
      label: 'You own',
      values,
      shown: values.map((v) => `${v}%`),
      deltas: values.map((v) => v - values[0]),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const diff = values[i] - values[0];
        if (diff === 0) return `You own the same share of ${d.name} as of ${base.name}.`;
        return `You own ${Math.abs(diff)} ${plural(Math.abs(diff), 'point', 'points')} ${diff > 0 ? 'more' : 'less'} of ${d.name} than of ${base.name}.`;
      }),
    });
  }
  {
    const values = decks.map((d) => d.missing);
    rows.push({
      key: 'missing',
      label: 'Cards to buy',
      values,
      shown: values.map(String),
      deltas: values.map((v) => v - values[0]),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const diff = values[i] - values[0];
        if (diff === 0) return `${d.name} needs as many cards bought as ${base.name}.`;
        const n = Math.abs(diff);
        return `${d.name} needs ${n} ${diff > 0 ? 'more' : 'fewer'} ${plural(n, 'card', 'cards')} bought than ${base.name}.`;
      }),
    });
  }

  // Whole-deck price, only when both prices are known.
  {
    const values = decks.map((d) => (d.price == null ? undefined : Math.round(d.price * 100) / 100));
    rows.push({
      key: 'price',
      label: 'Deck price',
      values,
      shown: values.map((v) => (v == null ? '–' : `≈${money(v)}`)),
      deltas: values.map((v) => (v == null || values[0] == null ? undefined : Math.round((v - values[0]) * 100) / 100)),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const a = values[0];
        const b = values[i];
        if (a == null || b == null) return 'Deck price: prices are not loaded for both decks yet.';
        const diff = Math.round((b - a) * 100) / 100;
        if (diff === 0) return `${d.name} costs about the same as ${base.name}.`;
        return `${d.name} costs about ${money(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${base.name} (cheapest printings).`;
      }),
    });
  }

  // The bracket is an estimate and always says so.
  {
    const values = decks.map((d) => (d.bracket > 0 ? d.bracket : undefined));
    rows.push({
      key: 'bracket',
      label: 'Bracket estimate',
      values,
      shown: decks.map((d) => bracketLabel(d.bracket)),
      deltas: values.map((v) => (v == null || values[0] == null ? undefined : v - values[0])),
      says: decks.map((d, i) => {
        if (i === 0) return '';
        const a = values[0];
        const b = values[i];
        if (a == null || b == null) return 'Bracket estimate: one of the decks is empty.';
        if (a === b) return `Both decks are estimated at bracket ${ROMAN[a]}. An estimate from the cards only, not from how you play.`;
        const n = Math.abs(b - a);
        return `${d.name} is estimated ${n} ${plural(n, 'bracket', 'brackets')} ${b > a ? 'higher' : 'lower'} than ${base.name}. An estimate from the cards only, not from how you play.`;
      }),
    });
  }

  return rows;
}

/** "lands" → "land", "board wipes" → "board wipe", "card-draw sources" → "card-draw source". */
function singular(noun: string) {
  return noun.endsWith('s') ? noun.slice(0, -1) : noun;
}

/** Cards a deck's Scryfall data isn't cached for yet: their lands and roles can't be counted, so the view says so. */
export const notLoaded = (d: CompareDeck) => d.stats.unknown;

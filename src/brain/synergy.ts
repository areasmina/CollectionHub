import type { Card, DeckCard } from '../lib/db';
import { isLand } from '../lib/deckstats';

/**
 * Synergy without popularity (overhaul phase 2): what a card MAKES and what it CARES ABOUT, read from its rules text
 * and type line, on a short list of engines every Commander player knows (tokens, sacrifice, graveyard, counters…).
 * A card fits a deck when it makes what the commander or the deck cares about, or cares about what they make.
 *
 * This is how an owned card EDHREC doesn't list for a commander can still earn its place, with a reason a player can
 * check ("feeds your commander: discard", "pays off the 14 token makers in the deck"). No invented scores: each
 * reason is a rule on the card's own text, and tests/bench/suggest.test.ts measures whether it helps on real decks.
 */
type C = Pick<Card, 'type' | 'text'>;
export interface Engine {
  key: string;
  /** How the engine reads in a reason: "tokens", "your graveyard". */
  label: string;
  makes: (c: C) => boolean;
  cares: (c: C) => boolean;
}
const t = (rx: RegExp) => (c: C) => rx.test(c.text ?? '');
const ty = (rx: RegExp) => (c: C) => rx.test(c.type ?? '');
const any = (...fs: ((c: C) => boolean)[]) => (c: C) => fs.some((f) => f(c));

export const ENGINES: Engine[] = [
  {
    key: 'tokens',
    label: 'tokens',
    makes: t(/\bcreates? [^.]{0,60}\btokens?\b|\bpopulate\b|\bamass\b|\bfabricate\b|\bembalm\b|\bincubate\b/i),
    cares: t(/\bpopulate\b|whenever (a|one or more|another) [^.]{0,30}tokens? [^.]{0,20}(enters?|is created|are created)|for each (creature|token) you control|creatures? tokens? you control (get|have)|creatures you control get \+|\bconvoke\b|if (you would create|one or more tokens would be created)|number of creatures you control/i),
  },
  {
    key: 'sacrifice',
    label: 'sacrifice',
    makes: t(/sacrifice (a|an|another|two|three|x|any number of) [^.:]{0,30}(creatures?|permanents?|artifacts?|tokens?)[^.]{0,10}:|\bsacrifice (a|another) (creature|permanent|artifact)\b|\bexploit\b|\bcasualty\b|\bemerge\b/i),
    cares: t(/whenever [^.]{0,60}(dies|is put into a graveyard from the battlefield)|whenever you sacrifice|whenever [^.]{0,30}(creature|permanent) [^.]{0,20}leaves the battlefield|\bmorbid\b|\bafterlife\b/i),
  },
  {
    key: 'graveyard',
    label: 'your graveyard',
    makes: t(/\bmills?\b|\bsurveil\b|\bdredge\b|put [^.]{0,40}(of|from) your library into your graveyard|discard (a|two|three|x|that) cards?|\bconnives?\b|\bexplores?\b|\bcycling\b/i),
    cares: t(/(from|in|out of) your graveyard|\bflashback\b|\bescape\b|\bdelve\b|\bunearth\b|\bdisturb\b|\bembalm\b|\beternalize\b|\bthreshold\b|\bdelirium\b|\bundergrowth\b|\bjump-start\b|\bretrace\b|\bencore\b|\bdescended?\b/i),
  },
  {
    key: 'discard',
    label: 'discard',
    makes: t(/\b(discards?|discarding) (a|an|two|three|x|that|their|your|one or more) (card|cards|hand)|each player discards|\bconnives?\b|draw [^.]{0,20}, then discard|\bcycling\b|\bbloodrush\b|\bblood tokens?\b/i),
    cares: t(/whenever (you|a player|an opponent|one or more players) discards?|whenever [^.]{0,20}cycles? or discards?|\bmadness\b|\bhellbent\b|(a|each|an) opponent [^.]{0,30}(has|with) (no|one or fewer|two or fewer) cards in hand|no cards in hand/i),
  },
  {
    key: 'counters',
    label: '+1/+1 counters',
    makes: t(/puts? [^.]{0,40}\+1\/\+1 counters? on|enters? [^.]{0,30}with [^.]{0,20}\+1\/\+1 counters?|\bproliferate\b|\badapt\b|\bevolve\b|\bbolster\b|\bsupport\b|\bmentor\b|\btraining\b|\bfabricate\b|\boutlast\b|\bmodular\b|\briot\b|\bbackup\b/i),
    cares: t(/(with|has|have|had) (a|one or more) \+1\/\+1 counters?|for each \+1\/\+1 counter|whenever [^.]{0,60}counters? (is|are) (put|placed)|\bproliferate\b|(remove|move) (a|x|one or more|any number of) \+1\/\+1 counters?|if [^.]{0,40}counters would be put/i),
  },
  {
    key: 'lifegain',
    label: 'life gain',
    makes: t(/\b(you )?gains? (\d+|x|that much|life equal|twice)[^.]{0,20}life|\blifelink\b|\bfood tokens?\b/i),
    cares: t(/whenever you gain life|if you (gained|would gain) life|you gained [^.]{0,20}life this turn|for each (1 )?life you gained|your life total (is|becomes)|life total is greater/i),
  },
  {
    key: 'spells',
    label: 'instants and sorceries',
    makes: any(ty(/\b(Instant|Sorcery)\b/), t(/\bflashback\b|\brebound\b|copy target (instant|sorcery)|copy (that|it|the) spell/i)),
    cares: t(/whenever you cast (an?|your (first|second)) (instant|sorcery|noncreature|spell)|instant (or|and) sorcery (spell|card)|\bmagecraft\b|\bprowess\b|\bstorm\b|whenever you cast or copy|instant and sorcery spells you cast cost/i),
  },
  {
    key: 'artifacts',
    label: 'artifacts',
    makes: any(ty(/\bArtifact\b/), t(/\b(treasure|clue|food|blood|powerstone|map|gold) tokens?\b|artifact creature tokens?|\bfabricate\b/i)),
    cares: t(/artifacts? you control|whenever (an|one or more|another) artifacts? (enters?|is put|are put)|whenever you cast an artifact|for each artifact|\baffinity\b|\bimprovise\b|\bmetalcraft\b|sacrifice an artifact|artifact spells you cast|historic/i),
  },
  {
    key: 'enchantments',
    label: 'enchantments',
    makes: ty(/\bEnchantment\b/),
    cares: t(/enchantments? you control|whenever (an|another) enchantment enters|whenever you cast an (enchantment|aura)|\bconstellation\b|for each (enchantment|aura)|enchantment spells you cast|\bbestow\b|enchanted creature/i),
  },
  {
    key: 'lands',
    label: 'lands',
    makes: t(/play (an|two|three|x) additional lands?|puts? [^.]{0,50}land cards? [^.]{0,30}onto the battlefield|search your library for [^.]{0,40}(basic )?land|return [^.]{0,30}land cards? from your graveyard|lands? cards? from your graveyard/i),
    cares: t(/\blandfall\b|whenever (a|one or more) lands? (enters?|you control enters)|for each land you control|number of lands you control|whenever you play a land/i),
  },
  {
    key: 'blink',
    label: 'enter-the-battlefield effects',
    makes: t(/exile [^.]{0,80}(,|\.) (then )?return (it|that card|them|those cards) to the battlefield|\bflicker\b|\bblink\b|return (target|another target|a) creature you control to its owner's hand|whenever [^.]{0,40}enters[^.]{0,20}, (you may )?copy/i),
    cares: (c) => /\bCreature\b/.test(c.type ?? '') && /when(ever)? [^.]{0,40}\benters\b/i.test(c.text ?? ''),
  },
  {
    key: 'evasion',
    label: 'combat damage to players',
    makes: t(/can't be blocked|\bflying\b|\bmenace\b|\bshadow\b|\bskulk\b|\bfear\b|\bintimidate\b|\bhorsemanship\b|\bninjutsu\b|\btrample\b|\bdouble strike\b|additional combat phase|unblockable/i),
    cares: t(/whenever [^.]{0,60}deals combat damage to (a|an|one or more) (player|opponent)s?|\bninjutsu\b|whenever [^.]{0,40}attacks? (and isn't blocked|a player)|\bsaboteur\b/i),
  },
  {
    key: 'topdeck',
    label: 'the top of your library',
    makes: t(/\bscry\b|look at the top (card|\w+ cards) of your library|put [^.]{0,40}on top of (your|its owner's) library|\bbrainstorm\b|\bmiracle\b/i),
    cares: t(/reveal the top card of your library|top card of your library (is|has)|play with the top card|you may (play|cast) [^.]{0,40}(from )?the top of your library|\bmiracle\b|its mana value|that card's mana value/i),
  },
  {
    key: 'mana',
    label: 'mana from permanents',
    makes: (c) => !isLand(c.type) && /\{t\}[^.]{0,30}: add |add (one|two|three|x|an amount of) mana|add \{[wubrgc]\}/i.test(c.text ?? ''),
    cares: t(/whenever you tap a (nonland )?(permanent|creature|artifact) for mana|untap (target|another target|all|each) (nonland )?(permanent|creature|artifact|land)s?|\{x\}[^.]{0,60}|activated abilities [^.]{0,40}cost|abilities of (creatures|artifacts) [^.]{0,30}cost/i),
  },
  {
    key: 'draw',
    label: 'drawing cards',
    makes: t(/\bdraws? (a|an|two|three|four|x|that many|cards equal) (card|cards|additional)|\binvestigate\b|\bconnives?\b/i),
    cares: t(/whenever you draw (a|your second|one or more) cards?|for each card (in your hand|you've drawn)|number of cards in your hand|no maximum hand size|if you would draw/i),
  },
  {
    key: 'equip',
    label: 'auras and equipment',
    makes: any(ty(/\b(Equipment|Aura)\b/), t(/\bliving weapon\b|\bfor mirrodin!|\breconfigure\b/i)),
    cares: t(/(equipped|enchanted) creatures? you control|whenever [^.]{0,40}becomes? (equipped|enchanted|attached)|for each (aura|equipment)|(aura|equipment) (spells|cards)|is (enchanted|equipped)|\bequip\b[^.]{0,20}costs?|attach (target|up to|any number of)/i),
  },
];
const BIT = new Map(ENGINES.map((e, i) => [e.key, 1 << i]));

export interface Profile {
  makes: number; // engine bits
  cares: number;
  /** Creature subtypes on the type line ("Legendary Creature — Human Ninja" → Human, Ninja). */
  tribes: string[];
}
const cache = new Map<string, Profile>();
/** What a card makes and cares about (memoised on its text: the same card is read once). */
export function profileOf(c: C): Profile {
  const k = `${c.type ?? ''}\n${c.text ?? ''}`;
  let p = cache.get(k);
  if (p) return p;
  let makes = 0;
  let cares = 0;
  for (const e of ENGINES) {
    if (e.makes(c)) makes |= BIT.get(e.key)!;
    if (e.cares(c)) cares |= BIT.get(e.key)!;
  }
  const sub = /\bCreature\b/.test(c.type ?? '') ? ((c.type ?? '').split(/\s[—-]\s/)[1] ?? '').split(/\s+/).filter(Boolean) : [];
  p = { makes, cares, tribes: sub };
  if (cache.size > 40000) cache.clear();
  cache.set(k, p);
  return p;
}

/** Creature types a card's text names as a group it rewards ("Ninjas you control", "another Elf", "Villain spells"). */
function tribesNamed(text: string, known: Set<string>): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b([A-Z][a-z]+?)(s|es)?\b/g)) {
    if (known.has(m[1])) out.add(m[1]);
    else if (m[2] && known.has(m[1] + m[2])) out.add(m[1] + m[2]);
  }
  return [...out];
}

export interface DeckSynergy {
  commander?: Profile;
  /** Types the commander's text rewards. */
  commanderTribes: string[];
  /** Per engine: how many cards in the deck make it / care about it (the commander not counted). */
  makes: number[];
  cares: number[];
  /** Creature types with at least TRIBE_MIN creatures in the deck. */
  tribes: Map<string, number>;
  spells: number;
}
export const TRIBE_MIN = 8;

/** The deck's engines, counted once per deck state. */
export function deckSynergy(deck: DeckCard[], cardOf: (name: string) => C | undefined, commander?: string): DeckSynergy {
  const makes = ENGINES.map(() => 0);
  const cares = ENGINES.map(() => 0);
  const tribeN = new Map<string, number>();
  let spells = 0;
  let cmd: Profile | undefined;
  let cmdText = '';
  for (const dc of deck) {
    const c = cardOf(dc.name);
    if (!c) continue;
    if (commander && dc.name === commander) {
      cmd = profileOf(c);
      cmdText = c.text ?? '';
      continue;
    }
    if (isLand(c.type)) continue;
    spells += dc.qty;
    const p = profileOf(c);
    ENGINES.forEach((_, i) => {
      if (p.makes & (1 << i)) makes[i] += dc.qty;
      if (p.cares & (1 << i)) cares[i] += dc.qty;
    });
    for (const s of p.tribes) tribeN.set(s, (tribeN.get(s) ?? 0) + dc.qty);
  }
  const known = new Set(tribeN.keys());
  for (const s of cmd?.tribes ?? []) known.add(s);
  return { commander: cmd, commanderTribes: cmdText ? tribesNamed(cmdText, known) : [], makes, cares, tribes: new Map([...tribeN].filter(([, n]) => n >= TRIBE_MIN)), spells };
}

/** Sizes of the nudges, on the brain's scale (an EDHREC inclusion share is 0–1). Set on the two benchmarks together
 *  (tests/bench): these values raise the suggestion numbers without lowering deck reconstruction; bigger ones lower it. */
export const CMD_W = 0.22; // makes what the commander cares about, or pays off what the commander makes
export const DECK_W = 0.06; // the same for the deck's own engines, scaled by how much of the engine the deck has
export const TRIBE_W = 0.18;
export const SYN_CAP = 0.4;
/** A deck "has" an engine's payoffs at this many cards, its makers at this many (payoffs are rarer than makers). */
const FULL_CARES = 6;
const FULL_MAKES = 12;
/** Engines almost every deck has a little of count only above this share of the deck's spells (artifacts, draw…). */
const BROAD = new Set(['artifacts', 'enchantments', 'spells', 'evasion', 'draw', 'mana', 'tokens']);

export interface SynPart {
  label: string;
  value: number;
}
/** Why this card fits the commander and the deck's engines, strongest first; total capped at SYN_CAP. */
export function synergyParts(c: C, syn: DeckSynergy, commanderLabel = 'your commander'): SynPart[] {
  const p = profileOf(c);
  const out: SynPart[] = [];
  const cmd = syn.commander;
  ENGINES.forEach((e, i) => {
    const b = 1 << i;
    if (cmd) {
      if (p.makes & b && cmd.cares & b) out.push({ label: `feeds ${commanderLabel}: ${e.label}`, value: CMD_W });
      else if (p.cares & b && cmd.makes & b && !BROAD.has(e.key)) out.push({ label: `pays off ${commanderLabel}: ${e.label}`, value: CMD_W });
    }
    const floor = BROAD.has(e.key) ? Math.max(3, Math.round(syn.spells * 0.06)) : 2;
    if (p.makes & b && syn.cares[i] >= floor) {
      const v = DECK_W * Math.min(1, syn.cares[i] / FULL_CARES);
      out.push({ label: `feeds the deck's ${syn.cares[i]} ${e.label} payoffs`, value: v });
    }
    if (p.cares & b && syn.makes[i] >= Math.max(floor, 4)) {
      const v = DECK_W * Math.min(1, syn.makes[i] / FULL_MAKES);
      out.push({ label: `pays off the deck's ${syn.makes[i]} ${e.label} cards`, value: v });
    }
  });
  const text = c.text ?? '';
  const named = (s: string) => new RegExp(`\\b${s}(s|es)?\\b`).test(text);
  for (const s of syn.commanderTribes) if (p.tribes.includes(s) || named(s)) out.push({ label: `${s}: the type ${commanderLabel} rewards`, value: TRIBE_W });
  for (const [s, n] of syn.tribes) {
    if (syn.commanderTribes.includes(s)) continue;
    if (named(s)) out.push({ label: `rewards the deck's ${n} ${s} creatures`, value: TRIBE_W });
  }
  out.sort((a, b) => b.value - a.value);
  // Keep the strongest reasons, and never let synergy alone outweigh a staple everyone plays.
  const kept: SynPart[] = [];
  let sum = 0;
  for (const x of out.slice(0, 4)) {
    const v = Math.min(x.value, SYN_CAP - sum);
    if (v <= 0.005) break;
    kept.push({ label: x.label, value: v });
    sum += v;
  }
  return kept;
}

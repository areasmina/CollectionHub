import type { Card } from '../lib/db';

/**
 * Themes as rules-text tests (Deck Wizard's theme_profile / hits_theme, ported). The theme you pick on a commander
 * page (an EDHREC tag such as "Discard", "Connive", "+1/+1 Counters", "Villains") becomes a test on each card's Oracle
 * text (reminder text included) and type line. Guillermo, Nov 6: a mechanic theme looks for cards whose text helps
 * that strategy, not for a creature type; a type theme ("Villains", "Ninjas") looks at the type line.
 */
type C = Pick<Card, 'type' | 'text'>;
export interface Theme {
  label: string;
  test: (c: C) => boolean;
}

/** Mechanic themes: what a card does for the strategy, read from its text. Keys are lowercase EDHREC tag names. */
const MECHANICS: Record<string, RegExp> = {
  discard: /\bdiscards?\b|\bloot|\bconnive|\bcycling\b|\bmadness\b|\bflashback\b|from your graveyard|\bwheel\b|each player draws seven/i,
  connive: /\bconniv/i,
  'card draw': /\bdraws? (a|two|three|x|\w+) cards?|\bdraw a card\b/i,
  wheels: /each player (discards|shuffles) (their|his or her) hand|each player draws seven/i,
  reanimator: /return [^.]{0,60}from (your|a) graveyard to the battlefield|put [^.]{0,40}from (a|your) graveyard onto the battlefield|\breanimat/i,
  graveyard: /graveyard/i,
  'self-mill': /\bmills?\b|put the top \w+ cards? of your library into your graveyard|\bsurveil\b/i,
  tokens: /create[s]? [^.]{0,40}\btokens?\b|\bpopulate\b/i,
  'go wide': /create[s]? [^.]{0,40}\btokens?\b|creatures you control get \+|for each creature you control/i,
  '+1/+1 counters': /\+1\/\+1 counters?|\bproliferate\b|\badapt\b|\bevolve\b|\boutlast\b|\bmodular\b/i,
  counters: /\bcounters?\b|\bproliferate\b/i,
  proliferate: /\bproliferate\b/i,
  lifegain: /gains? (\d+|x|that much|life equal)|whenever you gain life|\blifelink\b/i,
  'life gain': /gains? (\d+|x|that much|life equal)|whenever you gain life|\blifelink\b/i,
  aristocrats: /\bsacrifice (a|another|an)\b|whenever [^.]{0,40}(dies|is put into a graveyard)|each opponent loses \d+ life/i,
  sacrifice: /\bsacrifice (a|another|an)\b|whenever [^.]{0,40}dies/i,
  burn: /deals? (\d+|x) damage to (any target|each opponent|target player|each player)/i,
  drain: /each opponent loses \d+ life|deals? \d+ damage to each opponent/i,
  spellslinger: /instant or sorcery|whenever you cast (an|a) (instant|sorcery|noncreature)|\bmagecraft\b|\bstorm\b|copy target (instant|sorcery)/i,
  'spells matter': /instant or sorcery|whenever you cast (an|a) (instant|sorcery|noncreature)|\bmagecraft\b|\bprowess\b/i,
  artifacts: /\bartifacts?\b|\btreasure\b|\bclue\b|\bimprovise\b|\baffinity\b/i,
  treasure: /\btreasure\b/i,
  enchantments: /\benchantments?\b|\bconstellation\b|\baura\b/i,
  enchantress: /whenever you cast an enchantment|\bconstellation\b|enchantment spell/i,
  auras: /\baura\b|enchanted creature/i,
  equipment: /\bequip(ped|ment)?\b/i,
  voltron: /(equipped|enchanted) creature (gets|has)|\bequip\b|double strike|can't be blocked|\bhexproof\b/i,
  landfall: /\blandfall\b|whenever a land enters|play an additional land|put [^.]{0,30}land cards? onto the battlefield/i,
  lands: /\blandfall\b|play an additional land|land cards?|from your graveyard [^.]{0,20}land/i,
  blink: /exile [^.]{0,60}(then )?return (it|that card|them) to the battlefield|\bflicker|\bblink/i,
  'enter the battlefield': /when [^.]{0,40}enters|whenever [^.]{0,40}enters/i,
  etb: /when [^.]{0,40}enters|whenever [^.]{0,40}enters/i,
  'extra combat': /additional combat phase/i,
  combat: /whenever [^.]{0,40}attacks|additional combat phase|deals combat damage/i,
  infect: /\binfect\b|\btoxic\b|poison counters?|\bproliferate\b/i,
  poison: /\binfect\b|\btoxic\b|poison counters?|\bproliferate\b/i,
  mill: /\bmills?\b|put the top \w+ cards? of (target|each) (player|opponent)'?s? library into/i,
  control: /counter target|destroy target|exile target|return target [^.]{0,40}to its owner's hand/i,
  stax: /can't (cast|untap|attack|search)|don't untap|costs? \{\d\} more|each player can't/i,
  theft: /gain control of|you may cast [^.]{0,40}(you don't own|exiled with)|cast [^.]{0,30}opponent'?s?/i,
  'steal': /gain control of|you don't own/i,
  'big mana': /add \{[cwubrg]\}\{[cwubrg]\}|\bx\b[^.]{0,20}mana|\bditto\b/i,
  'top deck': /top (card|\w+ cards) of your library|\bscry\b|\bsurveil\b/i,
  'cast from exile': /you may (play|cast) [^.]{0,40}exiled|\bforetell\b|\bplot\b|\bdiscover\b|\bcascade\b/i,
  cascade: /\bcascade\b|\bdiscover\b/i,
  storm: /\bstorm\b|copy (it|that spell) for each/i,
  ninjutsu: /\bninjutsu\b/i,
  energy: /\{e\}|energy counters?/i,
  mutate: /\bmutate\b/i,
  morph: /\bmorph\b|\bdisguise\b|\bmanifest\b|face[- ]down/i,
  monarch: /\bmonarch\b|\binitiative\b/i,
  politics: /\bvote\b|\bgoad\b|\bmonarch\b|each opponent may/i,
  goad: /\bgoad\b/i,
  wither: /\bwither\b|-1\/-1 counters?/i,
  '-1/-1 counters': /-1\/-1 counters?|\bwither\b/i,
  dragons: /\bDragon\b/,
};

/** EDHREC's plural tribe tags → the type word in the type line ("Villains" → Villain, "Elves" → Elf). */
const IRREGULAR: Record<string, string> = { elves: 'Elf', dwarves: 'Dwarf', wolves: 'Wolf', werewolves: 'Werewolf', fungi: 'Fungus', octopi: 'Octopus', sphinxes: 'Sphinx', foxes: 'Fox', mice: 'Mouse' };
const singular = (w: string) => IRREGULAR[w.toLowerCase()] ?? w.replace(/ies$/, 'y').replace(/(ss|sh|ch|x)es$/, '$1').replace(/s$/, '');

/**
 * A theme from its name. Known mechanics use their pattern; a name that reads like a creature type ("Villains",
 * "Ninjas") tests the type line (plus "<Type>" in the text, so lords and payoffs count); anything else falls back to the
 * words of the name in the rules text ("Connive" → connives, connived).
 */
export function themeOf(name: string): Theme {
  const key = name.trim().toLowerCase();
  const rx = MECHANICS[key];
  if (rx) return { label: name, test: (c) => rx.test(c.text ?? '') };
  const word = singular(name.trim().split(/\s+/).pop() ?? name);
  if (/^[A-Z][a-z]+$/.test(word) && key.split(/\s+/).length === 1 && /s$/i.test(name.trim())) {
    const type = new RegExp(`\\b${word}s?\\b`);
    return { label: name, test: (c) => type.test(c.type ?? '') || type.test(c.text ?? '') };
  }
  const stem = key.replace(/[^a-z0-9+/ -]/g, '').replace(/(ing|ed|es|s)$/, '');
  const words = new RegExp(`\\b${stem.replace(/[+/]/g, (m) => `\\${m}`)}\\w*`, 'i');
  return { label: name, test: (c) => words.test(c.text ?? '') };
}

/** The strategy stack: a primary theme counts full, up to two secondary ones half (CLAUDE.md Build mode). */
export const STACK_WEIGHTS = [1, 0.5, 0.5] as const;

/**
 * Enabler vs Payoff rules for two-part strategies (r/EDH's #1 synergy check: don't build all payoffs with no engine).
 * Returns 'enabler' (sets up the mechanic), 'payoff' (rewards it), or undefined when not applicable.
 */
const ROLE_PAIRS: Record<string, { enabler: RegExp; payoff: RegExp }> = {
  aristocrats: {
    enabler: /\bsacrifice (a|another|an)\b|create[s]? [^.]{0,40}\btokens?\b|when [^.]{0,30}dies, create/i,
    payoff: /whenever [^.]{0,50}(dies|is put into a graveyard|you sacrifice)|each opponent loses \d+ life/i,
  },
  sacrifice: {
    enabler: /\bsacrifice (a|another|an)\b|create[s]? [^.]{0,40}\btokens?\b/i,
    payoff: /whenever [^.]{0,50}(dies|you sacrifice)/i,
  },
  discard: {
    enabler: /\bdiscards? (a|two|three|\w+) cards?|\bloot|\bconnive|\bcycling\b|\bwheel\b|each player discards/i,
    payoff: /whenever (you|a player|an opponent) discards?|\bmadness\b|\bflashback\b|from your graveyard/i,
  },
  reanimator: {
    enabler: /\bmills?\b|\bdiscards?\b|\bsurveil\b|put [^.]{0,40}from your library into your graveyard/i,
    payoff: /return [^.]{0,60}from (your|a) graveyard to the battlefield|put [^.]{0,40}from (a|your) graveyard onto the battlefield|\breanimat/i,
  },
  tokens: {
    enabler: /create[s]? [^.]{0,40}\btokens?\b|\bpopulate\b/i,
    payoff: /tokens you control (get|have)|creatures you control (get|have) \+|whenever (a|one or more) [^.]{0,25}tokens? enters/i,
  },
  'go wide': {
    enabler: /create[s]? [^.]{0,40}\btokens?\b/i,
    payoff: /creatures you control (get|have) \+|for each creature you control/i,
  },
  blink: {
    enabler: /exile [^.]{0,60}(then )?return (it|that card|them) to the battlefield|\bflicker|\bblink/i,
    payoff: /when [^.]{0,40}enters|whenever [^.]{0,40}enters/i,
  },
  landfall: {
    enabler: /play an additional land|search your library for [^.]{0,35}land card[^.]{0,30}onto the battlefield|put [^.]{0,30}land cards? onto the battlefield/i,
    payoff: /\blandfall\b|whenever a land (you control )?enters/i,
  },
  spellslinger: {
    enabler: /\b(Instant|Sorcery)\b/,
    payoff: /whenever you cast (an|a) (instant|sorcery|noncreature)|\bmagecraft\b|\bstorm\b|\bprowess\b/i,
  },
  '+1/+1 counters': {
    enabler: /put (a|\w+) \+1\/\+1 counters? on|\badapt\b|\bevolve\b|\boutlast\b/i,
    payoff: /\bproliferate\b|each creature you control with a \+1\/\+1 counter|whenever one or more \+1\/\+1 counters/i,
  },
};

export function themeRoleOf(themeLabel: string, c: C): 'enabler' | 'payoff' | undefined {
  const key = themeLabel.trim().toLowerCase();
  const pair = ROLE_PAIRS[key];
  if (!pair) return undefined;
  const text = c.text ?? '';
  const type = c.type ?? '';
  if (pair.payoff.test(text)) return 'payoff';
  if (key === 'spellslinger' ? pair.enabler.test(type) : pair.enabler.test(text)) return 'enabler';
  return undefined;
}

/**
 * Auto-detect up to 3 strategy themes directly from a commander's Oracle text and type line
 * (optionally cross-referenced with EDHREC's top tags for that commander).
 */
const AUTO_ORDER: [string, string, RegExp][] = [
  ['Connive', 'connive', /\bconniv/i],
  ['Ninjutsu', 'ninjutsu', /\bninjutsu\b/i],
  ['Landfall', 'landfall', /\blandfall\b|whenever a land (you control )?enters|play an additional land/i],
  ['Discard', 'discard', /whenever (you|a player) discards?|\bdiscards? a card\b|\bconniv/i],
  ['Lifegain', 'lifegain', /whenever you gain life|you gain .* life|\blifelink\b/i],
  ['Tokens', 'tokens', /\bpopulate\b|create[s]? [^.]{0,40}\btokens?\b/i],
  ['Aristocrats', 'aristocrats', /whenever (a|another) creature (you control )?dies|\bsacrifice (a|another) creature\b/i],
  ['+1/+1 Counters', '+1/+1 counters', /\+1\/\+1 counters?|\bproliferate\b/i],
  ['Blink', 'blink', /exile [^.]{0,60}return (it|that card|them) to the battlefield/i],
  ['Reanimator', 'reanimator', /return [^.]{0,60}from (your|a) graveyard to the battlefield/i],
  ['Spellslinger', 'spellslinger', /whenever you cast (an|a) (instant|sorcery|noncreature)/i],
  ['Equipment', 'equipment', /\bequip(ped|ment)?\b/i],
  ['Auras', 'auras', /\bauras?\b|enchanted creature/i],
  ['Enchantress', 'enchantress', /whenever you cast an enchantment|\bconstellation\b/i],
  ['Treasure', 'treasure', /\btreasure tokens?\b/i],
  ['Artifacts', 'artifacts', /\bartifacts? you control\b|whenever an artifact/i],
  ['Cascade', 'cascade', /\bcascade\b|\bdiscover\b/i],
  ['Mill', 'mill', /\bmills?\b/i],
  ['Goad', 'goad', /\bgoad\b/i],
];

export function commanderThemes(cmdr?: C, edhTags?: { value: string; count?: number }[]): Theme[] {
  if (!cmdr) return [];
  const out: Theme[] = [];
  const seen = new Set<string>();
  const add = (label: string) => {
    const k = label.toLowerCase();
    if (seen.has(k) || out.length >= STACK_WEIGHTS.length) return;
    seen.add(k);
    out.push(themeOf(label));
  };
  const text = cmdr.text ?? '';
  const subTypes = (cmdr.type?.split('—')[1] ?? '').trim().split(/\s+/).filter((w) => /^[A-Z][a-z]{2,}$/.test(w));
  // If the commander's rules text explicitly cares about one of its own creature types (e.g. "Villains", "Ninjas", "Elves"):
  for (const st of subTypes) {
    if (new RegExp(`\\b${st}s?\\b`, 'i').test(text)) add(`${st}s`);
  }
  for (const [label, , rx] of AUTO_ORDER) {
    if (rx.test(text)) add(label);
  }
  // Cross-reference with EDHREC's top tags when the commander text didn't fill the stack
  if (edhTags?.length && out.length < 2) {
    for (const t of edhTags.slice(0, 3)) {
      if (MECHANICS[t.value.toLowerCase()]) add(t.value);
    }
  }
  return out;
}

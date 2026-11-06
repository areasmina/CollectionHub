// Brain benchmark (ui-review §12): reconstruction from a mixed binder and the strategy test, on real public decks
// (tests/bench/fixtures.json, built by scripts/bench-fixtures.mjs). Plain numbers, no AI judging AI.
import fixtures from './fixtures.json';
import rolesJson from '../../public/brain/roles.json';
import combosJson from '../../public/brain/combos.json';
import { parseCombos, parseRoles, setBrainData } from '../../src/brain/data';
import { buildDeck } from '../../src/brain/build';
import { readiness } from '../../src/brain/validate';
import { bracketOf } from '../../src/lib/deckstats';
import { BASICS } from '../../src/lib/compare';
import { isLand } from '../../src/lib/deckstats';
import { norm } from '../../src/lib/names';
import { rng } from '../../src/brain/wildcard';

type Meta = { type: string; text: string; cmc?: number; mana?: string; ci: string[]; legal: boolean; gc?: boolean };
type FDeck = { id: number; name: string; bracket: number | null; cards: [string, number][] };
const F = fixtures as unknown as { decks: Record<string, FDeck[]>; cards: Record<string, Meta> };
setBrainData({ roles: parseRoles(rolesJson), combos: parseCombos(combosJson) });
const byKey = new Map(Object.entries(F.cards).map(([n, m]) => [norm(n), m]));
export const cardOf = (n: string) => byKey.get(norm(n));
export const gc = new Set([...byKey].filter(([, m]) => m.gc).map(([k]) => k));
export const commanders = Object.keys(F.decks);
export const decksOf = (c: string) => F.decks[c];

const nonBasic = (names: string[]) => names.filter((n) => !BASICS.has(norm(n)));
/** Share of decks (other than `skip`) that run each card: the builder's stand-in for EDHREC inclusion. */
export function popularity(cmdr: string, skip?: number) {
  const others = F.decks[cmdr].filter((d) => d.id !== skip);
  const n = new Map<string, number>();
  for (const d of others) for (const [c] of d.cards) n.set(norm(c), (n.get(norm(c)) ?? 0) + 1);
  return (name: string) => (n.get(norm(name)) ?? 0) / Math.max(1, others.length);
}

export interface Recon {
  cmdr: string;
  deck: string;
  bracket: number;
  overlap: number; // share of the real deck's non-basic cards the builder picked
  spells: number; // same, non-land only
  lands: number; // same, non-basic lands only
  noise: number; // cards picked from the random part of the binder
  missed: string[];
  ruleViolations: string[];
  ms: number;
}

export function reconstruct(cmdr: string, d: FDeck, noiseN = 300): Recon {
  const t0 = Date.now();
  const identity = cardOf(cmdr)!.ci;
  const real = nonBasic(d.cards.map(([n]) => n));
  const realKeys = new Set(real.map(norm));
  // ~300 random cards from the other commanders' decks (fixed seed), so the binder holds noise in and out of colour.
  const r = rng(d.id);
  const others = [...new Set(commanders.filter((c) => c !== cmdr).flatMap((c) => F.decks[c].flatMap((x) => x.cards.map(([n]) => n))))].filter((n) => !BASICS.has(norm(n)) && !realKeys.has(norm(n))).sort();
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  const noise = others.slice(0, noiseN);
  const pop = popularity(cmdr, d.id);
  const owned = [...real, ...noise].map((name) => ({ name, incl: pop(name) || undefined }));
  const bracket = d.bracket ?? 4;
  const built = buildDeck({ commander: cmdr, identity, owned, cardOf, bracket, gc });
  const pickedKeys = new Set(built.cards.map((c) => norm(c.name)));
  const hit = (xs: string[]) => (xs.length ? xs.filter((n) => pickedKeys.has(norm(n))).length / xs.length : 1);
  const realSpells = real.filter((n) => !isLand(cardOf(n)?.type));
  const realLands = real.filter((n) => isLand(cardOf(n)?.type));
  const rd = readiness({ deck: built.cards, cardOf, commander: cmdr, identity, bracket });
  const call = bracketOf(built.cards.map((c) => ({ name: c.name, card: cardOf(c.name) })), gc);
  const ruleViolations = [...rd.checks.filter((c) => c.kind === 'rules' && !c.ok).map((c) => c.says), ...(bracket < 4 && call.bracket > Math.max(bracket, 2) ? [`bracket ${call.bracket} > ${bracket}: ${call.reasons.join('; ')}`] : [])];
  return {
    cmdr,
    deck: d.name,
    bracket,
    overlap: hit(real),
    spells: hit(realSpells),
    lands: hit(realLands),
    noise: built.cards.filter((c) => noise.some((n) => norm(n) === norm(c.name))).length,
    missed: real.filter((n) => !pickedKeys.has(norm(n))),
    ruleViolations,
    ms: Date.now() - t0,
  };
}

/** Strategy test: one commander, a full binder (every card its decks run), popular build vs a chosen strategy. */
export function strategy(cmdr: string, label: string, test: (m: Meta & { name: string }) => boolean) {
  const identity = cardOf(cmdr)!.ci;
  const pop = popularity(cmdr);
  const binder = [...new Set(F.decks[cmdr].flatMap((d) => d.cards.map(([n]) => n)))].filter((n) => !BASICS.has(norm(n)));
  const owned = binder.map((name) => ({ name, incl: pop(name) || undefined }));
  const base = buildDeck({ commander: cmdr, identity, owned, cardOf, bracket: 4, gc });
  const themed = buildDeck({ commander: cmdr, identity, owned, cardOf, bracket: 4, gc, focus: { label, test } });
  const a = new Set(base.cards.map((c) => norm(c.name)));
  const b = new Set(themed.cards.map((c) => norm(c.name)));
  const fits = (s: Set<string>) => [...s].filter((k) => { const m = byKey.get(k); return m && test({ ...m, name: k }); }).length;
  const surfaced = themed.cards.filter((c) => !a.has(norm(c.name)) && test({ ...cardOf(c.name)!, name: c.name }) && pop(c.name) < 0.5).map((c) => c.name);
  return { cmdr, label, changed: [...b].filter((k) => !a.has(k)).length, fitBase: fits(a), fitThemed: fits(b), surfaced };
}

/** Same binder, the popular build vs a strategy stack: the cards of the stacked build, and how many connive-style cards
 *  the popular build had (for the stack test). */
export function strategyStack(cmdr: string, themes: { label: string; test: (m: { type: string; text: string }) => boolean }[]) {
  const identity = cardOf(cmdr)!.ci;
  const pop = popularity(cmdr);
  const binder = [...new Set(F.decks[cmdr].flatMap((d) => d.cards.map(([n]) => n)))].filter((n) => !BASICS.has(norm(n)));
  const owned = binder.map((name) => ({ name, incl: pop(name) || undefined }));
  const meta = (n: string) => ({ ...cardOf(n)!, name: n });
  const base = buildDeck({ commander: cmdr, identity, owned, cardOf, bracket: 4, gc }).cards.filter((c) => cardOf(c.name)).map((c) => meta(c.name));
  const cards = buildDeck({ commander: cmdr, identity, owned, cardOf, bracket: 4, gc, focus: themes }).cards.filter((c) => cardOf(c.name)).map((c) => meta(c.name));
  return { cards, baseConnive: base.filter((c) => themes[1].test(c)).length };
}

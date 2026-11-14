import { ownShare, type DeckShare } from './deckshare';
import { fetchPage, pagePath, type EdhPage } from './sources/edhrec';
import { norm } from './names';
import { orderSections } from './sections';

/**
 * Suggested Deck (roadmap 5.1, agreed with the owner): check EDHREC's average deck at brackets 3, 4 and 5 and at every
 * budget, and pick the one your binder already owns the most of. Ownership is THE count (`ownShare`), so the % here is
 * the same % the commander page shows once you land on that deck.
 */
export const FIT_BRACKETS = ['upgraded', 'optimized', 'cedh'] as const; // EDHREC slugs for brackets 3, 4, 5
export const FIT_BUDGETS = ['budget', '', 'expensive'] as const; // $, every budget, $$$ (cheapest first)

export interface FitResult {
  bracket: string;
  budget: string;
  /** null when EDHREC has no average deck for this bracket and budget (or it could not be reached). */
  share: DeckShare | null;
}

/** Every card of an average deck, the commander included, counted the way the commander page counts them. */
export function pageCards(p: EdhPage, commander: string) {
  const all = orderSections(p.lists, p.card ? { name: commander, id: p.card.id, qty: 1 } : undefined).flatMap((l) => l.cards);
  return [...new Map(all.map((c) => [norm(c.name), c])).values()]; // one line per card, as the commander page counts
}

/** The most-owned deck: highest %, then most cards owned, then the cheaper budget, then the lower bracket. */
export function pickBest(results: FitResult[]): FitResult | undefined {
  const rank = (r: FitResult) => [FIT_BUDGETS.indexOf(r.budget as never), FIT_BRACKETS.indexOf(r.bracket as never)];
  return results
    .filter((r) => r.share && r.share.total > 0)
    .sort((a, b) => {
      const d = b.share!.pct - a.share!.pct || b.share!.owned - a.share!.owned;
      if (d) return d;
      const [ab, ak] = rank(a);
      const [bb, bk] = rank(b);
      return ab - bb || ak - bk;
    })[0];
}

/** Fetch the nine average decks (cache first, a day old at most) and count what you own of each. */
export async function scanBestFit(
  o: { slug: string; commander: string; tag?: string; mine: Map<string, number> },
  get: (path: string) => Promise<EdhPage> = fetchPage,
  onStep?: (done: number, total: number) => void,
): Promise<FitResult[]> {
  const combos = FIT_BRACKETS.flatMap((bracket) => FIT_BUDGETS.map((budget) => ({ bracket, budget })));
  let done = 0;
  return Promise.all(
    combos.map(async ({ bracket, budget }): Promise<FitResult> => {
      let share: DeckShare | null = null;
      try {
        const p = await get(pagePath('average', o.slug, bracket, o.tag ?? '', budget));
        const cards = pageCards(p, o.commander);
        // a page with no deck lists is not a deck (EDHREC sometimes answers with only the commander)
        if (p.lists.some((l) => l.cards.length)) share = ownShare(cards, o.mine);
      } catch {
        // NoPage (EDHREC has no deck here) or offline: this combination is simply not a candidate
      }
      onStep?.(++done, combos.length);
      return { bracket, budget, share };
    }),
  );
}

import type { Card, Deck } from '../../lib/db';
import { norm } from '../../lib/names';
import type { DiscoverSubTab } from '../../lib/nav';

export type JumpTarget =
  | { kind: 'view'; tab: 'discover' | 'decks' | 'collection'; subTab?: DiscoverSubTab }
  | { kind: 'deck'; deckName: string }
  | { kind: 'card'; card: Card }
  | { kind: 'tag'; slug: string; name: string };

export interface JumpItem {
  id: string;
  title: string;
  subtitle: string;
  badge: 'VIEW' | 'DECK' | 'CARD' | 'TAG';
  target: JumpTarget;
  score: number;
}

export interface TagSummary {
  slug: string;
  name: string;
  count?: number;
}

const QUICK_VIEWS: Array<{ id: string; title: string; subtitle: string; tab: 'discover' | 'decks' | 'collection'; subTab?: DiscoverSubTab }> = [
  { id: 'view-guided', title: 'Guided Deckbuilder', subtitle: 'Step-by-step 100-card builder + Tabletop view', tab: 'discover', subTab: 'guided' },
  { id: 'view-tags', title: 'Tag Builder', subtitle: 'Browse Scryfall Tagger tree & bulk add to deck', tab: 'discover', subTab: 'tags' },
  { id: 'view-commanders', title: 'Discover Commanders', subtitle: 'Top commanders ranked by cards you own', tab: 'discover', subTab: 'commanders' },
  { id: 'view-decks', title: 'My Decks & Check List', subtitle: 'Saved decks, Folders, Balance, History & Paste Check', tab: 'decks' },
  { id: 'view-collection', title: 'My Collection', subtitle: 'Browse binder, import CSV, manage lists', tab: 'collection' },
];

function matchScore(haystack: string, needle: string): number {
  if (!needle) return 1;
  const h = norm(haystack);
  if (h === needle) return 100;
  if (h.startsWith(needle)) return 75;
  if (h.includes(needle)) return 40;
  return 0;
}

export function searchJumpItems(
  query: string,
  data: {
    decks: readonly Deck[];
    cards: readonly Card[];
    tags: readonly TagSummary[];
    mine?: Map<string, number>;
  },
  limit = 16
): JumpItem[] {
  const q = norm(query);
  const results: JumpItem[] = [];

  for (const v of QUICK_VIEWS) {
    const s = q ? Math.max(matchScore(v.title, q), matchScore(v.subtitle, q) * 0.6) : 60;
    if (s > 0) {
      results.push({
        id: v.id,
        title: v.title,
        subtitle: v.subtitle,
        badge: 'VIEW',
        target: { kind: 'view', tab: v.tab, subTab: v.subTab },
        score: s,
      });
    }
  }

  for (const d of data.decks) {
    const s = q ? Math.max(matchScore(d.name, q), matchScore(d.commander ?? '', q) * 0.7) : 45;
    if (s > 0) {
      results.push({
        id: `deck-${d.id ?? d.name}`,
        title: d.name,
        subtitle: d.commander ? `Commander: ${d.commander}` : `${d.cards.reduce((n, c) => n + c.qty, 0)} cards`,
        badge: 'DECK',
        target: { kind: 'deck', deckName: d.name },
        score: s + 10,
      });
    }
  }

  if (q.length >= 2) {
    let cardHits = 0;
    for (const c of data.cards) {
      const s = matchScore(c.name, q);
      if (s > 0) {
        const ownedQty = data.mine?.get(c.key) ?? 0;
        results.push({
          id: `card-${c.id}`,
          title: c.name,
          subtitle: `${c.type}${ownedQty > 0 ? ` · ${ownedQty} owned` : ''}`,
          badge: 'CARD',
          target: { kind: 'card', card: c },
          score: s + (ownedQty > 0 ? 5 : 0),
        });
        cardHits++;
        if (cardHits >= 24) break;
      }
    }

    let tagHits = 0;
    for (const t of data.tags) {
      const s = Math.max(matchScore(t.name, q), matchScore(t.slug, q) * 0.8);
      if (s > 0) {
        results.push({
          id: `tag-${t.slug}`,
          title: t.name,
          subtitle: t.count != null ? `otag:${t.slug} · ${t.count} cards` : `otag:${t.slug}`,
          badge: 'TAG',
          target: { kind: 'tag', slug: t.slug, name: t.name },
          score: s,
        });
        tagHits++;
        if (tagHits >= 12) break;
      }
    }
  }

  return results
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, limit);
}

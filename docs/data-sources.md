# Data sources

CollectionHub is free, rule-based and local-first: each user's own browser asks the sources below for what that user
opens, and keeps a cache in IndexedDB. There is no server that collects or resells this data. Each source has one
adapter or module; nothing else calls its API (`src/lib/sources/sources.test.ts` checks EDHREC).

| Source | What we use | Where | Cache | Pacing | Terms | Attribution | Permission |
|---|---|---|---|---|---|---|---|
| EDHREC (`json.edhrec.com`) | Commander and average-deck pages (inclusion, lift, themes), With/Without-card filters, salt top 1,000 | `src/lib/sources/edhrec.ts` | 1 day per page, 1 week for salt; stale copy shown offline | ≥350 ms between requests | [Terms of Service](https://edhrec.com/terms): personal, noncommercial use; no automated queries; no competing site | Footer credit + links to each EDHREC page | **Not granted.** Ask EDHREC in writing before any public launch, paid tier, ads or redistribution. Browser-side fetching is not proof of compliance. |
| Scryfall (`api.scryfall.com`) | Card data, prices, images, legality, Game Changers list, Tagger roles (precomputed) | `src/lib/scryfall.ts`, `scripts/build-roles.mjs` | Card data 1 week; roles monthly | Batched (75 per collection call), paced | [API docs](https://scryfall.com/docs/api): free use with pacing; don't paywall Scryfall data; images keep artist credit | Footer credit; card images unchanged | Not needed for this use |
| Commander Spellbook | Two-card combos (precomputed, its API sends no CORS headers) | `scripts/build-combos.mjs` → `public/brain/combos.json` | Monthly (GitHub workflow opens a PR) | Paged, once a month | Backend is MIT; public API | Combo notes say "Commander Spellbook" | Not needed |

## Rules we keep for EDHREC

1. Only pages the user opens are fetched, from the user's own browser. No server proxy, no bulk crawl, no shared cache.
2. Every page is cached; nothing is refetched within a day.
3. Requests are paced (about 3 a second at most).
4. EDHREC is credited in the footer and every commander page links to EDHREC's own page.
5. Nothing built on EDHREC data is sold, put behind a paywall or shown with ads without EDHREC's written permission.
6. Before a public launch, email EDHREC to ask; record the answer here.

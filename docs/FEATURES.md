# Features

What exists, its status and what proves it. Read before starting work; update the row when a PR merges.
`docs/ROADMAP.md` keeps the original plan and history.

Status: **Live** (merged to `main`, CI green) · **Partial** (live, known gaps listed) · **Planned** · **Parked**
(waiting on Guillermo). "manual, no test yet" = works when checked by hand; add a test when it's next touched. Checked against `main` at 8b6771a (2026-11-06).

## Collection

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Import: ManaBox CSV, any CSV, Moxfield / Archidekt / Arena text, plain lists; auto-detect | Live | v1 | `lib/importers.test.ts`, e2e "Import: when Scryfall stops answering" |
| Name-only imports get the cheapest paper printing with a price | Live | #11 | manual, no test yet |
| Two binders (profiles), each with its own cards and decks | Live | v1 | `lib/compare.test.ts` |
| Collection grid / list, by set, quantity edit, tiles with copy pips and price sticker | Live | #6, #8 | e2e "Collection: counters, widget, grid tiles" |
| One toolbar: search (name or rules text), group, sort, filters, view | Live | #6 | `lib/search.test.ts`, `lib/arrange.test.ts`, e2e "Nov 6 batch" |
| Prices: your printing for owned cards, cheapest paper printing for missing; fetch dates shown | Live | 3a.3 | `lib/pricewatch.test.ts` |
| Rotating top-3 widget (most valuable, risers / fallers) from daily snapshots | Live | 3a | `lib/pricewatch.test.ts` |
| BANNED tape for cards not legal in Commander | Live | #11 | manual, no test yet |
| Filters: colour, type, rarity, MV, price, foil, in deck / not in deck | Partial | – | some live via the toolbar; full set not done |
| Per-entry language, condition, other finishes | Planned | – | – |
| Custom lists (trade, wishlist, sell…) | Planned | – | – |

## Discover and commander page

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Commanders in your binder, ranked; search any commander | Live | v1 | e2e "Discover: title, eye art, filters" |
| Commander stats cached on the device (no EDHREC reload on app start) | Live | #3 | `lib/cmdrstats.test.ts`, e2e "Reload: commander stats come back from the device" |
| Saved commander page shows at once even when EDHREC is down | Live | #3 | e2e "an old saved page shows at once" |
| Commander page: sections in order with count + cost, grid / list, tags, Built around | Live | #6 | e2e "Commander page (Discover): sections in order", "Commander page: header stats" |
| POWER ALL · MIN · MED · MAX (brackets 3 / 4 / 5) | Live | #6 | e2e "Commander settings on a wide screen" |
| EDHREC With / Without card filter, self-testing with honest fallback | Live | #6 | e2e "EDHREC With / Without card" |
| Stand-ins ranked by EDHREC lift | Live | #7 | `lib/subs.test.ts` |
| Partner and Background commanders | Live | #7 | `lib/commander.test.ts` |
| WILDCARD: one seeded pick with evidence per commander, reroll, off per commander | Live | #10 | `brain/brain.test.ts` |
| IV+ stamp on decks forged from cEDH data | Live | #11 | manual, no test yet |
| Suggested deck built from owned cards first (Deck Wizard rules) | Partial | #7, #10 | brain core live; full builder port in progress (brain thread) |

## Decks and the Forge

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Deck page: header, toolbar, analysis, card menu | Live | v1, #6 | e2e "Deck page: header, toolbar, analysis and the card menu" |
| Rename, duplicate, delete (asks first) | Live | #6 | e2e "Deck page: Rename and Duplicate", "Delete is in the DECK menu" |
| Commander detection on deck import | Live | 2026-10-13 | `lib/commander.test.ts` |
| Copies across decks: "you'll need N more copies" (decks are virtual) | Live | 3a.2 | `lib/copies.test.ts` |
| Deck colours; active decks light their cards in Collection | Live | #6 | `lib/deckcolor.test.ts`, e2e "Deck light" |
| Swap window: every card swaps, top 3 + search your binder, undo, pins, drag to swap | Live | #6, #9 | `lib/pins.test.ts`, e2e "Swap window: every card swaps", "drag a suggestion" |
| Combo warnings in the swap window | Live | #7 | `brain/round2.test.ts` |
| Forge: first swap starts it, leaving asks to save, change commander with undo | Live | #6, #8 | e2e "Forging zone", "Forge: the big commander card is its menu" |
| Swaps keep the deck organised by type | Live | #6 | `lib/sections.test.ts`, e2e "Swapping keeps the deck organised" |
| Bracket estimate with reasons; combo-aware (Spellbook two-card combos) | Live | #7 | `brain/brackets.test.ts` |
| Card roles from Scryfall Tagger (ramp, draw, removal…) | Live | #7 | `brain/roles.test.ts` |
| Salt (EDHREC top 1,000) | Live | 2026-10-12 | `lib/salt.test.ts` |
| Legality and completeness checks (100 cards, singleton, colour identity) | Partial | – | banned cards flagged (#11); the rest not done |
| Physical copy reservations (optional, virtual stays default) | Planned | – | brain thread's revised plan |
| Deck generation modes: Owned only / Prefer owned / Budget | Planned | – | brain thread's revised plan |
| Playtesting (draw 7, mulligan, turns) | Parked | – | Guillermo: "much later"; plan in `/mnt/project-files/playtest-plan/` |

## Sync and app

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Sync code (encrypted, no account), link a device, change code | Live | #5 | `lib/synccode.test.ts`, `lib/sync.test.ts`, `lib/autosync.test.ts`, e2e "sync code" |
| Move from the old Supabase sign-in sync | Live | #5 | manual; Supabase removal waits for Guillermo's OK |
| Installable PWA, works offline for saved data | Live | v1 | manual |
| Card-spin loader | Live | #4 | manual |
| Haptics on mobile | Live | #6 | `lib/haptics.test.ts` |
| Pill nav, back arrow only where there's somewhere to go | Live | #6 | e2e "Pill menu" |
| Security headers (frame-ancestors) | Planned | #2 open | – |
| Card scanning | Parked | – | likely needs a paid service |

# Decisions

Choices agreed with Guillermo. Follow them; don't re-propose a rejected one without new evidence. Newest first.
Status: **decided** · **rejected** · **parked**. Deck-building engine decisions live in Deck Wizard's `CLAUDE.md`
(Decisions log) and apply here when its rules are ported.

| Date | Decision | Status | Notes |
|---|---|---|---|
| 2026-11-06 | Work rulebook: `CLAUDE.md`, `docs/FEATURES.md`, this file, PR template with Checks, browser checks required in CI | decided | Ideas adapted from the MIT [product-harness-starter](https://github.com/beamnxw/my_works). Skipped: separate planner/builder/evaluator sessions, a shared handoff file, evidence folders in git |
| 2026-11-06 | WILDCARD on by default, 1 slot, switchable per commander | decided | Shipped in #10 |
| 2026-11-06 | Power switch reads ALL · MIN · MED · MAX (MIN = B3, MED = B4, MAX = B5) | decided | ALL stays next to the others |
| 2026-11-06 | Dark mode only | decided | – |
| 2026-11-06 | No card titles outside cards; price and diamonds only on hover / select, inside the card | decided | – |
| 2026-11-06 | One filter / group / sort / view bar, the same on every page; search covers Oracle and reminder text | decided | – |
| 2026-11-06 | Each deck has its own colour; cards glow in the active deck's colour | decided | – |
| 2026-11-06 | Forge = a separate focus mode with a live suggestions panel; TO BUY = crumpled paper-ball button | decided | Plan: `/mnt/project-files/ui-review/forge-plan/` |
| 2026-11-06 | Punk decoration goes in the frame, never the content; check phone, tablet and desktop in every review | decided | Design advisor brief |
| 2026-11-06 | Playtesting comes much later | parked | Plan: `/mnt/project-files/playtest-plan/` |
| 2026-11-06 | EDHREC: personal, non-commercial use with per-user browser fetch, cache and credit; no paid tier and no public launch without EDHREC's written permission | decided | – |
| 2026-11-05 | Sync with an encrypted sync code instead of a sign-in; remove Supabase once every device has moved | decided | Shipped in #5; removal waits for Guillermo |
| 2026-11-05 | CollectionHub is the one app that stays; archive (never delete) DeckWizard and card-hunt after the brain moves here | decided | – |
| 2026-11-04 | Free and rule-based: no AI and no paid service at runtime | decided | – |
| 2026-11-04 | Keep the existing visual identity (Midnight Override, zine × punk look) | decided | – |
| 2026-10-12 | Decks are virtual and may share cards; warn when decks together need more copies than owned | decided | `lib/copies.ts`; physical reservations may come later only as an option |
| 2026-10-12 | Moxfield import = pasted text only (no API); prices are USD converted to CA$ | decided | – |

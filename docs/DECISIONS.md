# Decisions

Choices agreed with Guillermo. Follow them; don't re-propose a rejected one without new evidence. Newest first.
Status: **decided** · **rejected** · **parked**. Deck-building engine decisions live in Deck Wizard's `CLAUDE.md`
(Decisions log) and apply here when its rules are ported.

| Date | Decision | Status | Notes |
|---|---|---|---|
| 2026-11-07 | Collection and My decks headers: the flat overhaul ribbon wins over the boxed coloured chips and "arsenal console" pushed to main the same day; the sync panel and Discover eye from that push stay | decided | decision card, Nov 7 20:07 |
| 2026-11-07 | THE OVERHAUL (`docs/THE_OVERHAUL.md`) is the UI design system: frame loud, content quiet; screens move one at a time, old CSS deleted as each moves | decided | Phase 1 + 2 in the overhaul PR |
| 2026-11-07 | Forge stays in place as a mode; 48px top bar on desktop, compact bottom pill on phones | decided | – |
| 2026-11-07 | The other agent's pushes to main lead: merge main before each PR, keep its changes, update our tests and notes to match. When two choices can't both stand, ask Guillermo on a decision card and wait for his tap | decided | Guillermo, Nov 7 22:21 and 22:25 |
| 2026-11-07 | POWER lives inside the Bracket Fit tile (the other agent's change), not on the strip; the strip keeps deck cost · missing · ⚠ short | decided | Guillermo's decision card, Nov 7 22:20 |
| 2026-11-07 | Deck page: POWER sits on the strip only (not also in ⋮); themes and pins move behind ⋮; the one-time swap tip and the separate BUILD 100 / OWNED ONLY buttons leave the strip (both stay in ⋮ → CARDS) | replaced (Nov 7 22:20: POWER now lives inside Bracket Fit) | Guillermo, Nov 7: approved because it makes the page cleaner (one control in one place) |
| 2026-11-07 | UI choices follow one test: does it make the site clean and intuitive? Discover: sort and colour filters move behind ⋮ (the bar names the ones in use); commander tiles go flat (no tilt, tape or doodles) | decided | Guillermo, Nov 7: "make the site clean and intuitive"; Discover PR |
| 2026-11-06 | Paper-ball TO BUY and the price-tape unroll on hold until Guillermo says go | parked | 22:27 "hold this idea" |
| 2026-11-06 | Forge round: no FORGE IT button (first swap opens it; a saved deck opens in it); GEAR 1ST/2ND/3RD; POWER labels show B3/B4/B5; compact list is the phone default; TO BUY grouped by play rate; decks from Discover open at MED + $$$ | decided | Shipped in #17 / #20 |
| 2026-11-06 | Work rulebook: `CLAUDE.md`, `docs/FEATURES.md`, this file, PR template with Checks, browser checks required in CI | decided | Ideas adapted from the MIT [product-harness-starter](https://github.com/beamnxw/my_works). Skipped: separate planner/builder/evaluator sessions, a shared handoff file, evidence folders in git |
| 2026-11-06 | Copy reservations are optional per deck; shared (virtual) decks stay the default and `copies.ts` is unchanged | decided | Shipped in #12 |
| 2026-11-06 | EDHREC data goes through one adapter (`src/lib/sources/edhrec.ts`) | decided | Terms in `docs/data-sources.md` |
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

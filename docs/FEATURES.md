# Features

What exists, its status and what proves it. Read before starting work; update the row when a PR merges.
`docs/ROADMAP.md` keeps the original plan and history.

Status: **Live** (merged to `main`, CI green) · **Partial** (live, known gaps listed) · **Planned** · **Parked**
(waiting on Guillermo). "manual, no test yet" = works when checked by hand; add a test when it's next touched. Checked against `main` at e0ec5cb (2026-11-06).

## Collection

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Import: ManaBox CSV, any CSV, Moxfield / Archidekt / Arena text, plain lists; auto-detect | Live | v1 | `lib/importers.test.ts`, e2e "Import: when Scryfall stops answering" |
| Interface precision, step 1: every pop-up that opens under a button (the ⋮ options menu, bracket / salt / readiness notes) stays inside the screen on the smallest phones: it slides sideways by exactly what sticks out (one listener, `lib/onscreen.ts`) | Live | Phase 3 start | `lib/onscreen.test.ts`, e2e `popovers-onscreen.spec.ts` (320 and 360 px) |
| Copy-aware suggestions: a card you own whose every copy is already in another active deck is marked down (-0.3, stated) and the row says "all 1 copy is in <deck>"; a spare copy, a deck with its light off, or a card you don't own is untouched (Forge, swap windows, "why" lines) | Live | Phase 2 part 3 | `lib/copies.test.ts` (takenBy), `brain/synergy.test.ts` (copies), e2e "Forge: a suggested card whose every copy is in another deck" |
| Collection control strip: Search, Filter (colours, type, commanders / in a deck / not in a deck) and Sort in one bar; active filters show as removable chips with "Clear all" and "N of M cards shown"; on small phones search takes its own row | Live | Interface precision step 2 | `lib/collfilter.test.ts`, e2e `collection-strip.spec.ts` (3 sizes) |
| One-line card rows on phones: the deck page's COMPACT view shows each card on one line (art chip, ✓ name, mana pips, price, swap, ⋮), about 49 px a row instead of 92 px; type line and binder count hide there; LIST and GRID unchanged | Live | Interface precision (ManaBox idea) | e2e `oneline-rows.spec.ts` |
| Empty and error states: one shared "nothing to show" note with a way out. Collection search or filter with no match (CLEAR SEARCH AND FILTERS), Discover with no matching commander (CLEAR SEARCH AND COLOURS), and group by set when the set list cannot load (says so, TRY AGAIN, uses an older saved list when there is one) instead of "loading" forever | Live | Interface precision step 4 | e2e `empty-states.spec.ts` (3 sizes) |
| Control bar on Discover and the deck page: sort sits in the bar (Discover on every size, deck page on tablet and desktop); on Discover an active colour filter shows as a removable chip with "Clear all" and "N of M commanders shown". The ⋮ options are unchanged | Live | Interface precision step 3 | e2e `strip-decks-discover.spec.ts` |
| Jump rail (ManaBox idea): a slim column of section tags (CRE · INS · LND, mana values, EDHREC headers) beside the card list on the deck and commander pages, shown when there are 3+ sections; tap to land on that section (it opens if folded), the section on screen is lit. Sticky beside the list on tablet and desktop; pinned to the right edge on phones, only while the CARDS face is showing | Proposed (branch `claude/project-thread-xeb0dx`) | Interface precision step 4 | `views/JumpRail.test.ts`, e2e `jump-rail.spec.ts` (3 sizes) |
| Big collection import: Scryfall is asked at its own pace (2 heavy requests a second, one queue for the whole app); a refusal (429) or a dropped connection is waited out and retried by itself for minutes, with a note on screen, instead of ending the import; exact printings are kept after an outage; a big file is held aside from the text box | Live | import fix, Nov 12 | `lib/scrynet.test.ts`, `lib/importers.test.ts` (100,000 rows), e2e "Import: a big collection file goes in in one go", "Import: when Scryfall stops answering" |
| First visit: an empty binder's import box offers a sample collection (60 common cards, three commanders); it only fills the box | Live | newcomer PR, Nov 11 | e2e "First visit: an empty binder offers a sample collection" |
| Name-only imports get the cheapest paper printing with a price | Live | #11 | manual, no test yet |
| Two binders (profiles), each with its own cards and decks | Live | v1 | `lib/compare.test.ts` |
| Collection grid / list, by set, quantity edit, tiles with copy pips and price sticker | Live | #6, #8 | e2e "Collection: counters, widget, grid tiles" |
| One toolbar: search (name or rules text), group, sort, filters, view | Live | #6 | `lib/search.test.ts`, `lib/arrange.test.ts`, e2e "Nov 6 batch" |
| Prices: your printing for owned cards, cheapest paper printing for missing; fetch dates shown | Live | 3a.3 | `lib/pricewatch.test.ts` |
| Rotating top-3 widget (most valuable, risers / fallers) from daily snapshots | Live | 3a | `lib/pricewatch.test.ts` |
| BANNED tape for cards not legal in Commander | Live | #11 | manual, no test yet |
| Filters: colour, type, rarity, MV, price, foil, in deck / not in deck | Partial | – | some live via the toolbar; full set not done |
| Per-entry language, condition, other finishes | Planned | – | – |
| Custom lists inside a binder (trade, wishlist, sell…): list tabs, MOVE TO LIST… in the card menu | Partial | 61c46e7 (pushed to main) | no test yet |
| More binders + the Unassigned Cards binder: deleting a binder releases its cards there; the binder stays open after a reload; DELETE shows only with two real binders | Live | 61c46e7, 97f0ab5, review fixes Nov 11 | `lib/ownership.test.ts` "Saved binder" |
| Deck page ownership line (N to buy · N in the other binder · N in this deck): copies from both binders add up; basic lands are never "to buy" | Live | 97f0ab5, review fixes Nov 11 | `lib/ownership.test.ts`, e2e "Saved deck (overhaul)" |
| Deck history: a snapshot before every change (30 per deck, this device only, not synced), restore from the deck menu | Partial | 97f0ab5 | `lib/ownership.test.ts` "Deck Snapshot History" |

## Discover and commander page

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| Commanders in your binder, ranked; search any commander | Live | v1 | e2e "Discover (overhaul)" |
| Overhaul phase 3, Discover: loud frame (ransom title, the eye, tagline, "N DECKS" answer), one toolbar (search, Enter opens; SORT and COLOUR behind ⋮, chosen ones named on the bar), flat commander tiles (art, name + pips, match % + green meter, decks · price, READY / N MISSING), two across on phones | Live | #24 | e2e "Discover (overhaul)", "Title answer" |
| Overhaul phase 4, Collection: loud frame (ransom title + binder tag), one ribbon (N cards · N unique · N commanders · ≈CA$ worth · N decks, + DECK, IMPORT) that stays when the overview opens; your decks and a flat import underneath; the stat tiles and appraisal slip that repeated the numbers are gone | Live | #25 | e2e "Collection (overhaul)", "Import: when Scryfall stops answering" |
| Overhaul phase 5, saved deck + My decks: the saved deck uses the commander page's hero (ransom name, one red slash, meta line with salt and bracket, match % once, Readiness / Bracket Fit) and strip (deck cost · what's missing · ⚠ short); the side panel is flat (Forge meters, then DETAILS: the read, types, colour pips, note and tags). My decks: one ribbon of facts, flat tiles like Discover's, flat add form; the My decks shelf is flat too | Live | #26 | e2e "Saved deck (overhaul)", "My decks (overhaul)" |
| Decks overview: same Collection-vibe stat tiles (4 tiles + colour pip strip, zine cards, HIDE/SHOW STATS toggle), REROLL green / OFF red on WILDCARD, swap pin buttons coloured (ALWAYS IN green, NEVER USE red) | Live | claude/spacing-composition-nov11 | `e2e/workbench-features.spec.ts` "HIDE STATS button" |
| Commander stats cached on the device (no EDHREC reload on app start) | Live | #3 | `lib/cmdrstats.test.ts`, e2e "Reload: commander stats come back from the device" |
| Saved commander page shows at once even when EDHREC is down | Live | #3 | e2e "an old saved page shows at once" |
| Commander page: sections in order with count + cost, grid / list, tags, Built around | Live | #6 | e2e "Commander page (Discover): sections in order", "Deck page (overhaul)" |
| Overhaul phase 2, deck page: hero (ransom name, one red slash, meta line, match % once, Readiness / Bracket Fit), one strip (status + deck cost · ⚠ short · TO BUY / PULL · FORGE), one toolbar (themes and pins behind ⋮), flat grid; TO BUY / PULL is a 360px drawer (bottom sheet on phones) | Live | #21 (POWER moved into Bracket Fit by the other agent, Nov 7) | e2e "Deck page (overhaul)", "B: the TO BUY receipt", "TO BUY groups" |
| POWER ALL · MIN · B3 · MED · B4 · MAX · B5 | Live | #6, #20 | e2e "Commander settings on a wide screen", "A + D" |
| GEAR 1ST · 2ND · 3RD (EDHREC budget / every budget / expensive); decks from Discover open at MED · 3RD | Live | #17, #20 | e2e "A + D" |
| Pins drive EDHREC's filter (first 2 📌 as in=, first 2 💀 as out=; under 20 decks falls back) | Live | #20 | `lib/pins.test.ts`, e2e "Pins drive EDHREC" |
| Pins and taste memory stay in step: the memory holds what is pinned now, so a pin you undo leaves nothing behind and a pin is never counted twice; the card menu on a deck page records pins like the swap window does | Live | #63 | `brain/brain.test.ts` "a pin you undo leaves nothing behind" |
| Coverage line, PREFER OWNED, BUY UNDER CA$N (OWNED ONLY removed Nov 7; a saved OWNED ONLY falls back to PREFER OWNED) | Live | #17, #28 | `brain/modes.test.ts`, e2e "A + D" |
| TO BUY receipt: PULL list + PRINT on the back; grouped by EDHREC play rate, cheapest first, GC / COMBO marks | Live | #17, #20 | `brain/modes.test.ts`, e2e "B: the TO BUY receipt", "TO BUY groups" |
| Build Readiness + Bracket Fit tiles, "Why this card?" in the swap window | Live | #17 | `brain/validate.test.ts`, e2e "Readiness + Bracket Fit tiles" |
| EDHREC With / Without card filter, self-testing with honest fallback | Live | #6 | e2e "EDHREC With / Without card" |
| Stand-ins ranked by EDHREC lift | Live | #7 | `lib/subs.test.ts` |
| Partner and Background commanders | Live | #7 | `lib/commander.test.ts` |
| WILDCARD: one seeded pick with evidence per commander, reroll, off per commander | Live | #10 | `brain/brain.test.ts` |
| IV+ stamp on decks forged from cEDH data | Live | #11 | manual, no test yet |
| Colour identity is a hard rule on every suggestion path | Live | #16 | `brain/round2.test.ts` |
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
| Full Forge: focus mode + top bar (undo, save, leave, RESERVED), ANALYSIS meters, live suggestions (OUR PICK / EDHREC LIFT / POPULAR, needs + theme chips, own-card search), tap-tap and drag incl. touch, phone bottom sheet, TO BUY pane | Live | #20 | `brain/brain.test.ts` (theme part), `e2e/forge.spec.ts` |
| Forge cube on phones: CARDS · ANALYSIS · TO BUY tabs swipe horizontally; deck grid becomes a snap-scroller with a sticky tablist; BuyList face shows unowned cards cheapest first with shop links | Live | claude/spacing-composition-nov11 | `e2e/workbench-features.spec.ts` "Forge cube on phones" |
| Suggestions count lands as a need: a deck short of lands for its size and bracket values a land ("fills lands"), a deck at the top of the range doesn't | Live | newcomer PR, Nov 11 | `brain/brain.test.ts` "a full deck short of lands values a land" |
| Synergy without popularity (overhaul phase 2): every card is read for what it makes and what it cares about on 16 engines (tokens, sacrifice, graveyard, discard, counters, life gain, spells, artifacts, enchantments, lands, blink, combat damage, top of library, mana, draw, auras / equipment) plus creature types; a suggestion says "feeds <commander>: discard" or "pays off the deck's 14 tokens cards", so an owned card EDHREC doesn't list can win | Live | phase 2 part 1, Nov 11 | `brain/synergy.test.ts`, `tests/bench/suggest.test.ts` |
| Suggestion benchmark: 10 spells hidden from each of 48 real decks, found again in the top 10 picks 54% of the time with popularity evidence (was 49%) and 30% with none (was 10%) | Live | phase 2 part 1, Nov 11 | `tests/bench/suggest.test.ts`, `tests/bench/suggest-baseline.json` |
| Bracket rules beyond combos: below bracket IV a mass-land-denial card or a third extra-turn card is marked blocked and never auto-picked | Live | phase 2 part 1, Nov 11 | `brain/synergy.test.ts` "bracket rules beyond combos" |
| Deck session (`brain/session.ts`, overhaul phase 2): one read of a deck gives its needs, the next picks, the weakest cards (never the commander, a land, a pinned card or a combo piece), and upgrades (an owned card that does the same job and scores clearly higher); a card holding up a short role is only offered as a swap | Partial | phase 2 part 2, Nov 11 | engine and tests live (`brain/session.test.ts`, `tests/bench/suggest.test.ts` cuts); no screen shows cuts and upgrades yet (phase 3) |
| Overhaul phase 6, Forge: flat top bar (SAVE primary, LEAVE / UNDO ghost), suggestions panel on carbon with the overhaul tokens (segmented sorts and tabs, flat chips and rows), same phone bottom sheet | Live | #27 | e2e "Forging zone", `e2e/forge.spec.ts` |
| Swap window "in <deck>" chip | Live | #17 | `brain/modes.test.ts` |
| ONLY filter: Game Changers, CA$ price bands (both deck pages) | Live | #20 | `lib/arrange.test.ts`, e2e "ONLY" |
| Compact list (name · mana · price · owned), default on phones | Live | #20 | e2e "Phones start on the compact list", "Compact list: names stay readable" |
| Export: Moxfield .txt, Copy for MTG Arena, CSV | Live | #20 | `lib/export.test.ts` |
| Swaps keep the deck organised by type | Live | #6 | `lib/sections.test.ts`, e2e "Swapping keeps the deck organised" |
| Bracket estimate with reasons; combo-aware (Spellbook two-card combos) | Live | #7 | `brain/brackets.test.ts` |
| Card roles from Scryfall Tagger (ramp, draw, removal…) | Live | #7 | `brain/roles.test.ts` |
| Salt (EDHREC top 1,000) | Live | 2026-10-12 | `lib/salt.test.ts` |
| Legality and completeness checks (100 cards, singleton, colour identity) | Partial | – | banned cards flagged (#11); the rest not done |
| Physical copy reservations (optional per deck: shared or reserved; shared stays default), copy status per deck | Live | #12, #14 | `lib/allocation.test.ts` |
| Deck generation modes: Prefer owned / Budget | Partial | #17 | PREFER OWNED / BUY UNDER live on commander pages; OWNED ONLY removed Nov 7 (the brain's `ownedOnly` stays, unused) (`brain/modes.test.ts`) |
| Playtesting (draw 7, mulligan, turns) | Parked | – | Guillermo: "much later"; plan in `/mnt/project-files/playtest-plan/` |

## Sync and app

| Feature | Status | PR / commit | Proven by |
|---|---|---|---|
| EDHREC behind one adapter, its terms in `docs/data-sources.md` | Live | #12 | `lib/sources/sources.test.ts` (no other file calls EDHREC) |
| Clean-up round: one slim tool bar, binder menu, Collection fold, no hamburger | Live | #15 | e2e (updated in #15) |
| Sync code (encrypted, no account), link a device, change code | Live | #5 | `lib/synccode.test.ts`, `lib/sync.test.ts`, `lib/autosync.test.ts`, e2e "sync code" |
| Move from the old Supabase sign-in sync | Live | #5 | manual; Supabase removal waits for Guillermo's OK |
| Installable PWA, works offline for saved data | Live | v1 | manual |
| Card-spin loader | Live | #4 | manual |
| Haptics on mobile | Live | #6 | `lib/haptics.test.ts` |
| Pill nav, back arrow only where there's somewhere to go | Live | #6 | e2e "Pill menu" |
| Overhaul nav: 48px top bar on tablet and desktop (logo · DISCOVER DECKS COLLECTION · ⚙ sync), 40px bottom pill on phones | Replaced | #21 | Replaced on main (Nov 7, commits 4c2b784 and 76145d2, not a Claude thread) by a "Dynamic Island" notch at the top on every width; e2e "Pill menu", "Cohesive UI overhaul" |
| Overhaul phase 1: tokens (one colour one meaning, 4·8·12·16·24·32·48 scale) and the 7 parts in `src/ui.css` + `views/parts.tsx` | Live | #21 | `lib/parts.test.ts` |
| Security headers: Content-Security-Policy (only our own code and the named data sources load), no framing, no MIME sniffing, strict referrer, HSTS; `vite preview` serves the same headers so every browser check runs under the live policy | Live | security-first PR, Nov 11 (replaces #2) | `e2e/security.spec.ts` |
| Sync server limits: 120 saves per sync code per 10 minutes, and per-address limits at Cloudflare's edge (240 reads, 60 writes a minute); the app says sync is busy and retries | Live after the Worker is redeployed (`npx wrangler deploy` in `worker/`) | security-first PR, Nov 11 | `worker/sync.test.ts` |
| Foil cards look and move like real foil: prismatic shine on the picture and frame, a light band sweeping across, glare that follows a finger or mouse; name, mana and rules text stay crisp; still when motion is reduced | Live | #52, #53 | `e2e/card-integrity.spec.ts` |
| Collection card menu: MARK AS FOIL / MARK AS NON-FOIL (one copy moves between the foil and non-foil rows; copies never change) | Live | #53 | `e2e/foil-toggle.spec.ts` |
| Commander card stays whole: the OPTIONS tag hangs under it, nothing on the mana cost or rules text | Live | #51 | `e2e/card-integrity.spec.ts` |
| Discover sort box shows the whole sort name; phones keep one slim bar with sort behind ⋮ | Live | #50 | `e2e/strip-decks-discover.spec.ts` |
| One-line compact rows on phones; jump rail stays off the deck header | Live | #47, #49 | `e2e/oneline-rows.spec.ts`, `e2e/jump-rail.spec.ts` |
| One number per fact: one ownership count everywhere (copies, commander included), READY only for build checks (ownership says ALL OWNED), My Decks bracket uses Game Changers, Collection tabs count copies, Discover tile says it measures the average deck | Live | #56 | `e2e/numbers-agree.spec.ts`, `src/lib/cmdrstats.test.ts`, `src/brain/modes.test.ts` |
| One sheet: on phones the ⋮ options, card menu and deck menu open as the same bottom sheet as Collection's filter (title, 44px ✕, thumb-sized controls, page dimmed, island steps away); wider screens keep the popover | Live | #58 | `e2e/one-sheet.spec.ts` |
| Active settings as chips: what narrows a commander page or deck page shows under the bar as removable chips with Clear all | Live | #59 | `e2e/active-chips.spec.ts` |
| Options sheet and chips read in full on phones (phase 2 follow-up): PIN and WITHOUT hints fit (PIN beside APPLY, WITHOUT on its own row), the theme row fades on the right to show it slides, the ⋮ button names the gear only (theme, pins and filters are chips), chips sit on one sliding row at 44px with Clear all in reach, tick boxes are 24px on a 44px row | Live | #64 | e2e `sheet-polish.spec.ts` |
| Readable names and a quieter deck page on phones: no card or deck name under 14px; the saved deck's swap how-to line leaves after the first swap on that device | Live | #62 | `e2e/names-and-hint.spec.ts` |
| 44px tap targets on phones: every button, tab, select and section header on the main screens is at least 44px to tap (jump rail widened by an invisible strip; small theme badges on My Decks tiles are the known gap) | Live | #61 | `e2e/tap-targets.spec.ts` |
| 44px tap targets inside pop-ups on phones: option pickers on the commander page, deck chips in the card menu, the ✕ of the swap window and import pop-ups, binder menu rows, the deck menu's colour dots and custom shade (theme badges on My Decks tiles stay the known gap) | Live | #77 | `e2e/tap-targets-popups.spec.ts` |
| Collection HIDE STATS: the stat tiles, appraisal and Top 3 fold away behind one button (folded at first since Nov 13, remembered per device) so cards reach the first phone screen; + DECK and IMPORT stay | Live | #60 | `e2e/collection-stats-fold.spec.ts` |
| Collection and My Decks: the stat tiles start folded; SHOW / HIDE STATS sits on the row of + DECK / IMPORT (Collection) and + NEW BLANK DECK / IMPORT DECK (My Decks), 44px tall, in line with them | Building | this PR | `e2e/collection-stats-fold.spec.ts`, `e2e/workbench-features.spec.ts` "Decks overview" |
| Island clear lane, thin side bar and smoother motion (phase 4 step 2): on the left or right edge the island is a 46px bar with the names running down it and the page keeps a 46px lane free (the phone jump rail moves in beside it); a top dock never sits on content at a page start, a bottom dock never at a page end (at the very top it covers until the first scroll, Guillermo's pick); soft spring motion, light edge shadow, see-through while the page moves; picked up it stays a lifted capsule that follows the finger, and it glides to its new edge when let go | Live | #68 | e2e `island-lane.spec.ts` |
| Island and other floating things (phase 4 step 4): the swap window sends the island away on every edge, sheets fade it on the top and side edges (a bottom dock still slides away); a top-docked island never covers the Forge bar (the bar moves under it below 1100px wide); on phones the Forge suggestions sheet peeks above a bottom-docked island | Live | #67 | e2e `island-clear.spec.ts` |
| Island tap areas on phones (phase 4 step 3): back, DISCOVER, DECKS, COLLECTION and the sync light each answer a tap across 44px (stacked docks: 44px sideways), the sync panel ✕ too; nothing changes in the look or the island height; the grip line stays the drag handle | Live | #66 | e2e `island-taps.spec.ts` |
| Island rests only where its own edge has room (phase 4 step 1): a top or side dock shows at the start of a page, a bottom dock at the start and the end; elsewhere it follows the scroll (away going down, back going up). Fixes a top-docked island landing on + DECK and IMPORT at the end of Collection | Live | #65 | `lib/island.test.ts`, e2e `island-edges.spec.ts` |
| Card scanning | Parked | – | likely needs a paid service |
| Search your own cards while building a deck: + MY CARDS on the deck bar (saved deck and commander page) opens the Forge on its MY CARDS search, focused; the search covers every card of yours that can go in the deck (in the colours, not already in it), past the OWNED / NOT OWNED tab, role and theme chips, up to 60 matches; + ADD on a saved deck, tap-then-tap swap on the commander page; matching cards that can't go in are named with the reason (already in the deck, outside the colours, NEVER USE) | Live | #72 | `lib/collsearch.test.ts`, `e2e/my-cards-search.spec.ts` |
| Cards open as a grid everywhere; grid / list / compact and SIZE on the bar at every width (phones: own row on deck pages, 44px controls; Collection gets list / grid on phones for the first time); phone grid 3 across at M like ManaBox (S 4, L 2); every card section a full-width block with rows that wrap to the width (S / M / L smallest card widths 124 / 168 / 236px); MISSING is a label under the card, never on its picture; pin chips take their own row | Live | #69 | `e2e/view-on-bar.spec.ts` (grid start, controls reachable and 44px, SIZE steps, old setting ignored once, sections full width, card shape kept, 320 and 360px), `e2e/forge.spec.ts` "Every screen starts on the card grid" |
| Phone deck bar: ⋮ and the search always share the first row (view and SIZE on the second), never three rows | Live | #74 | `e2e/bar-row.spec.ts` |

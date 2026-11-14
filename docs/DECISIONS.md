# Decisions

Choices agreed with Guillermo. Follow them; don't re-propose a rejected one without new evidence. Newest first.
Status: **decided** · **rejected** · **parked**. Deck-building engine decisions live in Deck Wizard's `CLAUDE.md`
(Decisions log) and apply here when its rules are ported.

| Date | Decision | Status | Notes |
|---|---|---|---|
| 2026-11-11 | The comprehensive overhaul runs in five phases (audit, brains, design system, symbiote island, performance + sync + security hardening), each on a preview and merged only on Guillermo's OK; the small security fixes (headers, sync rate limits) go first. Brain stays rule-based. A new host the app talks to must be added to the Content-Security-Policy in `vercel.json` | decided | Guillermo, Nov 11 18:34; audit: claude.ai/artifact/Ht3ZfF72icsmvzkn8awwiL |
| 2026-11-11 | Forge on phones: deck area is a horizontal swipe cube — CARDS / ANALYSIS / TO BUY — driven by a sticky tablist (`.fcube`); no visual difference on tablet/desktop where both panels stay side by side | decided | claude/spacing-composition-nov11 |
| 2026-11-11 | Decks overview uses Collection-style zine stat tiles (same card shape, tilts, shadow) with a HIDE / SHOW STATS toggle; My decks no longer uses a flat ribbon for the stats area | decided | claude/spacing-composition-nov11 |
| 2026-11-11 | WILDCARD buttons: REROLL is green, OFF is red — coloured so they read without reading | decided | claude/spacing-composition-nov11 |
| 2026-11-11 | Swap window pin buttons: ALWAYS IN is green, NEVER USE is red | decided | claude/spacing-composition-nov11 |
| 2026-11-11 | Collection header: the Nov 8 look stays (tilted stat tiles, appraisal slip, tape). This replaces the Nov 7 "flat ribbon" choice for the Collection page only; My decks keeps the flat ribbon | decided | decision card, Nov 11 14:38 |
| 2026-11-07 | Collection and My decks headers: the flat overhaul ribbon wins over the boxed coloured chips and "arsenal console" pushed to main the same day; the sync panel and Discover eye from that push stay | decided | decision card, Nov 7 20:07 |
| 2026-11-07 | THE OVERHAUL (`docs/THE_OVERHAUL.md`) is the UI design system: frame loud, content quiet; screens move one at a time, old CSS deleted as each moves | decided | Phase 1 + 2 in the overhaul PR |
| 2026-11-07 | Forge stays in place as a mode; 48px top bar on desktop, compact bottom pill on phones | decided | – |
| 2026-11-07 | The other agent's pushes to main lead: merge main before each PR, keep its changes, update our tests and notes to match. When two choices can't both stand, ask Guillermo on a decision card and wait for his tap | decided | Guillermo, Nov 7 22:21 and 22:25 |
| 2026-11-07 | OWNED ONLY deck option is dropped (the other agent removed it); PREFER OWNED is the only mode, and a device that had OWNED ONLY saved falls back to it | decided | Guillermo's decision card, Nov 7 23:13 |
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

## 2026-11-12: Foil and card integrity
- Foil cards must look like real foil and move (sweep, drifting rainbow, glare follows the pointer). The shine goes on the picture and the frame border only; the name, mana cost, type line, rules text and set line are never covered (Guillermo's "sacred card rule").
- Fonts and red were audited on every main screen and match the Midnight Override spec: 4 text fonts plus the ransom-letter kit, red only on the frame, the main button and the active tab. No font or red cleanup is wanted.

## 2026-11-13: One number per fact (audit roadmap, phase 1)
- Ownership is counted one way on every screen (`lib/deckshare.ts` `ownShare`): copies you own out of the deck's copies, the commander included, basic lands counted as owned. Discover tiles, the commander page, saved decks and My Decks all use it.
- The word READY belongs only to the build checks (readiness n/12). Owning every card says ALL OWNED; My Decks says "all owned", and its "unique cards in play" tile names its unit.
- My Decks works out a deck's bracket with the Game Changers list, like the deck page.
- Collection counts copies in its tiles, its list tabs and its "shown" line.
- The commander strip no longer repeats how many cards come from your binder; it only adds stand-ins from swaps.
- Correction to 2026-11-12: red is used for more than the frame, the main button and the active tab (Creative Director audit, 2026-11-13). Red clean-up is planned in a later phase.
- A Discover tile measures EDHREC's plain average deck (quick for 288 commanders) and says "decks avg"; the commander page labels its own number "in this deck" (the deck it opened, at your power and theme). Guillermo's pick, 2026-11-13.

## 2026-11-13: One sheet and one chip strip (audit roadmap, phase 2)
- On phones (under 700px) every options list and card or deck menu is a bottom sheet shaped like Collection's filter sheet; each keeps its own content. Tablet and desktop keep popovers under their buttons.
- While a sheet is open the page behind it can't be tapped; ✕, Escape, a tap on the dimmed page or ⋮ again closes it. The island steps off screen while a sheet is open.
- Theme chips keep their one sideways-scrolling row, also inside the sheet.
- A setting that narrows a page is never hidden behind ⋮: it shows under the bar as a removable chip (`SetChips`), with Clear all when there is more than one.

## 2026-11-13: Saved deck page keeps its header (audit roadmap, phase 3)
- Guillermo's pick: on phones the saved deck header (commander card, title, match %, the three tiles) stays as designed even though cards start just below the first screen; it is not shrunk and the page does not open scrolled past it. The swap how-to line shows only until the first swap on that device.

## 2026-11-13: Collection keeps its tiles, with HIDE STATS (audit roadmap, phase 3)
- Guillermo's pick: Collection's stat tiles stay as they are and show by default; a HIDE STATS button (the same control as My Decks) folds the tiles, the appraisal and Top 3 so cards reach the first phone screen. The choice is remembered per device. No ribbon.

## 2026-11-13: Cards open as a grid, and the view controls stay on the bar
- Guillermo's call: cards open as a grid at every screen size, phones included. This replaces "compact list is the phone default" (2026-11-06). The view is remembered per device under a new key (`ch:cardview`), so a phone that was on the old default starts on the grid once and then keeps what its owner picks.
- Grid / list / compact and SIZE sit on the bar itself at every width. On phones they have their own row under the search on deck pages (so the bar is two rows there, replacing "one slim row" for phones only) and join the second row on Collection. They are never moved into ⋮ again: twice that read as "lost".
- Phone grid sizes follow ManaBox: S = 4 across, M = 3 across (the start), L = 2 across, on Collection and on decks.
- Card sections (Creatures, Instants, Lands …) are each a full-width block on every screen, "as clean as Moxfield": a header row, then cards in rows that wrap to the width. Small open sections no longer share a row on wide screens. Each SIZE has a smallest card width (S 124px, M 168px, L 236px above phone width), so the grid adds or drops columns and never squeezes a card.

## 2026-11-13: Your own cards, not only suggestions, while building a deck
- Guillermo's ask: while building a deck he searches his own collection and adds his own cards. This extends the Forge's Live Suggestions search rather than adding a second search: + MY CARDS on the deck bar opens it. The search looks at every owned card that can legally go in (colour identity stays a hard rule), past the suggestion filters, and names matching cards it can't offer with the reason, so a card he knows he owns never just goes missing.
- The commander page still swaps (its deck stays at 100 cards); a saved deck adds.

## 2026-11-13: Dynamic Island stays floating, side docks are a thin bar (audit roadmap, phase 4)
- Guillermo's picks: the island keeps floating (no solid strip); it slides away going down and comes back going up. At the very top of a page a bottom-docked island covers the last row of the first screen until the first small scroll ("Keep it, covers until you scroll").
- On the left or right edge the island is a thin 46px bar, the same slim shape as the top and bottom island, with the section names running down it; the page keeps a 46px lane free on that side.
- Motion: one soft spring in and out (no bounce), a light edge shadow so it reads as part of the page, and see-through with a blur while the page is moving under it; solid again at rest.

## 2026-11-14: No personal card list in the repo
- Guillermo's call: his own ManaBox collection CSV is removed from `legacy/DeckWizard/` ("every user will have something different"); `.gitignore` keeps personal lists out from now on. Git history is not rewritten. The MIT sample list in `reference/` stays, and the app's built-in sample collection is unaffected. He will rotate the old OAuth secret later.

## 2026-11-14: Stat tiles start folded, one row of controls
- Guillermo's ask (Nov 13): on Collection and My Decks the stat tiles start hidden, and the SHOW STATS button sits beside Import / Add deck so the section reads as one piece. A device that already chose HIDE or SHOW keeps its choice.

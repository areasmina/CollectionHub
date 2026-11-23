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

## 2026-11-14: Search stays in reach (ManaBox benchmark)
- Guillermo's ask: a site as clean, fast and easy as ManaBox, with proper search and filter bars. On Collection, Discover and My Decks the search bar (with filter and sort) stays pinned at the top while the page scrolls; a top-docked island pushes it down rather than covering it. Every search box carries a magnifier. My Decks' bar is two slim rows. Approved and live (#79).
- The Midnight Override look (colours, type, zine marks) is kept exactly as it is through UX work: nothing visual changes unless Guillermo asks (his words, Nov 14: "remember our original graphic design… I don't wanna lose it").
- Collection filters add mana value, price per copy and foil, in the same Filter sheet with removable chips. Price bands are ≈CA$ per copy at your own printing and finish (under 1, 1 to 5, 5 to 20, 20 and up); a card without a price never passes a price band. Rarity waits: storing it changes the saved card data, so it needs his OK first.


## 2026-11-14: Header links and the OPTIONS tag (Guillermo)

- Outside links (EDHREC, COMBOS, ARCHIDEKT) stay together as one group, in that order, on their own row at the end of the
  header line, on the commander page and on every saved deck.
- The ⋯ OPTIONS tag "should be and act like the price tag in the collection": same yellow torn tape and type as
  Collection's price, same peel. Nov 15 he placed it: smaller, on the commander card's corner, usually hidden,
  showing when the card is pointed at or selected. This replaces "hang under the card" (Nov 13); the tag sits above the
  corner so only the card's outer border is under it (the card's text stays uncovered). Later the same day: top-left
  corner, typewriter gritty font (Special Elite).
- Deck strip on phones: deck cost first, TO BUY on its own row, BEST FOR MY CARDS and FORGE side by side as equals.
- Saved-deck hero: underscores in a deck name show as spaces in the ransom title; ACTIVE sits under the name, off the slash.

## 2026-11-15: Header tiles, collection stats, swap list, Forge bar (Guillermo)

- READINESS, BRACKET FIT and SALT LEVEL are always three equal tiles. Dropdowns (salt list) open above everything.
- Collection stats on phones: cards, unique and commanders as one even row of three; no full-width banner.
- No carousel diamonds (Forge CARDS · ANALYSIS · TO BUY tabs, Collection highlights): the labels already say where you are.
- Swap window picks: name, then EDHREC lift and play rate as numbers, then at most two reasons in words. Combo notes stay.
- The Forge bar has no deck name: one clean line, FORGE · UNDO · SAVE · LEAVE (the page already names the deck).

## 2026-11-15 (later): Collection opens on the cards, and less of everything else (Guillermo)

- **Collection is the promise of the app, so the cards come first.** The page opens on a CARDS tab, every time; the
  stat tiles, Top 3 and the charts live on an ANALYTICS tab beside it. + DECK and IMPORT sit on the tab row, reachable
  from either tab. This replaces the SHOW / HIDE STATS fold (Nov 13): the tab is the fold now, and there is no second
  ANALYTICS button inside it.
- The analytics cards wear the same frame as the stat tiles: ink, halftone dots, hard shadow, a slight tilt, Anton
  headings on a red rule. No heading or totals line inside the panel, because the tab and the tiles already say both.
- The list ribbon (ALL / UNLISTED / + NEW LIST), the search bar and the view row are one block, not three.
- **No redundancy unless it earns its place.** A missing card in a deck carries no MISSING label: it is already black
  and white and dimmed. Screen readers still hear "(missing)".
- Rarity joins the Collection filter sheet (Common, Uncommon, Rare, Mythic). A card cached before rarity was stored
  simply is not placed yet; it fills in on its next price refresh, and no card ever leaves the binder.
- The Dynamic Island is frosted glass by default: semi-transparent, matte, a single soft gloss along the top edge,
  rather than pure black. Its shape, moves and content are unchanged.
- The Forge section rail is ManaBox-like: icons instead of CRE / INS / SOR, a narrower lane, see-through, and dormant
  until the list moves (it wakes on scroll, hover or focus, then fades). The letters stay for screen readers.
- The Forge toolbar takes the shape it has on phones whenever the card list shares the width: ⋮ · search · sort on one
  row, the chips, view buttons and SIZE on a quiet row under it that slides sideways, with a soft edge where it carries
  on. Nothing overlaps the ⋮ or the search any more.
- The deck header closes up a notch around the ACTIVE badge: name, badge, facts and links read as one block.
- My Decks: SIZE joins the filter row instead of floating over the decks, a deck tile keeps its facts and its owned
  mark on one line, tags to one line, and NOT LEGAL becomes a tape on the card's corner.

## Nov 15, round 3 (Guillermo's five screenshots)

- **The Forge bar and the deck tabs pin as one block.** The bar used to pin the moment you scrolled while the tabs
  pinned later, so for a few pixels of travel the deck's cost line slid through the window between them, which read as
  a broken second bar. The cost line now sits above the bar and scrolls away behind it.
- **No play rate under a card, in any view.** The number still orders the page and still shows where it is the point
  (the swap picker, TO BUY). A card's own line is just its copies.
- **The card ⋮ is opaque and sits at the card's right border**, just noticeable: three dots on a 22px strip of ink, with
  the full 44px tap area kept.
- **Collection opens as one block, ManaBox style.** On a phone the ransom title takes the size the screen can spare and
  the binder tag moves up beside it (the word BINDER above it only said the same thing twice); the tabs, the list
  ribbon and the search / view rows share one frame divided by hairlines. Every control stayed; the cards start higher.
- **The two faces of Collection swipe**, the same move as the Forge's. A swipe is a shortcut, never the only way: both
  tabs stay on screen, and the first time a binder opens on a device the tabs lean once and say "swipe". A tap on
  either tab, or one swipe, and the hint never comes back. Crossing gives the usual select tick.
- **The island is really glass now**, and the sync panel is a bubble of the same glass with a tail into the bar: the nav
  and each docked shape no longer paint solid black behind the frosted pane.
- **The section rail floats over the cards**: no reserved lane, see-through, and barely there until the list moves.

## Nov 15, round 4 (the Forge bar and the suggestions)

- **The Forge bar is as tall as the buttons it holds** (46px on a phone, 48 elsewhere), not a band of empty ink.
- **The suggestions sheet peeks as one row.** The empty pull strip is gone: the handle sits on the tab row itself, in
  the gap between SUGGESTIONS and TO BUY, still a 44px pull, with a small arrow saying which way it goes.
- **Suggestions are cards you own, full stop.** The ALL / OWNED / NOT OWNED tabs are gone: the Forge builds from your
  binder, and what you don't own is TO BUY's job. The line under the title says "N of your cards fit", so the panel
  says what it is rather than only how many.
- **Every search reads name, type line and rules text, reminder text included.** Collection, deck pages, the Forge and
  the swap picker already did; Discover's commander search matched names only and now matches the same three.

## Nov 15, round 5 (the options sheet and the Collection top)

- **The options sheet is one panel in one language.** The row of three dropdowns at its foot (SORT / SHOW / ONLY) spoke
  a different language from the chips and tiles above it and repeated controls that are already on the bar. Every
  setting in the sheet is now a line of chips that scrolls sideways, so the panel reads top to bottom as one list.
- **A setting is never in two places at once.** SHOW (ALL / OWNED / MISSING) is the bar's own buttons wherever the bar
  has room for them, and appears in the sheet only on a phone, where those buttons are hidden. The deck page's ONLY
  follows the same rule. SORT and ONLY on the commander page were the settings that lived nowhere else; they stayed.
- **APPLY is the sheet's footer, not a button beside a field.** It sits on the bottom edge, the width of the panel,
  and stays there while the options scroll; CLEAR sits beside it when there is something to clear. On wide screens,
  opening the options first pins the bar to the top, so the panel always has the whole screen under it.
- **The Collection top is four lanes of one height**: tabs with + DECK / IMPORT, the list ribbon, the search, the tool
  row — flush inside the one frame, hairlines between them, and the sort takes the empty end of the tool row so its
  words read in full. The cards start about 38px higher again, which is ManaBox's density.
- **The first-run swipe tag has its own strip.** With the lanes flush it had nowhere to hang without covering IMPORT,
  so while it shows, the tabs lane opens a 22px strip for it; the strip goes with the tag, for good, after one use.

## Nov 15, round 6 (desktop: the space, the deck header, the two side panels)

- **The stage follows the screen.** Above 1200px the page is no longer pinned to a 1640px column: it takes the viewport
  minus a 56px gutter on each side, up to 2280px. A 1920 screen gains about 170px of usable width and a row of the
  binder fits ten cards instead of nine; a 2560 screen gains 640px and fits thirteen. Phones and tablets are untouched.
  The decorative sheets, sprays and sprues sit behind the page, so they cost no usable space.
- **Changing a copy count keeps the card's own look.** The − / + editor is the same ink pill with the same diamonds,
  never another widget in another palette.
- **A commander in the binder is a crown on the price sticker**, not a yellow COMMANDER tape across the art: Discover
  already tells you which commanders you own, and the tape took a corner of every card to repeat it.
- **Section buttons live in the ransom title band.** Collection's CARDS / ANALYTICS and + DECK / IMPORT, and My Decks'
  NEW BLANK DECK / IMPORT DECK / SHOW STATS, ride beside the title the way the binder button already did. The white
  frame around Collection is gone with them on wide screens.
- **No hover preview.** Card size is a control now, so a card that grows under the pointer only got in the way.
- **The sync drawer is read, not deciphered**: same two island faces, one step up in size and contrast.
- **The deck page has no black bar.** What the deck takes from your binder and what it costs is a fourth square beside
  READINESS · BRACKET FIT · SALT LEVEL, and everything below — the Forge bar included — rises into the freed row.
- **A panel's open/close control never sits on a value.** The title keeps its own line with CONTRACT / EXPAND beside it
  and the number drops under the title. Closed, a panel is a 168px rail with labelled numbers that can be read, and the
  BUILD 100 banner belongs to the open panel only.
- **Suggestions say what a card does, not that you own it.** Every suggestion is already a card of yours, so the green
  "✓ yours" price and the "owned" tag are gone.
- **The analysis panel says what the deck can do, live.** Under the meters: the two-card combos the deck already
  finishes, and the ones one card from your binder away. Both move with every swap.
- **"your decks:" shows three and a count.** With twenty decks on one commander the line still reads as one line.
- **No white outlines on the phone either.** The frame around the Collection block and the outline on the analytics
  chart cards are gone at every width: a chart is read, not framed. The cards keep the ink, the halftone dots, the
  hard shadow and the tilt that tie them to the stat tiles; the three stat tiles and TOP 3 keep their white frames.
- **A card that transforms can be turned over wherever it is.** The FLIP tab sits in the card's top-left corner, clear
  of the ⋮, the price tape and the copy pips, and the card's name, count and price always belong to the front.
- **The ⋮ options button is the first thing on every tool bar** (Guillermo: "should be a world rule in the app"), and
  its panel opens from the bar's left edge.
- **A card's ⋮ is almost invisible until you point at it.** On a touch screen, where there is no pointer, it stays
  half-lit so it can still be found.
- **Settings that used to be a row of segments are one stepping button**, the way SIZE already worked: the bar shows
  what is on, a tap moves to the next, and the whole list stays in ⋮ to pick from.
- **A Forge panel opens and closes from a red corner flag** with + and −, not from a word in the header, and a closed
  panel is a 218px rail.

## 2026-11-19: My Decks and Collection share one top (Guillermo's deferred items, approved "Proceed")
- **My Decks has DECKS | STATS tabs**, like Collection's CARDS | ANALYTICS: the page always opens on the decks, the stat
  tiles wait on STATS, and + NEW DECK / IMPORT sit on the same row in Collection's ink and red labels. This replaces the
  Nov 14 SHOW / HIDE STATS button (and its remembered per-device choice) on My Decks.
- **The commander mark stays the crown inside the price sticker** (Nov 15). That already answers the deferred "align the
  yellow Commander tag with the price tag": the tag and the price are one sticker now.
- **ManaBox references of Nov 13, reviewed:** what fits is already in (one filter sheet with Clear / Apply, rules-text
  search, grid / list / compact view, group headers with count and price, card menu, search pinned in reach). Left as
  proposals because they change logic, not looks: an exact colour-identity and number-of-colours filter, a STACKED view,
  per-card price change, and ManaBox's "count basics / look in other decks" ownership switches (ownership is counted one
  way everywhere, see above).


- 2026-11-19: Top 3 on Collection lies flat (no fan tilt). Deck theme and tag badges are plain labels on phones. Keep the old Supabase sign-in (it may carry email log-ins later). Going public stays off for now.

## 2026-11-20: Phase 5E security housekeeping
- Approved with the Phase 5 plan ("All five, in the order suggested"). CI's checks run with a read-only GitHub token
  (`permissions: contents: read`). Every outside GitHub Action is pinned to an exact commit, with the version in a
  comment; to update one, look up the new tag's commit and change both.
- Build tools are kept on patched versions with `npm audit fix` (no `--force`, no new packages). The app itself ships
  with no known vulnerable package (`npm audit --omit=dev`: 0). Left on purpose: `glob`/`minimatch` inside
  `workbox-build` (build time only, reads our own files); fixed when vite-plugin-pwa/workbox ship an update.
- Old Google OAuth secret: `docs/ROADMAP.md` records it rotated on 2026-10-13, while the 2026-11-14 entry above says
  "later". Guillermo confirms which in Google Cloud Console (Credentials, the OAuth client's secret creation date).
- Supabase row rules (RLS) are in `supabase/schema.sql`; the live project is hibernated, so checking them live waits
  until it is woken from Guillermo's PC.

## 2026-11-20: Phase 5D safer sync (merge rules)
- Approved with the Phase 5 plan; rules shown to Guillermo before building. When both sides changed since they last
  matched, sync merges against that shared copy (kept on the device as `sync:base` in the cache table, no schema change):
  a change on one side is taken; a card count changed on both gets both changes; removed on one side but changed on
  the other keeps the change; a deck edited on both is kept twice (the cloud's named "(other device)"); binder
  settings merge per setting, lists combined, both changed the same setting → this device's.
- First link with different binders on each side: still asks, now with a third choice, MERGE BOTH (everything from
  both; the same card keeps the larger count; identical decks once).
- Every pull, merge and restore first keeps this device's copy as a backup (last 5, `backup:<time>` in the cache
  table, restorable from BACKUPS in the sync drawer); DOWNLOAD BACKUP gives a file. The Worker and the snapshot format
  are unchanged, so no redeploy was needed.

## 2026-11-20: Phase 5C own card list
- Approved with the Phase 5 plan. A weekly GitHub job (`card-list.yml`) rebuilds `public/cards/oracle.json` from
  Scryfall's Oracle Cards bulk file and opens a pull request, like the monthly brain data. One card per line, so a
  week's change is a few lines. Merging it each week is optional: an older list still works.
- The app uses the list only when Scryfall can't answer (imports, syncs): online imports still ask Scryfall, because
  prices and exact printings come from there. Not precached; fetched by the app on Wi-Fi at most once a week.

## 2026-11-21: Offline pictures stay light (about 100 MB at most)

- Guillermo's choice on the decision card ("keep a lightweight app"). Pictures are kept as you look at them, the way
  most apps do it, with lower caps: small 2,500, art crops 150, full size 150, symbols 600.
- Saved ahead on Wi-Fi: only the cards in your decks (decks you play first, up to 1,000, ~16 MB), no longer every
  owned card (up to 5,000, ~80 MB). A picture already kept from looking at it is moved, never stored twice.
- Not chosen: keeping it as it was (~250 MB), or nothing saved ahead (~50 MB).

## 2026-11-21: Card roles upgrade (Guillermo: "add the cards roles")

- From 6 Scryfall Tagger roles to 22: the six deck-count roles stay as they are (ramp, draw, removal, wipes, tutors,
  counters, with the same deck targets), and 16 other jobs are added after them in the file, so an older file still reads.
- The other jobs show in a card's "Does:" line and help pick stand-ins: a shared deck-count role still counts +3, a
  shared other job +1, so they break ties without outranking what a card does for the deck counts.
- Fallback when the file doesn't know a card: Deck Wizard's two text rules (recursion, sacrifice outlet). Token makers come from a Scryfall text search (no Tagger tag found). An empty
  tag for a new job is only reported by the monthly job; an empty one for the first six still stops it.

## 2026-11-22: One score for swap stand-ins (Guillermo: "swap scoring?", go-ahead via the coordinator)

- The swap window's matcher and the brain's scoreCard are one score now (`lib/subs.ts` scoreStandIn), on the brain's
  scale. The swap weights are the old ones divided by 4, so every pick stays what it was: checked on the new swap
  benchmark (`tests/bench/swap.test.ts`, 48 real decks, 10 hidden cards each, both callers, both binders).
- The reasons under each pick are the parts of that same score. On a deck the brain's parts (deck needs, themes,
  copies, taste) can now be named; combos are not repeated there, they keep their own line. Still at most two reasons.
- Changing the weights is a separate step, to be measured on the benchmark first.

## 2026-11-23: Phase 1 done, Phase 3 kept as decided, Phase 2 started
- Next round of five phases planned (doc: https://claude.ai/artifact/PxXH6iXkttV8MG5jdVwc1i). Phase 1 (steadier checks,
  true feature list) merged as #104.
- Phase 3 (make the Discover tile and the commander page show the same %) is skipped: Guillermo keeps the Nov 6 and
  Nov 13 choices (decks from Discover open at MED + $$$; the tile says "decks avg", the page "in this deck").
- Phase 2 (full collection analysis page) approved. Guillermo chose to keep a year of daily worth totals: one line per
  binder per day in the cache table (`worthlog:<binder>:<day>`), on this device only, not synced, no Dexie change.


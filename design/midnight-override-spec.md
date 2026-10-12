# CollectionHub look: "Midnight Override" (v3.5, approved by Guillermo 2026-10-12)

Mood: Persona 5 Royal × 90s industrial-punk zine. Cut-and-paste ransom letters, xerox grain, halftone, rough ink, rubber stamps, typewriter notes, torn paper and tape, plus small, quick motion. Palette: black, stark white, crimson #e60012 and hazard yellow #ffcc00. Readable first: texture lives on frames and backgrounds, never behind body text.
Mockups: https://claude.ai/artifact/3WHG3Yam9w8RQT5mvJASeF
Mockup source (exact CSS/markup to copy from): /mnt/project-files/design/mockups/ (Ransom = title letter kit, LiveDiscover, LiveCommander, LiveCollection, LiveDecks). Sections 9–11 and the bullets after them are the latest and win over earlier sections. (bottom row = the live app's Discover, commander page, Collection and Decks; the shared ransom kit sits above the main board).

This is a reskin only. Every screen keeps its current content, order and behaviour.

## 1. Colour tokens

| Token | Dark (default) | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0A0A` | `#FFFFFF` | page |
| `--surface` | `#141414` | `#FFFFFF` | panels, inputs, list rows |
| `--paper` | `#F4F1EA` | `#F4F1EA` | zine paper: import flyer, notebook page, receipt, swap note |
| `--kraft` | `#C9A77C` | same | ransom letters, binder-name tape |
| `--raised` | `#3A3A3A` | `#D9D9D9` | empty bar segments, dividers |
| `--text` | `#FFFFFF` | `#0A0A0A` | main text, borders |
| `--muted` | `#B5B5B5` | `#5C5C5C` | secondary text, set codes |
| `--accent` | `#E60012` | `#E60012` | active tab, primary buttons, stamps, owned bars |
| `--hazard` | `#FFCC00` | `#FFCC00` | price stickers, import header, money warnings; text on it is `#0A0A0A` |
| `--danger-text` | `#FF4A55` | `#B00C18` | Reset binder |
| `--rule-blue` | `#B9C4CF` | same | notebook lines |
| `--tape` | `rgba(170,170,170,.9)` (grey) or `rgba(255,204,0,.85)` (yellow) | same | tape strips |
| `--grid` | `rgba(255,255,255,.06)` | `rgba(10,10,10,.07)` | 24px background grid |

White on #E60012 is about 4.8:1, so it passes at any size.

## 2. Fonts (Google Fonts)

```
https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Anton&family=Archivo:wght@400;600;800&family=Archivo+Black&family=Black+Ops+One&family=Playfair+Display:ital,wght@1,900&family=Shippori+Mincho+B1:wght@800&family=Space+Mono:wght@400;700&family=Special+Elite&display=swap
```

- **Display:** Anton, caps. Buttons, tabs, card names, numbers.
- **Zine voice:** Special Elite (typewriter). Labels, helper text, counts, set codes, prices, placeholders, the receipt and the binder picker.
- **Stamps:** Black Ops One. "APPRAISED", "READY TO SLEEVE!", Reset binder.
- **Body:** Archivo 400/600 at 15–16px for anything longer than a line.
- **Ransom kit only:** Playfair Display italic 900, Alfa Slab One, Archivo Black, Shippori Mincho B1, plus the fonts above.

## 3. Ransom-note titles (shared component, see `Ransom.dc.html`)

Props: `text`, `size`, `seed`. Every letter is its own cut-out:
- A seeded random (`frac(sin(n*12.9898 + seed*78.233)*43758.5453)`) picks one of 10 papers, never the same paper twice in a row: lined newsprint + Playfair italic; red halftone + Anton; black + Alfa Slab; yellow + Archivo Black; white with red dots + Black Ops One; grey photo halftone + Anton; kraft + Shippori; white with red Playfair and an ink ring; black with yellow Special Elite; lined white + Anton.
- Each letter gets one of 6 irregular `clip-path` polygons, size 0.84–1.14×, rotation ±6°, vertical offset ±5px, random padding and a `drop-shadow(3px 3px 0 #0A0A0A)`.
- The seed keeps a word looking the same on every load. Each page uses its own seed.
- Words never break mid-word; lines wrap between words.
- The component is `aria-hidden`; the `<h1>`/`<h2>` that holds it carries `aria-label` with the plain word.
- Titles sit on a red halftone slash (`clip-path` quad, 7px dot halftone).

## 4. Page chrome

- Background: `--bg` + 24px grid, speed-line rays in the top ~600px (`repeating-conic-gradient`, white 12% alpha, 2.5° on, 8.5° off), one torn red halftone paper shape partly off-screen.
- Header: "COLLECTIONHUB" in Anton 34px with `text-shadow: 3px 3px 0 var(--accent)`, then three skewed (-12°) tabs. The active tab is solid red with a jagged clip-path; the others are 2px outlined. Right side: "Binder 1 ▾" in Special Elite, moon/sun toggle, sync. 5px red bottom border. On phones the tabs move to a bottom bar with the same styling.
- **Xerox grain:** one fixed SVG `feTurbulence` overlay (baseFrequency 0.85, desaturated), opacity 0.3, `mix-blend-mode: overlay`, `pointer-events: none`.
- **Rough ink frames:** an absolutely positioned 3px border span with `filter: url(#rough)` (`feTurbulence` 0.05 → `feDisplacementMap` scale 5). Only the frame is filtered.
- **Card art:** grayscale + contrast, halftone dots, crimson splash. Full colour on hover/focus and on the commander's own big image.

## 5. Motion (small and quick)

| Name | What | Timing |
|---|---|---|
| `tick` | Discover ticker band scrolls left (content duplicated for a seamless loop) | 28s linear infinite |
| `slashIn` | Red title slash slides in from the left | 0.7s on load |
| `jit` | Ransom letters twitch 2px with a tiny rotation, `steps(2)`, random negative delay per letter | 2.6s infinite |
| `stamp` | Rubber stamps slam in from 1.9× scale | 0.45s, 0.4–0.5s delay |
| `blink` | Typewriter cursor `_` after captions | 1s steps |
| `spin` | Starburst behind the owned % | slow, 30s |
| `drop` | Swap note drops in when opened | 0.25s |
| hover | Cards/deck cards lift 5px and the shadow turns red; collection rows slide 4px right | 0.15–0.18s |
| press | Buttons shift 4px and lose their shadow | 0.1s |

Under `prefers-reduced-motion: reduce`, turn off every animation and transition above; keep the static rotations.

## 6. Screens

**Discover** (same structure as live): ticker band; "WHAT CAN I BUILD?" ransom title; four rough-framed stats (cards, entries, commanders in red, binder worth in yellow with a WARNING tag); a taped white panel with Search and Sort (Name A→Z / % owned / price / recently added; the 30-day filter was removed from the app); the "296 of 296 commanders in this binder." line; commander grid `auto-fill minmax(200px, 1fr)` with full card image, tape on some, name, pips and a yellow ≈CA$ sticker.

**Commander page:** back link; rough-framed hero (header strip with name, pips, top tags, EDHREC link and %; tilted card image with tape; ransom name on the slash; "built around" tag chips, first one yellow); taped white strip with Bracket ALL/I–V, Budget ANY/$/$$$ and the swap hint; summary row (big % with a spinning starburst, yellow WARNING "missing cards ≈ CA$…", SAVE AS DECK); categories as `<details>`, missing rows dimmed with "↺ SWAP" and a yellow price; the swap popover is a taped paper note with a red shadow. Right column: the Shopping List as a "*** TO BUY ***" receipt (zigzag top/bottom, Special Elite, square checkboxes that turn red, "shop ↗" links).

**Collection:** ransom "COLLECTION"; binder name on a kraft masking-tape input; stats as rough-framed boxes plus a white "worth about CA$…" slip with a red APPRAISED stamp; IMPORT flyer on paper (hazard stripe + yellow header, typewriter description, CHOOSE A FILE); paste box as ruled notebook paper with a red margin and torn bottom edge; ADD TO BINDER (primary) and REPLACE BINDER (secondary); small ransom "CARDS" heading with EXPORT CSV / EXPORT TEXT as white stickers and RESET BINDER as a dashed red stencil with a warning icon; search; rows `qty | thumb | name + set | price sticker | ×`.

**Decks:** ransom "DECKS" + "1 deck in Binder 1_"; each deck is a lined index card (red top rule, yellow tape, thumbnail, name in Anton, "100 cards · 100% owned" in typewriter, pips) and a 100%-owned deck gets a red "READY TO SLEEVE!" stamp; a dashed empty slot invites the next deck; "ADD A DECK" form on a torn notebook page with punch holes (deck name on an underline, CHOOSE A FILE, ruled textarea, SAVE DECK); footer credits in typewriter.

**Data check for the build thread:** combos, "Ready n/8" and archetype tags on Discover cards are not in the app; leave them out. Show "≈CA$—" when a price is unknown.

## 7. Components

- **Primary button:** red, white Anton 18–22px, skewed -12°, `5px 5px 0 var(--text)` shadow (ink shadow on paper). Min height 48px.
- **Secondary button:** transparent, 2–3px `--text` border, same skew.
- **Sticker button** (exports): white, ink Anton, tilted ±2°, `3px 3px 0 var(--accent)`.
- **Danger stencil:** ink background, 3px dashed red border, `--danger-text` Black Ops One, warning icon.
- **Segmented control** (Bracket, Budget): 2px bordered row of 44px cells, active cell red.
- **Price sticker:** yellow, Special Elite, tilted -2°.
- **Rubber stamp:** red text and 4px (double for decks) red border, Black Ops One, rotated -12° to -14°, opacity ~0.9, `mix-blend-mode: multiply` on paper.
- **Notebook paper:** `--paper` with blue rules every 32px and a red margin line at 46px; text starts at 56px with 32px line-height.
- **Tape:** 80–100 × 24px strips, rotated 3–8°, on card and panel corners.
- **Inputs:** label above in Special Elite (or a white Anton tab for search), Special Elite text, placeholders end in `_`.

## 8. Accessibility guardrails

- Every control has a hit area of at least 44px; icon-only buttons have `aria-label`.
- Decorative layers (rays, torn paper, tape, starburst, halftone, grain) are `aria-hidden` with `pointer-events: none`.
- Ransom titles are `aria-hidden` inside a heading that carries the plain word.
- Special Elite is for short text only; anything longer than a line uses Archivo.
- Reduced motion: see section 5.

## 9. Reference details (v3.1, from Guillermo's close-up references)

These override anything above where they differ.

- **Ransom tiles:** match the "WHAT CAN I BUILD?" reference. Only three papers: cream `#F4EFE1→#E6DCC6` (~60%), black with cream text (~20%), yellow `#FFDB4D→#F1C400` (~20%), never two black or two yellow in a row. Fonts are mostly Alfa Slab One, then Archivo Black, with the odd Playfair italic. Tiles are near-rectangular (1–3% clip offsets), similar size (0.9–1.04×), tilted ±4°, with fine paper speckle, a soft bottom shade and a hard `2px 4px 0` black shadow. They sit on a red slash with dark-red 8px halftone dots.
- **Commander card (Discover):** black card, 12px radius, 4px cream border run through a "worn" displacement filter (`feTurbulence` 0.7 → `feDisplacementMap` scale 6) plus a faint inner hairline. Top: name in Archivo 800 caps with square worn pips (W cream, G muted green `#5E7F55`, U/B greys, R red). Tags line in Special Elite, centred. Art: Scryfall **art_crop**, 4:3, inside a cream mat and a 3px black frame, `grayscale(1) contrast(1.35)` + 3px halftone + a black speckle grain layer; full colour on hover. Then "Own x% of the deck. N cards missing." in Special Elite, a badge (`[READY TO SLEEVE!]` filled red at 90%+, otherwise `[N TO BUY]` outlined yellow), and a footer with mono "NO. / decks / price" on the left and the big % over a 12-step rising, skewed bar on the right.
- **Tape:** grey translucent strip with torn zig-zag ends (clip-path), faint vertical fibres, small drop shadow, stuck across card corners at steep angles.
- **Graffiti (randomized, Gorillaz-inspired):** an original set of 11 marker doodles: crown, X-eyed skull, star with "!!", looping arrow, lashed eyeball, scrawled tag with swoosh, lightning bolt, spray splatter with drips, hollow-eyed spiky-haired face, tombstone, crosshair. Each card picks 0–2 doodles from a seed (card index), with random ink (mostly red, sometimes cream or yellow), size, rotation ±30°, mirroring, stroke width and spot (over the art, name or % corner), all through the worn filter. Five big faded doodles sit on the page background. On card hover the doodles redraw themselves (stroke-dashoffset, 0.7s; off under reduced motion). Use original drawings only; don't copy the band's logo or characters.
- **Halftone fade:** field labels (SEARCH, BRACKET, SEARCH CARDS) are white tabs whose right side dissolves into black halftone dots.
- **Warning plate:** yellow speckled plate, lowercase Archivo Black "warning", black hazard stripes along top and bottom, ragged edges.
- **Filters header:** a cream brush stroke above a "FILTERS" box with a worn border and scratched-out right end.
- **Background:** the torn red halftone sheet has a cream torn edge showing above it, and soft white light streaks cut diagonally across the page (slow pulse, off under reduced motion).

**Data check:** the % owned and "N cards missing" per commander on Discover come from the same numbers the commander page already computes; deck counts come from EDHREC. If computing these for every commander is too slow, show them only once loaded.

## 10. Layout changes (v3.2)

- **Discover hero:** the stat boxes are gone. Next to "WHAT CAN I BUILD?" sits the FILTERS header (brush stroke + scratched box) and the taped white filter panel: the search box and SORT (no OPEN button; typing filters, and Enter opens a commander that is not in the binder). The ticker no longer repeats binder stats.
- **Collection** now owns the binder stats: cards, entries, a red "296 commanders" box and the "worth about CA$…" slip with the warning plate and APPRAISED stamp.
- **Search boxes (Discover and Collection):** one bordered box. The word SEARCH is a solid tab inside its left end, the input fills the middle, and a halftone dot fade sits inside its right end (decorative, `aria-hidden`). The box is a `<label>` so the word still names the input.
- **Graffiti, xerox and tape on every page:**
  - Every page gets the torn red halftone sheet with a cream edge, diagonal light streaks and five big faded background doodles, each page with its own seed.
  - Card images are xerox (`grayscale(1) contrast(1.35)` + black speckle grain) and return to full colour on hover: the commander image, collection thumbnails and deck thumbnails.
  - Doodles sit on the commander image, the to-buy receipt, the import flyer, the commanders stat, the deck index card and the "add a deck" notebook page. On paper they use red/black ink, and on black they use red/cream/yellow. They redraw on hover.

## 11. Tweaks (v3.3)

- **Sort (Discover):** same pattern as search. One bordered box with a SORT tab inside on the left, the native `<select>` filling the box (a `<label>` wraps it, so a click anywhere opens the menu), and a red ▼ on a halftone patch at the right end.
- **Mana pips:** square, worn, using the real mana symbol colours with a black letter: W `#FFFBD5`, U `#AAE0FA`, B `#CBC2BF`, R `#F9AA8F`, G `#9BD3AE`. These replace the monochrome pips everywhere.
- **Commander page:** the separate summary row is gone. The white filter strip now holds Bracket, Budget, the owned % (white Anton on a black tilted badge over a still red starburst, "owned in Binder 1"), the yellow "missing cards ≈ CA$…" plate with a small warning tag, and SAVE AS DECK. The swap hint runs along the bottom under a dashed rule.
- **Bracket and Budget cells:** no halftone on the labels. A soft 5px halftone (black at ~17%) sits over every Bracket and Budget cell, the red selected ones included.
- **"Built around" tags:** one row that scrolls sideways (snap, thin red scrollbar, right edge fades out) instead of wrapping or being cut off.
- **Collection rows:** quantity reads "4 ×" (number in a badge, red ×), then the thumbnail, then name and set. A small typewriter header row above the list labels the columns: qty · card · set · each.
- **Add a deck:** math-notebook graph paper (20px blue squares with a stronger line every 100px) with punch holes and a torn top. The textarea sits on the same grid with a red margin line on its left.
- **Commander strip layout:** a grid of five equal cells (`repeat(auto-fit, minmax(190px, 1fr))`), each with an Anton label on top (BRACKET, BUDGET, OWNED, MISSING, DECK) and a 58px-tall control under it, so everything lines up in one row and fills the white bar. Segment buttons stretch to fill their cell. OWNED is a bordered box with the % on a black badge over a small red halftone burst, plus "in Binder 1". MISSING is a yellow box with a hazard stripe and "≈ CA$…". DECK is the SAVE AS DECK button. On narrow screens the cells wrap two or three per row. The swap hint spans the full width underneath.
- **Owned battery (v3.4):** OWNED is a battery icon: a 3px black outline with a nub and 10 skewed cells that fill to the owned %. A lightning bolt sits in the middle. Colour-coded: red under 40%, yellow 40–79%, green `#2FBF71` at 80% and up (cells get a soft halftone). The % sits beside it in the same colour with a thin black outline, with "Binder 1" under it. `role="img"` with an aria-label like "39% owned in Binder 1".
- **Missing plate (replaces the loose warning sticker):** one hazard-tape plate, 58px tall like its neighbours: yellow with a fine speckle, 3px black border and a `4px 4px 0` black shadow, thin black diagonal hazard stripes along the top and bottom edges, a black wedge on the left holding a yellow warning triangle, and "≈ CA$550.85" centred in Anton (≈ at 20px, price at 28px). A small tape strip pins the top-right corner. `role="img"` with an aria-label like "Warning: missing cards cost about CA$550.85".
- **Built around row:** scrolls sideways with no visible scrollbar (`scrollbar-width: none`, `::-webkit-scrollbar { display: none }`); the right-edge fade shows there's more.
- **Colour filter (Discover, v3.5):** no label; under SORT, five equal-width 54px-tall toggle buttons in a 5-column grid that spans the panel width like the search and sort bars (`aria-pressed`): black tile, cream 3px frame, white Archivo Black letter, and a 5px colour bar along the bottom (W `#F3E7B0`, U `#2F7FD8`, B `#8C8C8C`, R `#E60012`, G `#2FA35A`). A selected tile turns red (the mockup shows W selected). Several can be on at once, and tapping again clears one. Filters commanders by colour identity.
- **Captions over busy backgrounds:** helper captions that can land on the red or cream sheet (e.g. "> Your binder vs EDHREC…") are hazard-yellow `#FFCC00` Special Elite on a black strip (`box-decoration-break: clone` so each wrapped line gets its own strip).
- **Collection match box (replaces the battery):** in the commander strip the OWNED cell is labelled COLLECTION MATCH like the other cells and spans two columns. Its control is the same 58px height as the others: a black box with the % in Anton 36px, then a 10-segment skewed bar (red owned, white missing) over one line of "You own N of the top 99 · N EDHREC decks" (12px), and a red starburst cut off at the top-right.

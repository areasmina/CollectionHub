# Deck Wizard UI: Photocopy Zine restyle (spec for Claude Code)

The look is a photocopied zine: xerox texture, halftone dots, CMYK colour bands. It only changes the
`HTML` template in `deck_wizard.py` (inline CSS and JS). **Don't change the deck builder, the data or
the scoring.**

Reference mockups are in `design/zine/`:
- `ZineDiscover.dc.html`: the commander list.
- `ZineCommander.dc.html`: one commander's page.

They are design files, not app code. Read their `<x-dc>` markup for layout and their `MODES` /
`renderVals()` for colours and sizes. The `{{…}}`, `<sc-for>` and `<sc-if>` syntax belongs to the
mockup tool. Re-implement it in the report's own plain JS (template strings, like `synHTML`,
`shapeHTML` and `lvlHTML` do today).

## ⚡ UPDATE: the chosen look is "Zine × P5"

Guillermo picked Option E, the zine look plus Persona 5 energy. The final mockups are:

- `design/zine/P5Discover.dc.html`
- `design/zine/P5Commander.dc.html`
- `design/zine/P5Collection.dc.html` (the Collection view, Phase 3b)

Treat them as the target from now on. The `Zine*` files are only the base layer.

Phases 1–2 still apply unchanged; E is built on top of them, so nothing done so far is lost.

The new **Phase 2b** adds the P5 layer to what exists. After that, Phases 3–5 follow the P5 mockups. See
"Phase 2b" below.

## Rules (from CLAUDE.md, repeated here)

- **Code and fonts:**
  - Standard library only.
  - One static `report.html`: inline CSS and JS, no frameworks, no build step.
  - Fonts can load from Google Fonts with a fallback stack (`monospace`, `sans-serif`), so the
    report still works offline.
- **Phases and checks:**
  - One phase per commit, with `git commit` before each phase.
  - After each phase, run `py tests/check_report.py`. It must pass with no JS errors and the chip,
    chooser and `/deck` stub tests green.
  - Keep every `data-*` attribute, id and class that `check_report.py` and the JS rely on (`data-b`,
    `data-t`, `data-a`, `data-w`, `data-s`, `data-tsel`, …). If one must be renamed, update the
    test in the same commit.
- **Report size (about 46 MB):**
  - The styling goes in **shared CSS classes**, never inline styles repeated per card or row, and
    no SVG per row.
  - Report how much the file grew after each phase. It should be a few KB, not MB.
- **Existing features:** preserve all of them: filters, sorts, bracket slider, archetype tree,
  Average-deck switch, substitute chooser, pins, live `/deck` levels, upload button.

## Design tokens

Three modes: **Positive** (black ink on paper), **Negative** (paper ink on black), **Sepia**.

- Set them as CSS variables on `:root[data-mode="pos|neg|sepia"]`.
- Default is `neg`.
- Save the viewer's choice in `localStorage` key `"dw:mode"`, wrapped in try/catch like the other
  keys.

| Token | Positive | Negative | Sepia |
|---|---|---|---|
| `--bg` | `#F0EBDD` | `#141414` | take the value from `MODES.sepia` in the mockup |
| `--ink` | `#141414` | `#F0EBDD` | from mockup |
| `--mute` | `#4A4740` | `#BDB8AC` | from mockup |

- **Shared accents:**
  - Process colours: `--y #FFE600`, `--c #00AEEF`, `--m #EC008C`.
  - Text on accent colours is always `#141414`.
- **Mana colours** (colour filters, identity boxes): W `#F4EDCF`, U `#2470BE`, B `#2B2530`,
  R `#D23B26`, G `#2A8443`.
- **Fonts:**
  - Archivo (variable width, `font-stretch: 62–75%`, weight 900, uppercase) for headings.
  - IBM Plex Mono for body text.
  - Courier Prime for receipt and serial lines.
  - Caveat for pencil scribbles. Scribbles are decoration only; leave them out if they cost much.
- **CMYK band:**
  - As a section divider: three thin stripes (y / m / c).
  - As the hover and active state: `box-shadow: inset 0 -3px 0 var(--y), inset 0 -6px 0 var(--m), inset 0 -9px 0 var(--c)`.
- **Textures:**
  - One fixed full-page overlay. Use one small SVG `feTurbulence` filter (toner specks) and a CSS
    `linear-gradient` graph-paper grid.
  - Wrap them in a `pointer-events: none` container with its own `overflow: hidden`.
  - **Never put `overflow: hidden` on `body` or a page wrapper.** It breaks `position: sticky`.
- **Halftone fill for bars:** `background-image: radial-gradient(circle, var(--ink) 0 1.6px, transparent 1.9px); background-size: 5px 5px`.
- **Card images:** Scryfall images stay full colour. Only the frame, the tape label and the offset
  shadow carry the style.

## Phase 1: theme base

- Tokens, fonts, the mode toggle (three buttons in the header) and the texture overlay.
- CMYK dividers between the main sections.
- Restyle buttons, chips, inputs and selects in square, 2px-ink-border zine style.
- Done when all three modes look right on the existing layout and the test passes.

## Phase 2: Discover (the commander list)

Follow `ZineDiscover.dc.html`:

- **Commander rows as cards:**
  - Colour identity as small filled mana-colour boxes.
  - Collection Match % as a **battery**: 10 cells.
  - **Battery style (P5 version, replaces the boxed battery everywhere):**
    - No outer box and no terminal nub.
    - 10 slanted bars (`transform: skewX(-20deg)`) that rise from 40% to 100% height, left to right,
      like a power gauge. The container is `display: flex; align-items: flex-end`.
    - Lit bars: the tier colour, a 1.5px black border and a `2px 0 0 #0B0B0B` hard shadow.
    - Unlit bars: an outline in the text colour with a diagonal hatch, at 30% opacity.
    - Same sizes per place as the mockups: Discover cards, the Match tile, the slim bar, Collection deck
      rows, and the 5-bar mini version on the "You own at least" buttons.
    - Copy `battery()` from `design/zine/P5Discover.dc.html`.
  - Lit cells = `round(pct / 10)`.
  - Cell colour: green `#2A8443` at 80% or more, yellow `--y` at 60–79, red `#D23B26` below 60.
- **Colour filter chips:** filled with the mana colour when selected; otherwise a bottom stripe in
  that colour.
- **"You own at least" buttons:** each shows a mini 5-cell battery.
- **Filter aside:** `position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto`.
  Static at 900px and below.

## Phase 2b: Persona 5 layer (red, slants, ransom letters, motion)

Copy the `/* ===== Persona-5 energy ... */` CSS block from the helmet `<style>` of
`P5Discover.dc.html` into the report's CSS. It holds these classes:

- `p5-in`, `p5-view`
- `p5-card`, `p5-slab`, `p5-slash`, `p5-ticker`, `p5-track`, `p5-head`, `p5-burst`
- `p5-h1`, `p5-h1c`

It also holds the keyframes and the reduced-motion rule. Then apply them as follows.

- **Red token:** `--r` is `#E5191C` in Positive and Negative and `#A6402B` in Sepia. Text on red is
  always white.
- **Active state:** the selected bracket, mode, weight, spending and archetype buttons, and the chosen
  substitute, become a red background with white text and `box-shadow: inset 0 -4px 0 #0B0B0B`. Keep
  the CMYK band for hover only.
- **Ransom-note titles:**
  - Port the `ransom(text, base)` helper from the mockup JS. It decides the letters deterministically,
    so they look the same on every load.
  - Use it for the page title ("What can I build?") and each commander's name. The letters go over a
    `p5-slash` red halftone slab.
  - Build the letters only for the open panel, never for all 288 commanders, so the report stays small.
- **Ticker:** a red slanted strip under the header that loops real numbers. Discover shows commanders,
  cards, unused cards, collection changes and the top commander. A commander panel shows Match %,
  readiness, bracket fit, combos owned, swaps and cards to buy.
- **Section titles:** "The 99", "Gaps & stand-ins" and "Deck stats & combos" use `p5-slab` with the
  text in an inner `<span>`.
- **Discover cards:**
  - `p5-card` gives the hover tilt with a red shadow.
  - The entry animation `p5-in` staggers by `animation-delay: i*70ms`, capped at the first 24 cards.
  - The top 3 get the red "#1/#2/#3" skewed tag.
- **Motion:**
  - Buttons skew when you hover over them (the `[data-band]:hover` rule).
  - Deck cards slide in on scroll. **Guillermo uses Firefox**, so don't use
    `animation-timeline: view()` (Firefox doesn't reliably support it).
  - Instead, use one small shared `IntersectionObserver` on the open panel's cards: add a class
    (`p5-shown`) when a card enters the screen; that class plays `p5in`.
  - Observe only the open panel, and unobserve each card after it is shown.
  - Cards are visible by default when JS or the observer is missing.
  - Test in Firefox and Edge.
  - Everything turns off under `prefers-reduced-motion`.
- **Paint and layout:** `transform` and `opacity` animations only, so no layout jank. `isolation:
  isolate` on `p5-card` lets the starburst sit behind the text.

Don't copy any Persona 5 logos, fonts, characters or exact phrases. The look is the inspiration; the
assets stay original. Update `check_report.py` if any selectors change.

## Phase 3: Commander panel

Follow `P5Commander.dc.html`. It is `ZineCommander.dc.html` with the P5 layer on top:

- An "ON DECK" red tag on the slim bar.
- A red starburst behind the Match score.
- A red slash behind the commander card.
- Red skewed stickers: (FITS B4!) and (CHOSEN!).

**New in Phase 3: "Why this card?" panel** at the top of the aside.

- Clicking any card in The 99 shows that card's real parts. Keyboard works too: `role="button"`,
  Enter.
- The parts are:
  - EDHREC play rate and synergy for this page.
  - What it shares with the commander (`card_fit` / `commander_link` reasons).
  - Links in this deck (`DeckSynergy` counts).
  - Its role.
  - The combo it belongs to.
  - For a stand-in: the card it replaces and why.
- It has 📌 Always include / 🚫 Never use buttons, wired to the existing pins (`/pins`).
- No invented scores or percentages.
- Default selection: the first "your pick" card.
- **Hover + click to pin:**
  - Hovering or focusing a card shows it in the panel (preview).
  - Clicking pins it: red outline on the card, and a "📍 PINNED" tag in the panel. While pinned,
    hovering other cards doesn't change the panel. Click the same card again (or Esc) to unpin.
  - On touch screens, a tap = click.
  - In app mode, the `/why` request on hover waits until the mouse has rested on the card for about
    150 ms, and keeps answers in a small cache per page, so sweeping across cards doesn't flood the
    server.
  - The panel uses `aria-live="polite"`.
  - This is separate from the existing image hover preview. Keep both, but don't let the big image
    preview cover the panel.
- **Data, checked against the code (Oct 2026):**
  - **Already in the report:**
    - The card row: name, image, type, Game Changer flag, mana value.
    - The deck entry's kind (p/y/s/c/f/k).
    - The reason string for picks: `card_fit` / `cmdr_fit` text, e.g. "with commander: discard",
      "hidden gem", "theme: …".
    - For stand-ins: the missing card, the advised-reason and the alternatives.
    - Synergy swaps: `x.sw` reasons, "synergy: discard ×9".
    - Combos in the deck: `x.cin` and `COMBOS`. Find the ones that contain this card.
    - Pins (kind `k`).
  - **Missing:**
    - (a) The card's roles.
    - (b) The EDHREC play rate and synergy for popular cards: kind `p` has no reason today.
    - (c) Deck links for cards that weren't swapped.
  - **How to add the missing data without growing the report much:**
    1. Roles go into the `CardTable` row as a small bitmask of `roles_of()`. It is per card and
       global, so only a few KB.
    2. In app mode, add `GET /why?c=<commander>&b=<bracket>&t=<theme>&a=<avg>&card=<name>`. It uses
       the same header rule as `/deck`. `LiveDecks` answers from data it already has:
       - The play rate and synergy (`card_values` on the page).
       - `DeckSynergy.links()` for the deck.
       - `card_fit` / `commander_link` reasons.
       - The combos.
       It takes about 0.1 s, so there's no precomputing.
    3. In the static report, show only what it has (kind, reason, combos, roles) plus "open in the
       app for EDHREC numbers". Don't add the per-card numbers to every deck entry; that would add
       MBs across the brackets, themes and averages.

Otherwise, the base layout is:

- **Header:**
  - Big card image with a Full colour / Photocopy toggle. Photocopy is a CSS filter:
    grayscale + contrast.
  - Name in huge Archivo, then the colour boxes and a meta line.
  - **Built around** chips from `x.core`. The top one is filled yellow.
  - The deck mix line (popular / picks / combo / stand-ins, average mana value, Game Changers).
  - The settings sheet: bracket chips with % and deck count, archetype chips, Deck from, weight
    1–4, spending $–$$$.
- **Three score tiles:**
  - Match: the P5 slanted-bar battery, about 140px wide and 31px tall.
  - Ready: printed inverted.
  - Bracket Fit: with its reasons.
- **Slim sticky bar** under the header: `position: sticky; top: 0; z-index: 20`.
  - Mini image, name, colour boxes, mini battery, "6/7 ready · B3 fits B4", bracket switch,
    archetype select, "TO BUY · N". (No "Open in Builder": Build mode doesn't exist yet.)
  - Items marked wide are hidden at 760px and below.
- **Content order:** The 99 → Gaps & stand-ins → Deck stats & combos (Phase 4).
- **The 99:**
  - Grouped by type. Each card has a tape label for its kind:
    - popular: outline only
    - your pick: yellow
    - combo piece: magenta
    - stand-in: cyan
    - role fill: grey `#A8A397`
    - pinned: yellow
  - Each card also gets a matching coloured offset shadow.
- **Aside:**
  - **Synergy swaps** panel in cyan: cyan top border and shadow, tilted label "⇄ Synergy swaps (N)".
    The card coming in is highlighted cyan; the card going out is struck through in magenta.
  - **Pins** panel in yellow: "ALWAYS" chips yellow, "NEVER" chips magenta, matching buttons.
- **Gaps:** each slot is a row of option cards (Buy it / Advised / Or…). The chosen option is
  inverted and tilted −1° with the CMYK band. Wire this to the existing chooser logic (`effDeck`,
  saved choices).

## Phase 3b: Collection page (follow `design/zine/P5Collection.dc.html`)

A new **Collection** view inside the same `report.html`; no new file. The pieces:

- **Top nav:** Discover / Collection only. No Build tab, Build buttons or "Open in Builder" anywhere until Build mode exists.
  - The current view is red with white text.
  - Switch views with a URL hash (`#collection`). Remember the last view in `localStorage` key
    `"dw:view"`, wrapped in try/catch.
- **Collection view: show the data the report already has. Invent nothing.**
  1. **Hero:**
     - A ransom-note "YOUR COLLECTION" over a red slash.
     - A stat strip: cards, unique, commanders, unused. Unused is printed red.
  2. **"Current file" card:**
     - The CSV name and its build time.
     - The upload drop zone: a big red slanted "DROP A NEW CSV ★" label over a striped dashed box.
     - Reuse the existing upload logic: `POST /upload` with header `X-Deck-Wizard: 1`.
     - The drop zone shows only when served (`--serve`). The static report shows the file info only.
     - This drop zone is the **only** upload control on the Collection view: no "Upload CSV" button in
       any header (Discover, commander page or Collection). Remove the old header upload button; uploading
       lives on the Collection view only.
  3. **"Since the last file" card:**
     - Three slanted blocks: `+N new cards` (green `#2A8443`), `−N removed` (red), and `N new commanders`
       (yellow). They come from `collection_changes()` / `cache/last_collection.json`.
     - The new commander names as yellow chips that open their panel.
     - A link to the full added/removed list.
     - If there's no previous file, show "first import".
  4. **"Your decks" (the `decks_in` imports, `analyze_imported`):** one row per deck.
     - A big skewed number tag (01, 02…; the first is red).
     - The deck title and commander.
     - A 10-cell battery for % owned (same colour rule as Discover), "N of 99 owned".
     - A magenta combos tag.
     - A red Open button.
     - If `decks_in` is empty, show one line explaining how to add decks.
  5. **"Cards sitting unused" (`STATS.unused` from `find_homes()`):**
     - A sentence with the real counts: total unused / make a suggested deck / weaker fit / no home.
     - "Would use the most" commander chips, ranked. #1 is red; the counts sit in small tags.
     - Unused cards as a grid: the card image (Scryfall, CSS `grayscale` in Photocopy mode), name, a
       "BEST HOME" tag, the commander link, and the reason.
     - Clicking a commander chip filters the grid, as the report does today.
     - Render the first 24 cards, with a "show more" button. Don't render all 150 at once.
- **Motion:** same P5 layer. `p5-in` stagger on the blocks and rows, `p5-card` hover on cards and rows.
- **Where today's sections go:** move the existing collection bar, imported decks section and unused
  cards section into this view. Don't keep two copies. Keep their ids and `data-*` hooks so
  `check_report.py` still passes; add a check that the Collection view opens without JS errors.

## Phase 4: Deck stats as a post-it pile

Replace the current shape charts, power profile and combo boxes with one **pile of post-it notes**
with clickable tabs. The tab row sits above the pile and the active tab joins its note.

| Tab | Note colour | Content (all from existing data, nothing invented) |
|---|---|---|
| Mana curve | `--y` | Big bars with the count on each bar; dashed line = EDHREC average (`av[b].ref`). Under each mana value: "avg N" and the difference (+1/−1; ±2 or more printed inverted). Fact row: non-land cards, average mana value, cheap (0–2) yours vs avg, top end (5+) yours vs avg. |
| Card types | `--c` | Table: type · bar with dashed avg marker · yours · avg · diff. Rows ±2 off average get a tape mark. |
| Power profile | `--m` | 10-cell meters per `power_profile()` item, each with one line saying what it counts. Note: "a summary of what the 99 is made of, not a power rating". |
| Combos | paper `#F0EBDD` | Best combo for the bracket on top (`x.cl`), then the Danger zone list (`dz`) with the rule per combo, and "All combos…" link. |

- **Notes:**
  - Text on every note is always `#141414`; halftone bars use `#141414` dots.
  - A strip of "tape" at the top of each note.
- **Behind the front note:** the other two-three notes peek out, offset and rotated (about ±2°).
- **Tabs:**
  - Clicking a tab brings that note to the front.
  - Remember the last tab per page in `localStorage` key `"dw:stat"`.
  - Mark them up with `role="tablist"`, `role="tab"` and `aria-selected`.
- **Curve bars (optional):** clicking a bar filters The 99 to that mana value. CardTable rows
  already carry the mana value as field 4.
- Update `check_report.py` to click each tab once and check that there are no JS errors.

## Phase 5: Mobile and polish

- **At 760px and below:**
  - Single column.
  - Drop the texture overlay and the scribbles.
  - Sticky elements become static, except the slim bar.
  - Tabs wrap.
- Check that all three modes have enough contrast. Text on yellow and cyan is always `#141414`.
- Mobile works through the app (`--serve`); the static report is too heavy for phones.

## What not to do

- No invented scores, ratings or "synergy 9.1/10" numbers. Every number shown already exists in the
  data.
- No changes to Python logic, caches or CLI flags.
- No big re-render per row. Keep the existing lazy rendering of panels.

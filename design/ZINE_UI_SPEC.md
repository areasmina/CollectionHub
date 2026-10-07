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
  - Lit cells = `round(pct / 10)`.
  - Cell colour: green `#2A8443` at 80% or more, yellow `--y` at 60–79, red `#D23B26` below 60.
- **Colour filter chips:** filled with the mana colour when selected; otherwise a bottom stripe in
  that colour.
- **"You own at least" buttons:** each shows a mini 5-cell battery.
- **Filter aside:** `position: sticky; top: 16px; max-height: calc(100vh - 32px); overflow-y: auto`.
  Static at 900px and below.

## Phase 3: Commander panel

Follow `ZineCommander.dc.html`:

- **Header:**
  - Big card image with a Full colour / Photocopy toggle. Photocopy is a CSS filter:
    grayscale + contrast.
  - Name in huge Archivo, then the colour boxes and a meta line.
  - **Built around** chips from `x.core`. The top one is filled yellow.
  - The deck mix line (popular / picks / combo / stand-ins, average mana value, Game Changers).
  - The settings sheet: bracket chips with % and deck count, archetype chips, Deck from, weight
    1–4, spending $–$$$.
- **Three score tiles:**
  - Match: compact battery, `grid-template-columns: repeat(10, 11px)`, height 22px.
  - Ready: printed inverted.
  - Bracket Fit: with its reasons.
- **Slim sticky bar** under the header: `position: sticky; top: 0; z-index: 20`.
  - Mini image, name, colour boxes, mini battery, "6/7 ready · B3 fits B4", bracket switch,
    archetype select, "TO BUY · N", Open in Builder.
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

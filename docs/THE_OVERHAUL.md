# THE OVERHAUL: Design System & Architectural Blueprint

> **Principle:** *Frame loud, content quiet.*  
> The punk-zine soul (ransom lettering, halftone textures, paper tape, rays) lives strictly in the hero frame and outer edges. All actual data (cards, counts, decklists, filters, meters) is dead-flat, quiet, and aligned to a strict 8-point typographic grid.

---

## The 6 Core Rules

1. **FRAME LOUD, CONTENT QUIET**
   - Ransom letters, slashes, tape, and rays live in the hero and empty frame space.
   - Cards, numbers, lists, and buttons are flat on the grid with 1px–2px hairline borders.
   - **Fixes:** Eliminates boxes inside boxes, tilted cards, and doodles behind readable text.

2. **ONE BAR, ONE ⋮ MENU**
   - Every view gets a single sticky strip: `[Power Pill] | [Status Line] | [Short Chip] [TO BUY] [FORGE]`.
   - All secondary controls, filters, and exports live behind a clean `⋮` menu.
   - **Fixes:** Replaces the 5 stacked accordion rows that previously crushed cards on phones.

3. **SAY IT ONCE**
   - Each fact is shown in exactly one place:
     - Match % is in the hero.
     - Deck cost is in the toolbar strip.
     - Owned copies are subtle Arena-style diamonds (`◆ ◆ ◆ ◇`) on the card.
   - No redundant hint banners repeating what the screen already displays.

4. **ONE COLOUR, ONE MEANING**
   - **Red (`#e60012`):** Reserved exclusively for the primary forward action (`FORGE`, `SAVE TO MY DECKS`) and active tab state.
   - **Yellow (`#fff824`):** Money / prices and wildcard callouts (used like a flat highlighter pen).
   - **Green (`#2bd65a`):** Ownership.
   - **Grey / Off-black:** Missing / unfilled slots.
   - Hazard diagonal stripes are retired; shortfall warnings use a compact informative chip (`⚠ 5 short · copies shared across decks`).

5. **ONE SET OF 7 PARTS**
   - **Button:** Red slab (one primary per screen), outline, and ghost (min 44px tap targets).
   - **Chip:** Condensed uppercase with a 1px–2px outline. Yellow = money/wildcard.
   - **Sticker:** Flat yellow tape for price tags.
   - **Panel:** Off-black/carbon paper with hairline dividers (`#262626`).
   - **Sheet / Drawer:** Popovers on desktop, bottom sheets on phones.
   - **Menu:** One unified `⋮` menu per page.
   - **Meter:** Slanted green bars for match %, Arena diamonds (`◆ ◆ ◆ ◇`) for card copies.

6. **THE 4 · 8 · 12 · 16 · 24 · 32 · 48 SPACING SCALE**
   - Every margin and padding derives from this scale.
   - Groups sit 8px–12px apart, sections 24px–32px apart.
   - Gutter: 16px on phones, 24px on desktop.

---

## Reference Design Inpirations

The design direction is grounded in real-world editorial broadsheets and sleek modern apps:

- **Supaste (`supaste.com`) / AccessGrid (`accessgrid.com`):**
  - Desktop top-docked 48px–53px bar with logo on left, 3 core navigation tabs (`DISCOVER · DECKS · COLLECTION`), settings gear `⚙` on right, bounded by a crisp 1px hairline rule.
  - On phones: A sleek 40px bottom pill navigation with safe-area padding so content never gets covered.
- **AlignUI (`alignui.com`):**
  - Integrated single toolbar combining search input, view switcher (`GRID ▾`), and `⋮` actions menu into one line. Outer margins use subtle architectural ruler ticks.
- **Myrch Club (`styles.refero.design` #528683fb):**
  - The blueprint for "Frame Loud, Content Quiet": A single defiant red graffiti slash watermark behind the hero header, with a museum contact-sheet flat vitrine grid below.
- **Rou Hun Fan (`#ffb945f9`) & Duties.xyz (`#e75b3106`):**
  - Screaming bold condensed display typography in the hero header, followed by a quiet monospace metadata line (`4,321 decks · salt 2.7 · EDHREC ↗ · deck ≈CA$66`), transitioning straight into cards.
- **Home / Traffic Productions (`#657e55de`) & mono (`#859f6be7`):**
  - Zero heavy drop shadows. Structure is defined by 1px–2px hairline rules dividing the bar, strip, and cards. Highlighter yellow is used sparingly.

---

## Screen-by-Screen Roadmap

1. **Global Navigation:**
   - Desktop: 48px top bar (`[CollectionHub Logo] [DISCOVER | DECKS | COLLECTION] [⚙]`).
   - Phone: 40px floating bottom pill. Content padded `calc(72px + env(safe-area-inset-bottom))` above it.
2. **Deck View (Commander & 99):**
   - Hero → Single Strip → Single Toolbar → Flat Grid.
   - `TO BUY` opens as a clean 360px side drawer on desktop and an expandable sheet on phone.
3. **The Forge:**
   - Kept in-place as a dedicated focus mode (preserving undo history, leave guard, and state), with live role meters and ranked suggestions drawer.
4. **Collection:**
   - Single flat toolbar and summary ribbon (`N cards · N commanders · CA$X · N decks`).
5. **Discover:**
   - Hero header with the eye doodle and tagline, followed by the single toolbar and clean 2-column cards grid.

# Deck Wizard

A personal Magic: The Gathering Commander tool. It reads Guillermo's ManaBox collection export
and answers: **"What can I build with the cards I already own?"**

## Product philosophy

```
MY COLLECTION → COMMANDER → SYNERGY → BEST DECK I CAN BUILD → MISSING UPGRADES
```

- The collection is the center. Data sources support decisions; they don't dictate the deck.
- Never just say "buy this". Fill gaps from owned cards first, then name what's worth buying.
- Be honest about power. Don't present made-up precision (no fake "Synergy 9.1/10" scores).
  Prefer rule-based checks (Game Changers, two-card combos, tutors) over invented ratings.
- **No AI inside the app.** It must run free for anyone with Python and internet.
  AI is only used to *build* the tool, never at runtime.

## How to run (Windows)

```powershell
py deck_wizard.py                              # newest ManaBox CSV in collection\ (else in this folder)
py deck_wizard.py --csv "Collection_ (1).csv"  # a specific file
py deck_wizard.py --serve                      # local app with an "Upload new collection CSV" button
```

Shortcuts: `Update Deck Wizard.bat` (rebuild + open report), `Deck Wizard App.bat` (`--serve`).
Updating the collection: export from ManaBox into `collection\` and run the .bat, or upload in the app.
Only new cards hit Scryfall; the report header shows the file used and what changed since the previous one.

Useful flags:

| Flag | Purpose |
|---|---|
| `--csv FILE` | Collection file (default: newest ManaBox CSV in `collection\`, then this folder) |
| `--serve` / `--port 8765` | Local app at http://127.0.0.1:8765 with upload button (only reachable from this PC) |
| `--only "Sephiroth, Fabled SOLDIER;Terra, Herald of Hope"` | Run selected commanders only (fast test) |
| `--limit 20` | First 20 commanders only (fast test) |
| `--brackets core,upgraded,optimized,cedh` | EDHREC bracket pages to pull (add `exhibition` for B1) |
| `--no-combos` | Skip Commander Spellbook |
| `--no-themes` | Skip EDHREC theme pages and theme decks (faster) |
| `--no-avg` | Skip EDHREC average-deck pages and average decks |
| `--decks-in DIR` | Folder of decklists (.txt) to score, default `decks_in` |
| `--refresh` | Ignore all caches (slow: re-downloads everything) |
| `--no-open` | Don't open the report in the browser |
| `--offline` | No network; cached data only (tests, quick reruns) |

Deck metrics for comparing builder versions (offline, ~30 s):
`py tests/measure.py --csv "Collection_ (1).csv" --compare tests/baseline_step2.json`
(`baseline_v5.json` = original v5 builder, `baseline_pre_step2.json` = after the substitution fix,
`baseline_step2.json` = collection-first scoring; adds picks, combo_pieces, avg_syn, combos_in;
`baseline_lands.json` = + owned dual lands; `baseline_step3.json` = + ready, bracket_est, over_bracket;
`baseline_combos.json` = bracket rules enforced in the builder; `baseline_rules.json` = official rules only; `baseline_keywords.json` = + keyword mechanics; `baseline_text.json` = + Oracle-text likeness in substitutes; `baseline_themes.json` = after theme decks/speed-ups; `baseline_avg.json` = + average decks;
`baseline_synergy.json` = + card-to-card synergy swaps)

Report check (headless Edge/Chrome, no Node needed, ~5 s): `py tests/check_report.py` renders every
commander × bracket panel and fails on any JavaScript error; it also clicks bracket chips and runs the
substitute chooser (pick an alternative, buy, reset) and checks the results. Run it after any change to the HTML template.

Output: `report.html` (single self-contained page), `decks/<commander>_<bracket>.txt` (Arena/Moxfield lists).

## Hard constraints

- **Python standard library only.** No pip installs. Must run with `py` on Windows.
- Single script (`deck_wizard.py`) for now. Splitting into modules is fine later, but keep it runnable with one command.
- Report is one static HTML file with inline CSS/JS. No build step, no frameworks.
- Be polite to public APIs: keep the sleeps, keep the caches, never remove caching.
- Paths/filenames may contain spaces and accented characters (e.g. "Grishnákh"). Slugs must strip accents.

## Data sources and their jobs

| Source | Job | Cache file |
|---|---|---|
| ManaBox CSV | What Guillermo owns (`Name`, `Scryfall ID`, `Quantity`) | – |
| Scryfall `/cards/collection` | Card data for owned cards (by ID) and missing cards (by name), images | `cache/scryfall.json`, `cache/scryfall_names.json` |
| Scryfall search `otag:` | Card roles (ramp, draw, removal, wipe, tutor, counter, recursion, sac) | `cache/role_tags.json` (refreshed monthly) |
| EDHREC theme pages `…/commanders/<slug>/<theme>.json` | Real per-theme deck data for each commander's top `THEME_TOP` 3 themes (`fetch_theme_page`; misses remembered `THEME_MISS_DAYS` 7 in `_theme_miss`) | `cache/edhrec_v4.json` |
| EDHREC `json.edhrec.com/pages/average-decks/<slug>[/<bracket>].json` | EDHREC's average 99 per bracket (`parse_avg`: card → copies, `bracket_counts`), fetched for each bracket the commander page has; misses remembered 7 days in `_theme_miss` (`avg:` prefix) | `cache/edhrec_v4.json` (key `avg:<path>`) |
| EDHREC `json.edhrec.com/pages/commanders/<slug>[/<bracket>].json` | Popularity, synergy, lift per commander and per bracket, theme tags | `cache/edhrec_v4.json` (seeded from `edhrec_v3.json`; old pages upgraded when next fetched online) |
| Commander Spellbook `POST /find-my-combos` | Combos owned (all, with Spellbook `bracketTag`, infinite flag, mana needed) and one card away (top 150), one query per color identity (`ci2:<WUBRG>:<hash>`; old `ci:` entries unused) | `cache/spellbook.json` |
| Commander Spellbook `POST /estimate-bracket` | Exact Game Changer / mass land denial / extra turn flags for owned cards (`fetch_card_flags`, chunks of 400, new cards only, monthly recheck) | `cache/spellbook_flags.json` |
| Scryfall `/catalog/keyword-abilities`, `keyword-actions`, `ability-words` | Mechanic names (connive, landfall, mobilize…) → `KEYWORD_VOCAB` minus `KW_SKIP` (evergreen/generic) | `cache/keywords.json` (monthly) |
| Commander Spellbook `GET /templates/` + Scryfall search | Combo conditions ("Persist Creature") → the Scryfall query Spellbook attaches → card names (`fetch_templates`, monthly; 17/20 resolve, e.g. "Haste Enabler" has no query) | `cache/spellbook_templates.json` |
| Commander Spellbook `GET /cards/?ordering=-variant_count` | Which cards are in any combo (pool filter; find-my-combos takes ≤600 cards) | `cache/spellbook_cards.json` (monthly) |

Decisions:
- **EDHREC is the primary deck-data source.** Archidekt and Moxfield are on hold (planned later as backups).
  Note: EDHREC already aggregates decks from Moxfield/Archidekt, so their real future value is
  *individual real decklists* ("you're 90% of the way to this actual deck"), not more averages.
- Moxfield has no public API and blocks scripts. Do not try to bypass it. Users can export decklists
  manually into `decks_in/`.
- EDHREC bracket slugs: exhibition, core, upgraded, optimized, cedh (Brackets 1–5).

## Current architecture (v5)

Main flow in `main()`:
1. `load_collection` → `enrich_scryfall` → `owned` (normalized name → card meta). Basics and tokens excluded.
2. `fetch_role_tags` fills global `ROLE_TAGS`; `roles_of()` uses tags, falls back to `regex_roles()` per role.
3. Commander candidates = owned legendary creatures / "can be your commander".
4. Pass 1: `fetch_page` for each commander's base EDHREC page + bracket pages.
5. `resolve_names` gets Scryfall data for popular cards not owned (needed for substitutes).
6. Pass 2 per commander: `build_pool` (owned cards in color identity) → `combos_for_commander`
   → `analyze()` per bracket (gets the owned combos) → combos-in-deck detection.
7. `analyze_imported` for each `decks_in/*.txt`.
8. `render_report` injects JSON (`DATA`, `DECKS`, `CARDS`, `BR`, `STATS`) into the `HTML` template.

Key functions:
- `analyze()` – builds the 99. One ranked list (heap), all in "share of decks" units:
  - owned non-land cards at **score** = blended play rate + `SYN_W` (0.5) × EDHREC synergy + `card_fit()`;
    owned cards EDHREC doesn't list join only if they share a type or mechanic with the commander
    (deck kind `y` "your pick", with the reason; listed cards under `OFF_LIST` 5% also count as `y`);
  - missing cards (blended rate ≥ `SUB_MIN`) at (rate + synergy) × closeness of the best owned stand-in
    × `STANDIN` (0.6; lands ×1) → kind `s`;
  - B3–B5 (`COMBO_BRACKETS`): combos you own (≤3 cards, no extra requirements, allowed in the bracket) as
    a package valued at its weakest piece + `COMBO_W` (B3 0.12, B4/B5 0.25); every piece must score
    ≥ `COMBO_PIECE_MIN` on its own (synergy/fit, not just colour); ≤`COMBO_MAX` 2 packages adding ≤2 cards.
  - Bracket rules are enforced while building (`blocked()`/`note()` in `analyze()`), for every way a card
    gets in (popular, pick, stand-in, combo, role fill, duals): a card that would complete a combo the
    **official rules** forbid is skipped (`combo_ok()`): B1–B2 no two-card infinite combos, B3 none in the
    early game (`tmv` = Scryfall mana value of the pieces + Spellbook mana needed ≤ `EARLY_MV` 6, i.e.
    before turn ~6; the rules give no number, this is our measure). Three-card combos aren't restricted.
    B1–B3 also no mass land denial and ≤`XTURN_CAP` 1 extra-turn card ("low quantities, not chained").
    "All decks" has no bracket, so no rules. Spellbook's `bracketTag` is shown as information only.
    Combos with an extra condition (`req`, e.g. Stella Lee + "an instant that untaps a creature") count the
    condition as a card. `annotate_combos()` (per commander) adds `sat` = your legal cards meeting each
    condition (`TEMPLATES`) and `tmv`; `combo_done()` = named cards + a card meeting each condition present
    (None when a condition can't be resolved → shown as "possible", never blocks). Combo packages may add
    the best-scoring card meeting the condition. Sac outlets are usually named pieces already (Spellbook
    lists Plunderer + Gravecrawler + Viscera Seer / Ashnod's Altar as separate combos).
  Then role fill (`ROLE_TARGETS`, sorted by score) → `owned_duals()` → basics. Non-land rates are `blended_rates()` (bracket
  page pulled toward the all-decks page by `SHRINK_DECKS`=200 decklists); lands use the raw bracket rate
  and no fit. Only cards from `build_pool` (owned, legal, in color identity). Game Changers capped by
  `GC_CAP` (B1/B2: 0, B3: 3). Also builds `gaps` (top `GAP_SHOW` missing cards with up to 3 owned alternatives).
- Three numbers per deck (report tiles): **Collection Match** = `pct`; **Build Readiness** = `readiness()`
  pass/fail checks (`ROLE_TARGETS`, avg MV ≤ `READY_MV`, weakest colour's land sources, stand-ins + role
  fill ≤ `READY_ODD`), stored as `rd` = [[check, value, target, ok]]; **Bracket Fit** = `bracket_fit()`
  (set in `main()` after combos-in-deck): lowest bracket the 99 fits (2 = "B1–2", 4 = "B4+"), from Game
  Changers (>3 → B4), mass land denial (→ B4), 2+ extra-turn cards (→ B4), two-card infinite combos
  complete in the deck (late → B3, early → B4; `combo_need()`), "possible" ones listed without raising it.
  Rules source: Wizards "Introducing Commander Brackets Beta" (Feb 2025); Feb 2026 update changed only
  the Game Changers list (53 cards). Stick to these rules; don't add house caps. Tutors shown as info only (rules say "few"). MLD / extra turns use
  Spellbook's flags (`is_mld`, `is_xturn`; `MLD_RX`/`XTURN_RX` only for cards Spellbook doesn't know).
  Tutors stay on Scryfall's `otag:tutor`: Spellbook's card search is name-only (no bulk flags; full list is
  300+ pages) and its `tutor` flag is narrow (Diabolic Tutor = false).
- `card_fit()` – rule-based fit of an owned card to a commander (no invented ratings): `FIT_TRIBE` for a
  type the commander or its top EDHREC theme names; `FIT_MECH` per shared mechanic (≤3) from `MECHANICS`
  (rules-text patterns + EDHREC theme names + card types); small bonuses for useful roles, roles the theme
  asks for (`THEME_ROLES`), Scryfall `edhrec_rank` staples, Game Changers in B4/B5; minus `FIT_MV` per
  MV above 4. `commander_profile()` reads the commander's text (keyword-only lines and its own name
  removed; `CARES_ABOUT` stricter patterns so "Ureni attacks" isn't an attack theme) + top 3 themes.
  Profile = (tribe, mechanics, theme roles, keyword mechanics). Keyword mechanics: any `KEYWORD_VOCAB`
  word the commander's text, own keywords or top-3 theme names (theme "Connive"); a card shares it if its
  Scryfall `keywords` include it or its text mentions it (`has_keyword`, word forms via `kw_rx`).
  `built_around()` → `x.core`: deck cards per tribe/mechanic/keyword ("Built around: connive 13 …").
  Synergy engines that aren't combos (connive, landfall…) live here, not in Spellbook.
- **Card-to-card synergy** (roadmap phase "synergy first", step 3b of `analyze()`): `ENGINES` pairs what cards
  PROVIDE with what they CONSUME, read from Oracle text incl. reminder text (`card_engines`): discard outlets ↔
  discard payoffs, graveyard fillers ↔ graveyard use, sac outlets ↔ death triggers, fodder ↔ outlets, tokens,
  +1/+1 counters, lifegain, spells, artifacts, enchantments, ETB ↔ blink, landfall, draw triggers, land cards ↔
  "discard a land". Opponent discard ("that player discards") is not your outlet; "whenever you discard" is a
  payoff, not an outlet. `DeckSynergy` counts both sides in the deck (commander ×`SYN_CMDR` 3; the commander's
  tribe is one more engine: members ↔ cards naming the type). Deck synergy = `SYN_DECK_W` 0.05 × Σ sqrt(min(links,
  `SYN_CAP` 12)). After role fill, up to `SWAP_MAX` 15 swaps: best owned candidate (top `SWAP_POOL` 40 by score +
  synergy) replaces the weakest p/y/f card if it gains ≥ `SWAP_MARGIN`; protected: combo pieces, substitutes,
  Game Changers (unless swapped for one), cards in `SWAP_KEEP` roles (removal/wipe/counter/ramp/tutor; only for a
  card sharing the role), roles at/below `ROLE_TARGETS`, pieces of a combo complete in the deck; bracket rules via
  `blocked()`. Stored as `x.sw` [[in, out, why]] and `x.bench` (next `BENCH_SHOW` 8 owned cards, with why); report:
  "Synergy: N swaps · next in line" (`synHTML`). Effect vs `baseline_avg`: ~11 swaps per All-decks list,
  removal/wipes/ramp/counters kept, draw +4.5, combos in deck +0.05, run 33 → 46 s.
  Test case (user): Doctor Doom, King of Latveria discard cards (Captain Howler, Library of Leng, Brallin, Gamble…)
  still rank below other owned discard cards that EDHREC lists; Howler is closest.
- `find_subs()` – closeness 0–1 of owned stand-ins: share of the missing card's roles × card kind
  (creature/spell/land; ×0.75 for a different card type, instant = sorcery) × mana value distance ×
  `OFF_TYPE` (0.4) if the missing card has a type the commander names (`commander_types()`, e.g. Dragon
  for Ureni; from `TYPE_VOCAB`, subtypes only when capitalised) and the stand-in doesn't. Below
  `SUB_MATCH_MIN` (0.35) nothing is offered. Lands matched by colors produced. Oracle-text likeness
  (`text_sig`: word pairs of the full text incl. reminder text, numbers → #, name → ~; Jaccard via the pool's
  `text_index`, stored as `by_role["_text"]`, pairs on >`TEXT_COMMON` 4% of the pool dropped): role match ×
  (0.8 + 0.4 × likeness/`TEXT_FULL`), and a card reading like the missing one (≥ `TEXT_ALT`) is a candidate
  even without a shared role (Blood Artist ↔ Zulaport Cutthroat). "similar text" in the reason. Example that motivated
  this: v5 put Spider-Man in Ureni's deck "for" Bloomvine Regent because both fetch lands.
- `card_values()` – shared per-page card value (rate, blended rate, rate + synergy) used by `analyze()` and
  `find_homes()`, so "best home" scores match the deck builder.
- `find_homes()` (roadmap 4) – unused cards = owned, legal, non-basic cards not in any `decks_in` deck (no
  decklists: not in any suggested All-decks 99). For each, every commander scores it (value + `card_fit`,
  all-decks page); homes ≥ `HOME_MIN` 0.12, top `HOMES` 3, `UNUSED_SHOW` 150 listed. Report summary:
  `n_sugg` make a suggested deck, weaker fits, no home; commanders whose suggested 99 uses the most of them
  (click → filters the list). Stored in `STATS.unused`. Adds ~10–30 s to a full run.
- `CardTable` – deduplicated card list for the report; decks reference cards by index (keeps HTML small).
  `T.s(text)` = shared string table for reasons (`STRS` in the page, `W(i)` in JS): reasons repeat thousands
  of times across commanders/brackets/themes (report 18.6 → 10.7 MB).
- Speed: `sub_candidates()` memoizes stand-in candidates per missing card within one `analyze()` (cleared
  at its start; `rate_of.key` tells pages apart), `fit_cached()` keeps `card_fit` per commander, `main()`
  computes the commander profile once, theme decks skip gaps (`want_gaps=False`). Full offline run with
  ~5,000 decks (themes included): ~2.5 min; `--no-themes` ~1 min.
- "% owned" = weighted share of the EDHREC template (top ≤99 cards at ≥10% inclusion) that is owned.

App mode (`--serve`, `serve()` + `Rebuild`): stdlib `ThreadingHTTPServer` on 127.0.0.1. `GET /` serves
report.html, `GET /status` reports rebuild progress, `POST /upload` (needs header `X-Deck-Wizard: 1`, blocks
cross-site posts) checks the CSV header, saves it to `collection/`, and reruns the normal pipeline as a
child process with the same options. `collection_changes()` keeps the added/removed diff in
`cache/last_collection.json`. `save_json` and the report write are atomic (temp file + `os.replace`).

Report features: collection bar (file, changes, upload button when served), bracket slider (switches EDHREC bracket data), filters (search, archetype, color,
min %, min decks, combos), sorts, Scryfall card-image grid with hover preview, gaps & substitutes,
combos, power profile bars, imported decks section.
Theme decks: each top theme gets a deck per bracket: `analyze(theme page, base = theme page, bracket
rules, focus=theme)`; cards matching the theme (`theme_profile`/`hits_theme`: tribe, MECHANICS, roles,
keywords from the theme name, via Oracle text) get `FOCUS_W` 0.15 ("theme: discard" reason). Stored as
`entry["th"][slug] = {name, decks, b: {bracket: deck_diff(...)}}` (numbers + added entries + removed
[card, kind]); JS `themed()` applies the diff. EDHREC has theme × bracket pages too (`<slug>/<bracket>/<theme>`)
but they're thin (Doom Discard B4: 26 decks) and 4× the requests, so not used. Theme tags are buttons
(`data-tsel`, row `data-t`; click again → overview); themes without a cached page stay EDHREC links ↗.
Substitute choices are saved per commander + bracket + theme.
Average decks: page-wide **Commander page | Average deck** selector next to the bracket slider (JS `SRC`, saved in
localStorage "dw:src"; `X(d,b)` drives the list, filters and sorts), plus the same switch per panel (row `data-a`
"1"/"0" overrides the page; a theme click overrides both). `avg_as_page()` turns
EDHREC's average 99 into a page where every card has rate 1.0 (synergy from the commander's bracket page), then
`analyze(..., show=real play rates)` rebuilds it with your cards (owned cards stay, missing → stand-ins, same
bracket rules; `show` orders/labels the gaps). Stored as `entry["av"][bracket] = deck_diff(...) + gaps`; JS
`avgd()`/`applyDiff()`, `rowSel()` gives the saved-choices key ("avg"). Average deck and theme are exclusive.
**Deck shape** charts per panel (`shapeHTML`): mana curve (non-lands, 7+) and card types of your deck (bars) vs
EDHREC's average deck of that bracket (white line), from `avg_shape()` stored as `av[b].ref`; CardTable rows carry
mana value as field 4. Table view under "As a table".
Bracket chips in a commander's panel switch that panel's deck (`rowB`, `rerow`; row `data-b`).
Substitute slots: deck entries of kind `s` are `[card, "s", missing card, why advised, [[alternative, why] ×≤3]]`
(alternatives from `find_subs`, not already in the deck, within the GC cap and `blocked()` rules). In the report
"⇄ options" opens a chooser (keep the missing card → shopping list / advised / alternatives); the gaps
section has "Use this" / "Buy instead" for slots too. Choices are saved per commander+bracket in the
browser (`localStorage` "dw:<slug>:<bracket>", per-viewer convenience) and change the card view, the
copyable list and the shopping list (`effDeck`, kinds `s2` = your choice, `buy`). "Reset my choices" clears.
Combos per commander (report): **Danger zone** (red box, `danger_zone()`): every two-card infinite you can
assemble in its colours (commander + 1 card, or card + a card meeting its condition), earliest first, with
the official rule and whether the selected bracket allows it. **Best combos** per bracket (`best_combos()`,
`x.cl`): combos you can assemble that the bracket allows, ordered in this deck → wins the game (`WIN_RX` on
what it produces) → fewer pieces → cheaper (`tmv`) → popularity. Full lists are behind "All combos…".
Combos live in one shared table (`ComboTable` → `COMBOS` in the page; commanders hold indices `co`, `cn`, `dz`).

## Known limitations / things to verify against real data

- Step 2 scoring changed ~7 cards per All-decks list (9 at B3, 11 at B4) vs `baseline_pre_step2`:
  substitutes −4.5, role fill ~0, synergy slightly up. Commanders whose EDHREC list you mostly own still
  get mostly EDHREC cards (they score high); bracket pages with 1–2 decklists change a lot (25–50 cards),
  since they carry almost no signal. Fit weights are hand-set; tune with `tests/measure.py`.
- Lands: ≤`MAX_LANDS` EDHREC-listed lands, then `owned_duals()` (2+ colours: owned lands making 2+ of the
  commander's colours, untapped first, ≤`TAPPED_MAX` always-tapped via `enters_tapped()`, down to
  `MIN_BASICS` basics; kind `y` "makes UR · untapped"), then basics. `restricted_mana()` skips lands whose
  colour mana has strings attached (creature-type, energy, filter, storage lands). Land stand-ins only for
  missing lands making 2+ of the commander's colours (a basic does a utility/mono land's colour job).
  Result: 3-colour decks ~11 basics, 2-colour ~20, mono ~30. Utility lands EDHREC doesn't list: not yet.
- EDHREC JSON shape is unofficial and could change. Theme tags are read from `panels.taglinks`.
  If many commanders show "no themes found", check the real JSON.
- EDHREC cardviews include a `synergy` field (how much more a card is played with this commander than
  in general). Stored since v4 cache (`cards[key] = [name, rate, synergy, lift, list_tags]`; v3 pages
  only have `[name, rate]`). Used in scoring since step 2 (`SYN_W`); `lift` and list tags are not.
- Scryfall card meta (`SF_VERSION` 2) also stores `mana_cost`, `edhrec_rank`, `keywords`; `edhrec_rank` and
  `keywords` are used by `card_fit()`, `mana_cost` not yet.
- EDHREC answers missing pages with HTTP 403. Misses are never cached (a 403 can also be a block).
- Commander Spellbook rate-limits (HTTP 429) and rejects decks over 600 cards (HTTP 400). `http_json`
  waits on 429/5xx (Retry-After, else 15/30/60/120 s) and fails fast on other 4xx. `combo_pool()` sends
  only owned on-color cards that are in some combo; cards over the 600 limit (5-color: 8 today) are looked
  up one by one (`csb_card_combos`, `/variants/?q=card="…"`), so no owned combo is missed.
- Combos come from Spellbook's curated database, not from reading card text ourselves: Oracle text (full,
  with reminder text and both faces) drives fit/mechanics/roles, but rules interactions are Spellbook's job. If Spellbook stops
  answering, `CSB_DOWN` makes the rest of the run skip combos. Failed/partial lookups are not cached.
- Scryfall Tagger tag names in `TAG_QUERIES` are best guesses; the run prints card counts per role.
  A role with 0 cards means a wrong tag name.
- Bracket Fit / enforcement: all owned combos per colour identity are checked; the report lists 30 owned
  and 20 one-card-away per commander, ranked by how many pieces are in its deck (`rank_combos`). Combos
  needing extra requirements (`req`, e.g. "a sac outlet") are listed but not added as packages. A commander
  that is itself a combo (Stella Lee, Wild Card: Spicy) can't be fixed by the builder and stays flagged
  (now shown as "possible", since her combo needs an untap spell the list can't confirm).
  `EARLY_MV` and `XTURN_CAP` are our measurable readings of "early game" and "not chained".
- `power_profile()` is a rough composition summary, not a power rating. Don't build bracket logic on it.
- Imported deck commander detection: `Commander` header, `*CMDR*` tag, or a guess from color identity.

## Roadmap (in order)

1. ✅ Scryfall tags for roles + collection substitutes + visual card view (v5)
2. ✅ (first pass) **Collection-first scoring and deck construction.** Score every legal owned card per commander:
   commander synergy (EDHREC `synergy`, oracle keyword overlap with the commander), theme fit, role,
   curve fit, EDHREC popularity (lower weight than synergy), combo participation, Game Changer status.
   Build the deck from the best-scored owned cards; EDHREC influences scoring but doesn't dictate the list.
3. ✅ (first pass) Three separate numbers: **Collection Match** (current %), **Build Readiness** (quality of the
   generated 99), **Bracket Fit** (rule-based: Game Changer count, two-card combos, tutors,
   mass land denial, chained extra turns; Commander Spellbook also has an estimate-bracket endpoint).
4. ✅ (first pass) Unused cards: cards not in any `decks_in` deck → find commanders/archetypes that use them.
   Needs real decklists in `decks_in/` to be meaningful (empty today → falls back to suggested decks).
5. Shared cores / hidden archetypes: group commanders that draw on the same owned cards
   (e.g. an Izzet spellslinger core shared by Stella Lee, The Locust God, Niv-Mizzet).
6. Later: missing-card prices (Scryfall USD/EUR → CAD), Archidekt real-deck matching,
   wizard UI, challenges, achievements.

## Working rules for Claude Code

- Commit with git before any non-trivial change. One phase per change; don't jump ahead.
- Preserve existing features and CLI flags unless asked. Don't rewrite the whole file.
- Test fast first: `py deck_wizard.py --csv "Collection_ (1).csv" --only "Sephiroth, Fabled SOLDIER" --no-open`,
  then a full run.
- Never delete `cache/` unless asked; a full refetch takes 20+ minutes.
- After changes, explain which functions changed and why, in plain language.
- The user prefers concise answers with clear figures and practical next steps.

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
- **Reliable logic, not per-deck fixes.** A card the user flags (e.g. Brallin for Doctor Doom) is a test case
  for a general rule. Fix the rule, then check it on all commanders with `tests/measure.py` (no rule
  violations, sensible averages) and spot-check a few other commanders before committing.

## Product structure: two modes, one engine (planned)

**Discover** (what exists today): scan the whole collection, rank commanders, show a ready-made deck per
commander, bracket and archetype. **Build** (the "LEGO" mode, not built yet): pick a commander and a strategy,
add/remove cards from the collection, watch the deck react, export. Flow: Discover → Build → Export; every
commander row gets "Open in Builder"; Auto Build is a button in Build using the same engine.
- One engine for both: small reusable functions (`score_card`, `suggest_cards`, `add_card`, `remove_card`,
  `analyze_deck`, `suggest_upgrades`), not a one-shot builder. Python precomputes tags/roles/scores; the browser
  filters, adds up and displays (or asks the app, like `/deck`), so Python and JS scoring can't drift apart.
- Build mode: strategy stack (primary + up to two secondary + extras, manual tag add/remove), live-filtered
  collection, click to add, live role counts / curve / Game Changers / combos, "must include" pins, a "why this
  card" breakdown of real parts (no invented percentages), role minimums so cute cards don't replace working ones.
- **Strategy independence (hard rule):** a commander isn't locked to its most popular EDHREC archetype. The
  user's strategy wins; EDHREC is evidence, not a requirement. A low-EDHREC owned card can score high when it
  fits (today: commander-engine bonus + hidden gems). Success test: a less popular strategy gives a
  meaningfully different deck and surfaces owned cards the EDHREC-style build misses.
- **Price (user decision, Oct 2026, replaces "price is never a score"):** spending level is a power dial. $ / $$ / $$$
  use EDHREC's budget / normal / expensive pages, and at $$$ owned cards that *fit* get a bounded boost by price
  (`PRICE_W` {1: 0, 2: 0.03, 3: 0.2} × `price_scale()`: log curve, $1 0.15 … $99+ 1.0; Scryfall `usd` of your printing,
  `SF_VERSION` 3). Price never helps a card with no fit / EDHREC listing / useful role and never overrides bracket
  rules; owned cards are never excluded by price. Still planned: a CAD budget filter on *missing-card suggestions*.
  Trostani weight 3: $$ deck $378 of your cards → $$$ $454, Craterhoof in.
- Other planned: "What if I buy this?" (which commanders gain the most from a card).

## How to run (Windows)

```powershell
py deck_wizard.py                              # newest ManaBox CSV in collection\ (else in this folder)
py deck_wizard.py --csv "Collection_ (1).csv"  # a specific file
py deck_wizard.py --serve                      # local app: drop a new CSV on the Collection page
```

Shortcuts: `Update Deck Wizard.bat` (rebuild + open report), `Deck Wizard App.bat` (`--serve`).
Updating the collection: export from ManaBox into `collection\` and run the .bat, or upload in the app.
Only new cards hit Scryfall; the report header shows the file used and what changed since the previous one.

Useful flags:

| Flag | Purpose |
|---|---|
| `--csv FILE` | Collection file (default: newest ManaBox CSV in `collection\`, then this folder) |
| `--serve` / `--port 8765` | Local app at http://127.0.0.1:8765; uploads via the Collection page drop box (only reachable from this PC) |
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
| `--store-url URL` | Where "buy" links search; `{card}` = card name (default `https://shop.com/search/results?query={card}`, the user's store) |

Deck metrics for comparing builder versions (offline, ~30 s):
`py tests/measure.py --csv "Collection_ (1).csv" --compare tests/baseline_step2.json`
(`baseline_v5.json` = original v5 builder, `baseline_pre_step2.json` = after the substitution fix,
`baseline_step2.json` = collection-first scoring; adds picks, combo_pieces, avg_syn, combos_in;
`baseline_lands.json` = + owned dual lands; `baseline_step3.json` = + ready, bracket_est, over_bracket;
`baseline_combos.json` = bracket rules enforced in the builder; `baseline_rules.json` = official rules only; `baseline_keywords.json` = + keyword mechanics; `baseline_text.json` = + Oracle-text likeness in substitutes; `baseline_themes.json` = after theme decks/speed-ups; `baseline_avg.json` = + average decks;
`baseline_synergy.json` = + card-to-card synergy swaps; `baseline_gems.json` = + commander-engine bonus, hidden gems,
damage to each opponent = drain; `baseline_engine1.json` = + win role, go-wide engine, swap surplus rule)

Report check (headless Edge/Chrome, no Node needed, ~5 s): `py tests/check_report.py` renders every
commander × bracket panel and fails on any JavaScript error; it also clicks bracket chips and runs the
substitute chooser (pick an alternative, buy, reset) and checks the results. The page is served by a local stub server, so it also
tests the EDHREC weight / spending buttons (`/deck` stub adds a "Test Card Live"; $$$ returns an error). Run it after any change to the HTML template.

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
| EDHREC theme pages `…/commanders/<slug>/<theme>.json` | Real per-theme deck data for EDHREC's top `THEME_TOP` 4 theme tags by deck count (EDHREC order, never re-ranked; a tag without a theme page stays an EDHREC link), the archetypes; "you own N%" = `page_match`; each also with its average deck `average-decks/<slug>/<theme>` (`fetch_theme_page`; misses remembered `THEME_MISS_DAYS` 7 in `_theme_miss`) | `cache/edhrec_v4.json` |
| EDHREC `json.edhrec.com/pages/average-decks/<slug>[/<bracket>].json` | EDHREC's average 99 per bracket (`parse_avg`: card → copies, `bracket_counts`), fetched for each bracket the commander page has; misses remembered 7 days in `_theme_miss` (`avg:` prefix) | `cache/edhrec_v4.json` (key `avg:<path>`) |
| EDHREC `json.edhrec.com/pages/commanders/<slug>[/<bracket>].json` | Popularity, synergy, lift per commander and per bracket, theme tags | `cache/edhrec_v4.json` (seeded from `edhrec_v3.json`; old pages upgraded when next fetched online; the main commander page is refetched after `EDH_MAX_DAYS` 14, field `at`, so theme stats stay current) |
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
- **Win conditions and go-wide** (engine fix 1, Oct 2026; test case Trostani: Craterhoof/Moonshaker had fit 0):
  role `win` from text (`WIN_RX_CARD`: overruns/team pumps incl. "gain trample and get +X/+X", "number of creatures
  you control", repeatable drain/burn to each opponent, alt wins, extra combats); Build Readiness check `READY_WIN` 3.
  ENGINES "go wide": creatures and creature-token makers feed team pumps / count-your-creatures payoffs. Swaps:
  `SWAP_KEEP` (+win) protects a job card only while its role is ≤ target + `SWAP_SLACK` 2 (Trostani had 16 ramp for
  a target of 10, all untouchable); a candidate that finds no room no longer ends the swap loop; swapped-in cards
  stay and swapped-out cards don't return (no churn). Effect vs `baseline_gems`: own picks +4.0, removal −1.7
  (12.5 left, target 8), ramp −1.5 (16.2), wipes −0.4, combos in deck +0.06, readiness +0.66 (one more check).
- **Card strength** (engine fix 2a): `strength()` = 1 − log10(Scryfall `edhrec_rank`)/4 (Sol Ring 1.0, rank 100 → 0.5,
  1,000 → 0.25, 10,000+ → 0) × `STRENGTH_W` 0.4 in `card_fit()` (replaces the old ±0.03 staple bonus); `win` cards
  skip the `FIT_MV` penalty. Effect vs `baseline_engine1`: substitutes −4.0, popular +4, combos in deck +0.3–0.6
  (B3+), GC +0.2, ramp +1.3 (staple rocks), no rule violations (`baseline_engine2.json`). Raised to 0.6 in fix 3/4.
- **Engine fixes 3/4** (test case Trostani at weight 1: Adeline, Elspeth, Craterhoof lost to City Pigeon-style cards):
  `UNLISTED` 0.5: an owned card EDHREC doesn't list (its lists stop at ~5%, median lowest listed rate 4.8%) is valued
  at half the page's lowest listed rate, not 0 (`card_values`, `value_of` only; `rate_of`/`play_of` unchanged).
  `EDH_WEIGHT` = {1: 0.15, 2: 0.5, 3: 1.0, 4: 1.4} (weight 1 = the engine decides). `STRENGTH_W` 0.6.
  `DeckSynergy.score` counts only a card's `SYN_TOP` 2 strongest engine links (touching many engines loosely
  inflated cheap cards). Swaps: `SWAP_MAX` 30, `SWAP_POOL` 60; land fetchers (ramp + Scryfall "tutor") are
  protected as ramp only; `weakest_for` memoized per role set per round (metrics run 2m15 → 1m15).
  Effect vs `baseline_engine2` (weight 3): substitutes −1.8, popular +5.5, picks −3.7 (still above
  `baseline_gems`), draw −3.6 (loot links no longer stack), combos in deck +0.2 (B4/B5), no rule violations
  (`baseline_engine3.json`; `baseline_engine4.json` = + $$ price nudge). Trostani weight 1: Craterhoof, Adeline, Elspeth in; weight 3: Craterhoof at B4+.
- **Commander engine + hidden gems** (`cmdr_fit()`, `hidden_gems()`): EDHREC's part of a score (up to ~1.0) dwarfs
  everything read from text (~0.3), so a card nobody plays could never get in. `commander_link()` = engines where a
  card consumes what the commander provides or provides what it consumes (Doom connives every turn → "whenever you
  discard" cards) → `FIT_CMDR` 0.12, "with commander: discard". Hidden gem = owned, EDHREC rate < `OFF_LIST` 5% on
  this page, `commander_link`, and 2+ of the mechanics in the commander's *own* text (`profile[1] & card_mechanics(cmdr)`; theme-name
  mechanics made weak matches like The Warring Triad for Spider-Slayer via "flying + graveyard"); the best `GEM_MAX` 3 per deck get an
  EDHREC-part floor `GEM_FLOOR` 0.35 × share of mechanics hit ("hidden gem: +1/+1 + discard + drain"). Low play can
  mean new, overlooked or pricey. 109 of 288 commanders have gems (283 in all; audit: Woe Strider/Voracious Null for Yahenni, Library of Leng for Green Goblin, Mimic Vat for Killmonger). MECHANICS "drain" also
  matches "deals N damage to each opponent". Effect vs `baseline_synergy`: own picks +2.6, substitutes −1.7,
  removal −0.6, draw +0.8, no rule violations. Test case (user): Brallin, Skyshark Rider is in every Doctor Doom
  deck; Captain Howler (14.5% on EDHREC, one mechanic) is in the Discard archetype and offered as a swap.
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
**EDHREC weight 1–4 and spending $/$$/$$$** (per commander panel, app only; the static report is weight 3, $$ and
shows the buttons disabled): `GET /deck` (same header rule) → `LiveDecks.deck()` builds one deck with the full run's
builder and rules (`analyze(..., ew=EDH_WEIGHT[w])`, `finish_deck()`). Weight multiplies the EDHREC part of a non-land
card's score (play rate + synergy: 0.4 / 0.7 / 1.0 / 1.4); fit, theme focus and synergy swaps keep theirs.
Spending = EDHREC's `<path>/budget` / `<path>/expensive` pages (cheapest / priciest 10% of decks; exist for commander,
bracket, theme and average-deck pages; fetched on first use, then cached, refreshed after `EDH_MAX_DAYS`).
Bracket rules still decide combos. Index continuity: the full run writes `report_tables.json` (build time, CSV path,
CardTable rows/strings, ComboTable rows); `LiveDecks` seeds its tables from it and replies with only the rows the page
lacks (`nc/ns/nk`), JS `addRows()`; `v` = `ST.built` (mismatch → 409 "reload"). Context loads on first request
(~2 s), then ~0.1 s per deck; caches are saved only when something new was fetched. JS: `LIVE`, `fetchLive()`,
`lvlHTML()`, row `data-w`/`data-s`; saved substitute choices get `:w<w>s<s>` for non-default levels.
Weight 3 + $$ through `/deck` reproduces the report's deck exactly (checked on Sephiroth B4).

Report features: Collection page (file, changes, drop box when served, your decks, unused cards), bracket slider (switches EDHREC bracket data), filters (search, archetype, color,
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
`avgd()`/`applyDiff()`, `rowSel()` gives the saved-choices key ("avg"). Average deck and theme used to be exclusive; now they form a tree (below).
**Archetype tree** (per commander panel): Bracket chips → **Archetype** (Overview + EDHREC's top `THEME_TOP` 4 themes in EDHREC order, showing "% of decks" (EDHREC) and
"you own N%" (your Collection Match of their theme page); other tags = EDHREC links) → **Deck from: Commander page |
Average deck**. Four decks per bracket: overview `d.b[b]`, overview average `d.av[b]`, archetype `d.th[t].b[b]`
(theme page, `focus`), archetype average `d.th[t].av[b]` (theme average deck via `avg_as_page(..., "all")`, `focus`,
+ gaps + `ref`; `d.th[t].own`, `.adecks`). All stored as diffs of `d.b[b]`. JS `rowState()` → {t, a, key}
(row `data-t`, `data-a` "1"/"0", else page `SRC`), `deckOf()`, `tavgd()`; saved-choices key "", "avg", t, t+":avg".
Theme and average pages are all-bracket pages, built with each bracket's rules.
**Thin data**: JS `THIN` = 50. An archetype button from fewer EDHREC decks gets ⚠ (dashed border, count in the tooltip), and any
deck whose source has fewer decks (bracket page, theme page, average deck) shows a "Thin data" warning under its source note. Shown, not hidden.
**Deck shape** charts per panel (`shapeHTML`): mana curve (non-lands, 7+) and card types of your deck (bars) vs
EDHREC's average deck of that bracket (white line), from `avg_shape()` stored as `av[b].ref`; CardTable rows carry
mana value as field 4. Table view under "As a table".
Bracket chips in a commander's panel switch that panel's deck (`rowB`, `rerow`; row `data-b`).
**Zine × P5 UI** (design/ZINE_UI_SPEC.md; Phases 1, 2, 2b, 3, 3b done): print modes (`dw:mode`), Discover cards with P5
slanted-bar batteries (`bat()`, heights via nth-child), red `--r` active state, ransom-note titles (`ransom()`; page
title + the open panel's name only), tickers (`#tick`, panel ticker in `body()`), `p5-slab` section titles, `p5-card`
hover + `p5-in` stagger (first 24) + #1–#3 tags, deck cards slide in via one shared IntersectionObserver
(`p5watch`, open panel only, `p5-wait`/`p5-shown`; Firefox-safe, no `animation-timeline`).
**Views + Collection page (Phase 3b, P5Collection):** header nav Discover | Collection (`.vnav [data-view]`, current =
red); `#vdisc` / `#vcoll` switched by URL hash `#collection` / `#discover`, else the last view (`dw:view`); `showView()`
also swaps the ticker (`DTICK` from `render()`, `CTICK`). Header: file name + yellow change badge (`#hfile`, `#hups` =
"rebuilding…"); **no upload control in any header**. Collection view: ransom "Your collection" + stat strip (`#cstats`,
unused red) → `#coll` = "Current file" card (served: `label.drop` with the only `input[type=file]` → `window.dwUpload`
→ `POST /upload` + `/status` polling into `#ups`; static: file info + how to update) and "Since the last file" (`.chg`
+N / −N / N new commanders, `.nc` chips `data-open` → `openCmdr()` opens the panel in Discover, folded full list,
"first import" when there's no previous file) → `#imp` "Your decks" (`details.row.irow[data-k]`, number tag, battery,
N of M owned, combos, Open/Close; `ibody()` unchanged) → `#unused` "Cards sitting unused" (sentence with the real
counts, "would use the most" chips `.uh[data-uf]` filter the grid (needs `decks_in`), `.ucard` grid 24 first +
`.umore` "Show all", image via `IMG()`, grayscale under Photocopy `dw:img`, home links `a[data-cmdr]` → `openCmdr()`).
**Commander panel (Zine × P5 Phase 3, P5Commander):** `body()` = hero (red slash `.cslash` behind the card image,
Full colour / Photocopy `data-imgm` + `dw:img`, ransom name, meta line, Built around, mix line, settings sheet:
Bracket / Archetype / Deck from + weight + $) → panel ticker → three tiles (`numsHTML`: Match with `bat(...,"big")` and a
spinning `p5-burst`, Readiness inverted with `readyCap()`, Bracket Fit with a red skewed `.stk`) → slim sticky bar
(`.slim`: ON DECK, mini battery, ready/fit, mini bracket switch `.mbk[data-bsel]`, archetype `select.tsel`, TO BUY) →
The 99 (`p5-slab`; tape labels `TAPE`/`tapeFor`, coloured offset shadows per kind) + aside (Why this card?, receipt
`shopHTML`, cyan `swapsHTML`, yellow `pinHTML`) → Gaps & stand-ins (`slotRowsHTML`: Buy it / Advised / Or… option cards,
same saved choices; chosen = red + (CHOSEN!)) → Deck stats & combos (charts, power profile, combos; Phase 4 restyles).
**"Why this card?"** (`WHY[d.i]`, `whyHTML`, `whyShow`): hover/focus previews, click pins (`.wpin` red outline, 📍
PINNED), click again or Esc lets go; `aria-live`; 📌/🚫 buttons use the pins (`data-pinquick`). Static parts: kind, reason,
stand-in, swap, roles (CardTable row field 6 = `roles_of()` bitmask in `ROLE_NAMES` order), combos in the deck (`x.cin` ×
`COMBOS`). App: `GET /why?c=&b=&t=&a=&w=&s=&card=` (`LiveDecks.why`, header rule; builds the deck once per key, cached
24) adds EDHREC play rate + synergy on the source page, `cmdr_fit` / `commander_link`, `DeckSynergy.links`; asked after
150 ms of rest, answers cached per deck+card (`WHYC`). Card clicks in The 99 pin instead of opening Scryfall (link in
the panel). The big preview flips to the other side rather than cover the panel. Slide-in backup now checks on the
scroll event itself (time-throttled), not on animation frames (headless Edge's simulated clock produced no frames
for the heavier panel; Firefox was fine).
**Buy links:** `STORE_URL` / `--store-url` → `STATS.store` {url, name}; JS `BUY(i)` / `buyA()`: 🛒 links in the shopping
list, under the "buy" option in bubbles and under each card in "Other cards you're missing" (front face name, URL-encoded).
**Deck grid UI (Oct 2026):** the deck shows "as it should be": a substitute slot shows the *missing* card greyed with
"using <your card>" (`tileFor`); hovering any card opens a bubble on it (`.cw` > `.bub`, CSS :hover/:focus-within;
`bubbleHTML` = `chooserHTML` options for substitute / your-pick slots + in the app "📌 Always include / 🚫 Never use"
pins). No buttons under cards, no chooser panel at the top; "Other cards you're missing" is a folded `<details>`.
The big preview sits beside the hovered card (not over its bubble); bubbles near the right edge open leftwards (`.r`).
Bubble options run left to right (`.orow`, small cards with the reason under each); in a substitute slot the
missing card comes first in gold (`.opt.want`, "meant for this deck · click to buy" = pick -1 → shopping list) with
its 🛒 link below. The big preview opens only after the mouse rests on a card `PV_DELAY` 1000 ms (`pvLater`/`pvHide`).
Two-faced cards: CardTable row field 5 = 1 (`TWO_FACED` layouts, image path `front/`); tile shows ⟲, hovering it shows
`BACK(i)` (Scryfall `/back/` image) in the tile and the preview.
Substitute slots: deck entries of kind `s` are `[card, "s", missing card, why advised, [[alternative, why] ×≤3]]`
(alternatives from `find_subs`, not already in the deck, within the GC cap and `blocked()` rules). In the report
"⇄ options" opens a chooser (keep the missing card → shopping list / advised / alternatives); the gaps
section has "Use this" / "Buy instead" for slots too. Choices are saved per commander+bracket in the
browser (`localStorage` "dw:<slug>:<bracket>", per-viewer convenience) and change the card view, the
copyable list and the shopping list (`effDeck`, kinds `s2` = your choice, `buy`). "Reset my choices" clears.
"Your pick" slots: non-land `y` entries can be `[card, "y", why, [[alternative, why] ×≤PICK_ALTS 3], card to buy, why]`
(end of `analyze()`): owned cards doing a similar job (`find_subs` on the pick) first, then the deck's best other
owned cards, ranked by `total()` (score + deck synergy) + `PICK_CLOSE` × closeness, within GC cap / `blocked()`;
"buy" = most played missing EDHREC card sharing a role (no roles: same type + engine). JS slot key `"y"+card`,
chosen kinds `y2` / `buy`. `deck_diff` compares whole entries (options differ per deck). Saved choices: `rowSel()`
is the one key for reading (body) and writing (clicks), incl. the weight/$ level; `MEM` keeps them for the visit
when localStorage is blocked (bug: picks didn't apply at non-default levels). Report ~46 MB.
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
5. **Next, in this order** (ideas reviewed Oct 2026 from Manafoundry, mtg-mcp-server, CommanderBracket,
   deckscraper — READMEs only; check licences before copying code, credit MIT sources):
   a. ✅ **Pins** (`pins.json` in the output folder, tracked in git; `PINS_FILE`, `pins_for()`, `analyze(pins=)`):
      per commander "always include" / "never use". Never-use cards leave that deck's pool (no pick, substitute,
      option, bench or combo). Always-include cards go in first as kind `k` ("📌 pinned by you"), unless the bracket
      forbids them (GC cap, `blocked()`: combo / MLD / extra turns) → `x.pinx` [[card, reason]] shown in the panel;
      swaps never remove them (kind not in "pyf"). Full runs apply the file to every deck (`entry.pins` = pins used).
      App: `GET /pins`, `POST /pins` (`LiveDecks.pins()`: checks owned / legal / colours, suggests full names,
      rejects in+out overlap); the panel's pin box, "📌 always include" in next-in-line, "🚫 never" on deck cards;
      when a commander's pins differ from the report's (`pinsChanged`), its decks are built through `/deck`
      (pins in `liveKey`). "Locked" = always include until Build mode exists.
   b. **Partner and Background commanders:** pairs (Partner, Partner with, Choose a Background, Friends forever,
      Doctor's companion), colour identity = union, EDHREC pair pages.
   c. **Mana base and deck shape:** land count from the curve (not a fixed `LAND_TARGET` 35), basics split by
      colour pips (today: even split; avg 24.5 basics + 10.5 non-basic), curve and card-type targets taken from
      EDHREC's average deck of that commander/archetype (`avg_shape`), not invented. Plus a **fast mana** signal
      in Bracket Fit. No "estimated win turn" (invented precision). Land count: Karsten's regression (average
      mana value + cheap ramp/draw, Commander offset; verify coefficients from the source before coding; mtg-skills
      uses a published formula too). Also: a rule-based **win-condition** check in Build Readiness (combos, drain/burn
      payoffs, big evasive threats, alt wins; Manafoundry has a win-con role) and **deck changes between runs**
      (per commander: + / − cards since the previous report, with the builder's reasons).
   d. **Price filter (CAD)** on missing-card suggestions only (Scryfall USD × editable rate; owned cards never
      excluded) + upgrades ranked by synergy per dollar. Settles the open $/$$/$$$ question.
   e. **Collection import formats:** detect Deckbox, Deckstats, Moxfield, MTGGoldfish, TappedOut CSV headers
      (name + set lookup on Scryfall). No cube scanning.
   f. **Partial decks:** fill a `decks_in` deck up to 99 from the collection + "suggest cuts" with reasons.
   g. **Allocation and pull list** (idea from Commander Workshop MCP, MIT): use ManaBox quantities; a card you own
      once can't be in five built decks. Per deck: pull from binder / already in deck X / substitute / buy.
   h. **Two archetypes at once** (Manafoundry): e.g. Doom Discard + Connive, built in the app (light strategy stack).
   i. **Benchmark before the next engine tuning** (planned Oct 2026, parked by the user; do it first when scoring is
      touched again): `tests/benchmark.py` reconstruction test. Per real deck (`decks_in/` via `parse_decklist`, and
      `--archidekt`: ~20 owned commanders × 3 public decks), collection = the deck's 99 + commander + ~300 random cards
      (fixed seed, mixed colours, from the Scryfall caches) or `--with-my-collection`; run `analyze()` at the deck's own
      bracket (`bracket_fit` on the real 99) and "all", at weights 1–4. Report plain numbers, no pass/fail: overlap of
      non-basics (non-lands / lands), lands, basics, ramp/draw/removal/wipe/win, avg MV + curve diff, GC, bracket
      estimate; top real cards left out with score parts; random cards that got in. Median/range summary,
      `tests/bench_results.json` + `--compare`. Caveats to print: EDHREC aggregates Archidekt/Moxfield decks (overlap
      inflated, esp. weight 4); random cards are weaker than a real collection; real decks aren't optimal.
      Archidekt (undocumented read API `archidekt.com/api/decks/<id>/`, search `api/decks/cards/`; verify the commander
      filter by hand first): ≤60 requests/min, User-Agent, stop on 429, ~80 requests once, cached in
      `cache/archidekt.json`, mainboard only, single commander, legal 100, updated ≤2 years; tests only, never the app.
      ~2–3 h to build; runs ~2 min offline. Needs: a few user decklists in `decks_in/` (empty today), the commander list.
   Already done from that review: EDHREC failures non-fatal, Spellbook bracket flags + visible signals, deck
   validation (`tests/measure.py` checks). Skipped: Scryfall bulk file (cache covers it), cube support.
   Then **Build mode** UI (strategy stack, live builder) through the app, not more precomputed HTML (report ~46 MB).
6. Shared cores / hidden archetypes: group commanders that draw on the same owned cards
   (e.g. an Izzet spellslinger core shared by Stella Lee, The Locust God, Niv-Mizzet).
7. Later: missing-card prices (Scryfall USD/EUR → CAD), Archidekt real-deck matching,
   wizard UI, challenges, achievements.

## Working rules for Claude Code

- Commit with git before any non-trivial change. One phase per change; don't jump ahead.
- Preserve existing features and CLI flags unless asked. Don't rewrite the whole file.
- Test fast first: `py deck_wizard.py --csv "Collection_ (1).csv" --only "Sephiroth, Fabled SOLDIER" --no-open`,
  then a full run.
- Never delete `cache/` unless asked; a full refetch takes 20+ minutes.
- After changes, explain which functions changed and why, in plain language.
- The user prefers concise answers with clear figures and practical next steps.

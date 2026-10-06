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
| `--decks-in DIR` | Folder of decklists (.txt) to score, default `decks_in` |
| `--refresh` | Ignore all caches (slow: re-downloads everything) |
| `--no-open` | Don't open the report in the browser |
| `--offline` | No network; cached data only (tests, quick reruns) |

Deck metrics for comparing builder versions (offline, ~30 s):
`py tests/measure.py --csv "Collection_ (1).csv" --compare tests/baseline_pre_step2.json`
(`baseline_v5.json` = original v5 builder, `baseline_pre_step2.json` = after the substitution fix)

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
| EDHREC `json.edhrec.com/pages/commanders/<slug>[/<bracket>].json` | Popularity, synergy, lift per commander and per bracket, theme tags | `cache/edhrec_v4.json` (seeded from `edhrec_v3.json`; old pages upgraded when next fetched online) |
| Commander Spellbook `POST /find-my-combos` | Combos owned and one card away, one query per color identity (`ci:<WUBRG>:<hash>`) | `cache/spellbook.json` |
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
6. Pass 2 per commander: `build_pool` (owned cards in color identity) → `analyze()` per bracket
   → `combos_for_commander` → combos-in-deck detection.
7. `analyze_imported` for each `decks_in/*.txt`.
8. `render_report` injects JSON (`DATA`, `DECKS`, `CARDS`, `BR`, `STATS`) into the `HTML` template.

Key functions:
- `analyze()` – builds the 99. One ranked list (heap): owned cards at their play rate vs. missing cards
  (rate ≥ `SUB_MIN`) at rate × closeness of the best owned stand-in × `STANDIN` (0.6; lands ×1) → role
  fill (`ROLE_TARGETS`) → basics. Non-land rates are `blended_rates()` (bracket page pulled toward the
  all-decks page by `SHRINK_DECKS`=200 decklists); lands use the raw bracket rate. Only cards from
  `build_pool` (owned, legal, in color identity). Game Changers capped by `GC_CAP` (B1/B2: 0, B3: 3). Also builds `gaps` (top `GAP_SHOW` missing cards with up to 3 owned alternatives).
- `find_subs()` – closeness 0–1 of owned stand-ins: share of the missing card's roles × card kind
  (creature/spell/land; ×0.75 for a different card type, instant = sorcery) × mana value distance ×
  `OFF_TYPE` (0.4) if the missing card has a type the commander names (`commander_types()`, e.g. Dragon
  for Ureni; from `TYPE_VOCAB`, subtypes only when capitalised) and the stand-in doesn't. Below
  `SUB_MATCH_MIN` (0.35) nothing is offered. Lands matched by colors produced. Example that motivated
  this: v5 put Spider-Man in Ureni's deck "for" Bloomvine Regent because both fetch lands.
- `CardTable` – deduplicated card list for the report; decks reference cards by index (keeps HTML small).
- "% owned" = weighted share of the EDHREC template (top ≤99 cards at ≥10% inclusion) that is owned.

App mode (`--serve`, `serve()` + `Rebuild`): stdlib `ThreadingHTTPServer` on 127.0.0.1. `GET /` serves
report.html, `GET /status` reports rebuild progress, `POST /upload` (needs header `X-Deck-Wizard: 1`, blocks
cross-site posts) checks the CSV header, saves it to `collection/`, and reruns the normal pipeline as a
child process with the same options. `collection_changes()` keeps the added/removed diff in
`cache/last_collection.json`. `save_json` and the report write are atomic (temp file + `os.replace`).

Report features: collection bar (file, changes, upload button when served), bracket slider (switches EDHREC bracket data), filters (search, archetype, color,
min %, min decks, combos), sorts, Scryfall card-image grid with hover preview, gaps & substitutes,
combos, power profile bars, imported decks section.

## Known limitations / things to verify against real data

- `analyze()` is still **EDHREC-first**: EDHREC order decides the deck; the collection only patches gaps.
  This is the main thing to change (see roadmap).
- EDHREC JSON shape is unofficial and could change. Theme tags are read from `panels.taglinks`.
  If many commanders show "no themes found", check the real JSON.
- EDHREC cardviews include a `synergy` field (how much more a card is played with this commander than
  in general). Stored since v4 cache (`cards[key] = [name, rate, synergy, lift, list_tags]`; v3 pages
  only have `[name, rate]`), **not used yet**. It is the best available "commander synergy" signal.
- Scryfall card meta (`SF_VERSION` 2) also stores `mana_cost`, `edhrec_rank`, `keywords`, not used yet.
- EDHREC answers missing pages with HTTP 403. Misses are never cached (a 403 can also be a block).
- Commander Spellbook rate-limits (HTTP 429) and rejects decks over 600 cards (HTTP 400). `http_json`
  waits on 429/5xx (Retry-After, else 15/30/60/120 s) and fails fast on other 4xx. `combo_pool()` sends
  only owned on-color cards that are in some combo (5-color: top 600 by combo count). If Spellbook stops
  answering, `CSB_DOWN` makes the rest of the run skip combos. Failed/partial lookups are not cached.
- Spellbook `/cards/` also has `tutor`, `extraTurn`, `massLandDenial`, `gameChanger` flags per card:
  useful for the planned rule-based Bracket Fit.
- Scryfall Tagger tag names in `TAG_QUERIES` are best guesses; the run prints card counts per role.
  A role with 0 cards means a wrong tag name.
- `power_profile()` is a rough composition summary, not a power rating. Don't build bracket logic on it.
- Imported deck commander detection: `Commander` header, `*CMDR*` tag, or a guess from color identity.

## Roadmap (in order)

1. ✅ Scryfall tags for roles + collection substitutes + visual card view (v5)
2. **Collection-first scoring and deck construction.** Score every legal owned card per commander:
   commander synergy (EDHREC `synergy`, oracle keyword overlap with the commander), theme fit, role,
   curve fit, EDHREC popularity (lower weight than synergy), combo participation, Game Changer status.
   Build the deck from the best-scored owned cards; EDHREC influences scoring but doesn't dictate the list.
3. Three separate numbers: **Collection Match** (current %), **Build Readiness** (quality of the
   generated 99), **Bracket Fit** (rule-based: Game Changer count, two-card combos, tutors,
   mass land denial, chained extra turns; Commander Spellbook also has an estimate-bracket endpoint).
4. Unused cards: cards not in any `decks_in` deck → find commanders/archetypes that use them.
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

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
py deck_wizard.py --csv "Collection_ (1).csv"
```

Useful flags:

| Flag | Purpose |
|---|---|
| `--only "Sephiroth, Fabled SOLDIER;Terra, Herald of Hope"` | Run selected commanders only (fast test) |
| `--limit 20` | First 20 commanders only (fast test) |
| `--brackets core,upgraded,optimized,cedh` | EDHREC bracket pages to pull (add `exhibition` for B1) |
| `--no-combos` | Skip Commander Spellbook |
| `--decks-in DIR` | Folder of decklists (.txt) to score, default `decks_in` |
| `--refresh` | Ignore all caches (slow: re-downloads everything) |
| `--no-open` | Don't open the report in the browser |
| `--offline` | No network; cached data only (tests, quick reruns) |

Deck metrics for comparing builder versions (offline, ~30 s):
`py tests/measure.py --csv "Collection_ (1).csv" --compare tests/baseline_v5.json`

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
| EDHREC `json.edhrec.com/pages/commanders/<slug>[/<bracket>].json` | Popularity per commander and per bracket, theme tags | `cache/edhrec_v3.json` |
| Commander Spellbook `POST /find-my-combos` | Combos owned and one card away | `cache/spellbook.json` |

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
- `analyze()` – builds the 99. Order: popular owned cards (EDHREC rate order) → substitutes for missing
  cards with rate ≥ `SUB_MIN` (0.25) → role fill (`ROLE_TARGETS`) → basics. At exhibition/core, Game
  Changers are excluded. Also builds `gaps` (top `GAP_SHOW` missing cards with up to 3 owned alternatives).
- `find_subs()` – scores owned replacements: shared roles, same card kind, mana value distance, EDHREC rate
  for this commander; lands matched by colors produced; pure synergy cards only replaced by same-kind cards
  this commander's players also run.
- `CardTable` – deduplicated card list for the report; decks reference cards by index (keeps HTML small).
- "% owned" = weighted share of the EDHREC template (top ≤99 cards at ≥10% inclusion) that is owned.

Report features: bracket slider (switches EDHREC bracket data), filters (search, archetype, color,
min %, min decks, combos), sorts, Scryfall card-image grid with hover preview, gaps & substitutes,
combos, power profile bars, imported decks section.

## Known limitations / things to verify against real data

- `analyze()` is still **EDHREC-first**: EDHREC order decides the deck; the collection only patches gaps.
  This is the main thing to change (see roadmap).
- EDHREC JSON shape is unofficial and could change. Theme tags are read from `panels.taglinks`.
  If many commanders show "no themes found", check the real JSON.
- EDHREC cardviews include a `synergy` field (how much more a card is played with this commander than
  in general). It is **not used yet** and is the best available "commander synergy" signal.
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

# One home for everything

| Folder | What it is | Status |
|---|---|---|
| `/` (`src/`, `e2e/`, `worker/`) | **CollectionHub**, the web app | Active |
| `legacy/DeckWizard/` | **DeckWizard**: the original Python / ManaBox deck builder | Reference only. Its collection-first deck logic lives on in `src/brain/` |
| `reference/mtg-commander-deck-generator/` | **MTG Commander Deck Generator** (Manafoundry, MIT): full EDH deck generation & optimization engine | Reference only. Source for deck generator algorithms, curve tuning, combos & explainers |

Both repos were imported with their **full git history**, so `git log -- <folder>` and `git blame` work seamlessly. Original repositories on GitHub are preserved.

**Card Hunt** (`areasmina/card-hunt`) will be brought in later under `integrations/card-hunt/` when ready to connect to the "buy missing cards" feature.
